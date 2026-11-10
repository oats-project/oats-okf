#!/usr/bin/env node
// Proofs for the bridge PR (spec §2), comparing a bridged checkout's working tree with the base ref it was
// generated from:
//
//   node scripts/bridge/verify.mjs <checkout> <base-ref> [--json]
//
// Asserts: no file under knowledge/ at <base-ref> was moved or deleted; every changed file only gained lines
// (pure insertions); each concept gained exactly its bridge keys right after `description:` and its body
// after the frontmatter is byte-identical; okf-base.json kept every node and only added the three reserved
// ones; new files lie only under knowledge/{claims,subjects,verdicts}/; every link that resolved at
// <base-ref> still resolves, and every link in a new or changed file resolves except those already broken
// at <base-ref>. Prints the counts the PR reports. Exit 1 on any failure. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const [checkout, ref] = args.filter(a => !a.startsWith('--'));
if (!checkout || !ref) { console.error('usage: verify.mjs <checkout> <base-ref> [--json]'); process.exit(2); }
const ROOT = path.resolve(checkout);
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 256 << 20 });
const posix = path.posix;
const RESERVED = ['claims', 'subjects', 'verdicts'];
const BRIDGE_KEYS = ['about', 'kind', 'status', 'id'];
const failures = [];
const fail = msg => failures.push(msg);

const before = new Map();
for (const f of git('ls-tree', '-r', '--name-only', ref, '--', 'knowledge').split('\n').filter(Boolean)) {
  before.set(f.slice('knowledge/'.length), git('show', `${ref}:${f}`));
}
const after = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, 'knowledge', dir), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) walk(rel);
    else after.set(rel, fs.readFileSync(path.join(ROOT, 'knowledge', rel), 'utf8'));
  }
})('');

// Pure insertion: the old lines are the new lines with some lines removed (an LCS that keeps every old line).
function insertedLines(oldText, newText) {
  const a = oldText.split('\n'), b = newText.split('\n'), added = [];
  let i = 0;
  for (const line of b) { if (i < a.length && line === a[i]) i++; else added.push(line); }
  return i === a.length ? added : null;
}
const isReserved = rel => ['index.md', 'log.md'].includes(posix.basename(rel));
const fence = text => text.match(/^---\n([\s\S]*?)\n---\n/);

const counts = { unchanged: 0, conceptsChanged: 0, otherChanged: [], added: [] };
for (const [rel, old] of before) {
  if (!after.has(rel)) { fail(`moved or deleted: ${rel}`); continue; }
  const now = after.get(rel);
  if (now === old) { counts.unchanged++; continue; }
  const added = insertedLines(old, now);
  if (!added) { fail(`not a pure insertion: ${rel}`); continue; }
  if (rel === 'okf-base.json') {
    const o = JSON.parse(old), n = JSON.parse(now);
    for (const [k, v] of Object.entries(o.nodes)) assert.deepEqual(n.nodes[k], v, `okf-base.json changed node ${k}`);
    const extra = Object.keys(n.nodes).filter(k => !(k in o.nodes));
    if (JSON.stringify(extra) !== JSON.stringify(RESERVED)) fail(`okf-base.json added ${extra}`);
    for (const k of RESERVED) assert.deepEqual(n.nodes[k], { path: k, owner: '00000000-0000-0000-0000-000000000000' });
    assert.equal(n.version, 1); assert.equal(n.id, o.id);
    counts.otherChanged.push(rel); continue;
  }
  if (isReserved(rel) || !rel.startsWith('nodes/')) { counts.otherChanged.push(rel); continue; }
  const fo = fence(old), fn = fence(now);
  if (!fo || !fn) { fail(`frontmatter missing: ${rel}`); continue; }
  if (old.slice(fo[0].length) !== now.slice(fn[0].length)) { fail(`body changed: ${rel}`); continue; }
  const lines = fn[1].split('\n'), d = lines.findIndex(l => l.startsWith('description:'));
  const keys = added.map(l => (l.match(/^([a-z-]+):/) || [])[1]);
  if (!keys.every(k => BRIDGE_KEYS.includes(k)) || keys[0] !== 'about' || keys.at(-1) !== 'id') fail(`unexpected keys in ${rel}: ${keys}`);
  if (JSON.stringify(lines.slice(d + 1, d + 1 + added.length)) !== JSON.stringify(added)) fail(`keys not right after description: ${rel}`);
  counts.conceptsChanged++;
}
for (const rel of after.keys()) if (!before.has(rel)) {
  if (!RESERVED.includes(rel.split('/')[0])) fail(`new file outside the reserved nodes: ${rel}`);
  counts.added.push(rel);
}

// Links. Resolution as in the OKF validator: base-root absolute or relative to the file; directories count.
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;
function target(from, t) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//')) return null;
  const clean = t.split('#')[0];
  if (!clean) return null;
  return clean.startsWith('/') ? posix.normalize(clean.slice(1)) : posix.normalize(posix.join(posix.dirname(from), clean));
}
const resolves = (files, t) => files.has(t) || files.has(posix.join(t.replace(/\/$/, ''), 'index.md'));
function brokenLinks(files) {
  const out = [];
  let total = 0;
  for (const [rel, text] of files) {
    if (!rel.endsWith('.md')) continue;
    for (const m of text.matchAll(LINK_RE)) {
      const t = target(rel, m[1]);
      if (t === null) continue;
      total++;
      if (!resolves(files, t)) out.push(`${rel} -> ${m[1]}`);
    }
  }
  return { total, broken: out.sort() };
}
const linksBefore = brokenLinks(before), linksAfter = brokenLinks(after);
const preBroken = new Set(linksBefore.broken);
for (const b of linksAfter.broken) if (!preBroken.has(b)) fail(`new broken link: ${b}`);
for (const b of linksBefore.broken) if (!linksAfter.broken.includes(b)) fail(`pre-broken link changed: ${b}`);

// Counts.
const fmValue = (text, key) => (text.match(new RegExp(`^${key}: (.*)$`, 'm')) || [])[1];
const concepts = [...after].filter(([rel]) => rel.startsWith('nodes/') && rel.endsWith('.md') && !isReserved(rel));
for (const [rel, text] of concepts) if (!fence(text) || !fmValue(fence(text)[1], 'about') || !fmValue(fence(text)[1], 'id')) fail(`concept without about/id: ${rel}`);
const fmOf = text => (fence(text) || [, ''])[1];
const aboutLen = ([, text]) => (fmValue(fmOf(text), 'about') || '').slice(1, -1).split(',').length;
const subjects = [...after.keys()].filter(r => /^subjects\/(system|workstream|project)\/[a-z0-9-]+\.md$/.test(r));
const views = [...after.keys()].filter(r => /^subjects\/(system|workstream|project)\/[a-z0-9-]+\/index\.md$/.test(r));
const ids = concepts.map(([, t]) => fmValue(fmOf(t), 'id'));
if (new Set(ids).size !== ids.length || ids.some(i => !/^(dec|ins|ref|pb)-[0-9a-f]{12}$/.test(i))) fail('ids not unique or malformed');
const result = {
  ref: git('rev-parse', '--short=12', ref).trim(),
  concepts: concepts.length,
  about: { N1: concepts.filter(c => aboutLen(c) === 1).length, N2: concepts.filter(c => aboutLen(c) === 2).length,
    N3plus: concepts.filter(c => aboutLen(c) >= 3).length },
  subjects: subjects.length, generatedIndexes: views.length + (after.has('subjects/index.md') ? 1 : 0),
  filesBefore: before.size, unchanged: counts.unchanged, conceptsChanged: counts.conceptsChanged,
  otherChanged: counts.otherChanged.sort(), added: counts.added.length,
  links: { before: linksBefore.total, after: linksAfter.total, preBroken: linksBefore.broken, newBroken: linksAfter.broken.filter(b => !preBroken.has(b)) },
  failures,
};
console.log(JSON.stringify(result, null, args.includes('--json') ? 0 : 2));
process.exit(failures.length ? 1 : 0);
