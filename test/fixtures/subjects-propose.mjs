// oats.okf 6.0 test fixture (moved from test/okf6-subjects-propose.test.mjs,
// unchanged): one Git base `kb` (the bridged fixture, or the plain one) in a
// local bare remote, the soul `source` with a given okf.json, its live home
// `src`, and gh as a local adapter (no GitHub).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isolatedGit } from './isolated-git.mjs';
import { writePlainBase, bridge, reindex } from './bridged-base.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CLI = join(ROOT, 'oats-package/capabilities/oats-okf/bin/oats-okf.mjs');
export const write = (file, text) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
export const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
export const CREATED = '2026-11-10T08:00:00.000Z';
export const FAKE_GH = String.raw`const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const a = process.argv.slice(2), state = process.env.FIXTURE_GH_STATE;
const s = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')) : { prs: [] };
const input = a.includes('--body-file') && a[a.indexOf('--body-file') + 1] === '-' ? fs.readFileSync(0, 'utf8') : null;
const save = () => fs.writeFileSync(state, JSON.stringify(s));
if (a[0] === 'pr' && a[1] === 'list') { console.log('[]'); process.exit(0); }
// The preflight's read of repos/<name>: push permission, canonical name and
// node id, one per line, as gh prints them; FIXTURE_GH_CANONICAL stands for a
// repository renamed or transferred from the name asked, and a differing
// name is read back by itself (FIXTURE_GH_READBACK: another answer).
if (a[0] === 'api' && String(a[3]).startsWith('repos/')) {
  const name = process.env.FIXTURE_GH_CANONICAL ?? a[3].slice('repos/'.length);
  console.log(a[5] === '.full_name, .node_id' ? (process.env.FIXTURE_GH_READBACK ?? name + '\nR_kb') : [process.env.FIXTURE_GH_PUSH ?? 'true', name, 'R_kb'].join('\n')); process.exit(0);
}
if (a[0] === 'api') { console.log(process.env.FIXTURE_GH_PUSH ?? 'true'); process.exit(0); }
// Every write and read-back names the canonical repository, never a redirect.
if (['label', 'pr'].includes(a[0]) && !(a[0] === 'pr' && a[1] === 'list') && a[a.indexOf('--repo') + 1] !== (process.env.FIXTURE_GH_CANONICAL ?? 'acme/kb')) { console.error('fixture gh: not the canonical repository'); process.exit(97); }
if (a[0] === 'label' && a[1] === 'create') process.exit(0);
if (a[0] === 'pr' && a[1] === 'create') {
  s.prs.push({ head: a[a.indexOf('--head') + 1], label: a[a.indexOf('--label') + 1], title: a[a.indexOf('--title') + 1], body: input }); save();
  console.log('https://github.com/acme/kb/pull/' + s.prs.length); process.exit(0);
}
if (a[0] === 'pr' && a[1] === 'view') {
  const pr = s.prs[Number(a[2]) - 1];
  const oid = execFileSync('git', ['--git-dir', process.env.FIXTURE_REMOTE, 'rev-parse', 'refs/heads/' + pr.head], { encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ state: 'OPEN', headRefOid: oid, headRefName: pr.head, baseRefName: 'main', isCrossRepository: false, title: pr.title, body: pr.body }));
  process.exit(0);
}
console.error('unsupported fixture gh call'); process.exit(97);
`;
export const UNSTAMPED = 'claims/insights/merged-unstamped.md';
export const OLD_UNSTAMPED = 'peer/merged-unstamped.md';
export const V1 = { version: 1, owner: 'source', owns: ['kb/expert'], reads: ['kb/peer'] };
export const V2 = { version: 2, subjects: ['system/okf', 'workstream/knowledge'] };

/** One Git base `kb` (the bridged fixture, or the plain one), the soul `source`
 *  with the given okf.json, and its live home `src`. */
export function fixture(t, { decl = V1, plain = false, ident = false, identTitle = false, large = false, unstamped = false, oldNodeUnstamped = false } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'okf6-subjects-propose-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const d = join(dir, 'deployment'), home = join(d, 'agents', 'source', 'instances', 'src'), soul = join(d, 'agents', 'source', 'souls', 'abc');
  const origin = join(dir, 'origin.git'), user = join(dir, 'user'), bin = isolatedGit(dir, '/dev/null'), seed = join(dir, 'seed');
  fs.mkdirSync(user, { recursive: true });
  writePlainBase(seed, { id: 'kb-1', owners: { expert: 'source', peer: 'other' } }); if (!plain) bridge(seed);
  if (ident) fs.appendFileSync(join(seed, 'peer/lesson.md'), '\n$Id$\n');
  if (large) fs.appendFileSync(join(seed, 'peer/lesson.md'), `\n${'Long accepted body. '.repeat(900000)}\n`);
  // okf 6.0.2 (#138): an accepted claim merged without the maintainer's id stamp.
  if (unstamped) { write(join(seed, UNSTAMPED), '---\ntype: Insight\ntitle: Merged without its id\ndescription: x\nabout: [system/okf]\n---\n\n# Merged without its id\n'); reindex(seed); }
  // #140: an accepted old-node concept merged without the maintainer's id stamp
  // (a version-1 proposal merged without the amend-and-merge).
  if (oldNodeUnstamped) {
    write(join(seed, OLD_UNSTAMPED), '---\ntype: Lesson\ntitle: Merged into an old node without its id\ndescription: x\nabout: [workstream/knowledge]\n---\n\n# Merged into an old node without its id\n');
    fs.appendFileSync(join(seed, 'peer/index.md'), '* [Merged into an old node without its id](merged-unstamped.md) - x\n');
    reindex(seed);
  }
  if (identTitle) {
    const f = join(seed, 'claims/insights/consult-reads-one-blob.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('title: Consult reads one committed index', 'title: Consult reads one committed index $Id$'));
    reindex(seed);
  }
  const env = { HOME: user, PATH: `${bin}:${join(dir, 'ghbin')}:${dirname(process.execPath)}:/usr/bin:/bin`, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LANG: 'C' };
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, env, encoding: 'utf8' }).trim();
  git(seed, 'init', '-q', '-b', 'main'); git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'accepted');
  git(dir, 'clone', '-q', '--bare', seed, origin);
  const bindingsFile = join(d, 'okf-bindings.json');
  json(bindingsFile, { version: 1, stateDir: join(dir, 'state'), bases: { kb: { id: 'kb-1', kind: 'git', repository: origin, root: '.', acceptedBranch: 'main', pr: { repository: 'acme/kb' } } } });
  write(join(soul, 'soul.yaml'), 'schemaVersion: 2\nname: source\nknowledge: oats.okf\n');
  json(join(soul, 'okf.json'), decl);
  json(join(home, 'instance.json'), { agent: 'source', kind: 'persistent', instance: 'src', home, soulDir: soul, createdAt: CREATED, capabilities: [{ id: 'oats.okf', layer: 'knowledge' }] });
  json(join(home, 'okf-harvest-policy.json'), { version: 1, harvest: 'on', reason: 'default' });
  write(join(home, 'notes', 'n.md'), '---\ntype: Decision\n---\nA note.\n');
  fs.mkdirSync(join(dir, 'ghbin'));
  fs.writeFileSync(join(dir, 'ghbin', 'gh'), `#!${process.execPath}\n${FAKE_GH}`, { mode: 0o755 });
  const ghState = join(dir, 'gh-state.json');
  const run = args => {
    const e = { ...env, OATS_SOUL: soul, OATS_SETTINGS: JSON.stringify({ 'bindings-file': bindingsFile }), OATS_TEAM_SCOPE: d, OATS_INSTANCE_HOME: home, OATS_INSTANCE: 'src',
      FIXTURE_GH_STATE: ghState, FIXTURE_REMOTE: origin };
    const r = spawnSync(process.execPath, [CLI, 'propose', ...args, '--json'], { cwd: home, env: e, encoding: 'utf8', timeout: 120000 });
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* asserted */ }
    assert.ok(out, `propose answered JSON: ${r.stdout}${r.stderr}`);
    return { status: r.status, out };
  };
  return { dir, home, origin, git, run, prs: () => fs.existsSync(ghState) ? JSON.parse(fs.readFileSync(ghState, 'utf8')).prs : [] };
}
export const ok = r => { assert.equal(r.status, 0, JSON.stringify(r.out)); return r.out.result; };
export const refused = (r, code, pattern) => { assert.equal(r.status, 1, JSON.stringify(r.out)); assert.equal(r.out.error.code, code, JSON.stringify(r.out.error)); if (pattern) assert.match(r.out.error.message, pattern); return r.out.error; };
export const PROPOSAL = '# OKF proposal: owners are pinned before the first read\n\n## What\nA decision about the knowledge package.\n\n## Why\nA future instance would otherwise pin late.\n\n## Evidence\nObserved while building the subject layer.\n\n## Backing notes\n- notes/n.md\n';
export const CLAIM = (extra = '') => `---\ntype: Decision\ntitle: Pin owners before the first read\ndescription: The owner is pinned before any consult read.${extra}\n---\n\n# Pin owners before the first read\n\nPinned early.\n`;
export const edit = (plan, path, text) => { write(join(plan.bases[0].clone, path), text); fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL); return plan.bases[0].clone; };
