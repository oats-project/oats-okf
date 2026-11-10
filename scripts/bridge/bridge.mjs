#!/usr/bin/env node
// The bridge conversion for a version-1 OKF base (spec: docs/design/2026-11-10-bridge-pr-oats-knowledge.md §1).
//
//   node scripts/bridge/bridge.mjs <checkout> --reindex <okf-reindex.mjs> [--check] [--date YYYY-MM-DD] [--pr REF] [--report FILE]
//
// <checkout> is a clone of the knowledge repository; the base is its `knowledge/` directory.
// In place, no moves: it adds the three reserved nodes to okf-base.json, writes the subject files,
// claims/index.md and the reserved nodes' logs, inserts `about:`, `kind:` (and `status:` for Roadmap) and
// `id:` after each concept's `description:` line, and adds one line to the root log.md; then the layer's
// regenerator (oats.okf 6.0 okf-reindex.mjs, --reindex) writes the generated views. It changes no other line
// and no concept body (asserted per file). It is deterministic (no clock, no locale) and idempotent: a second
// run writes nothing. `--check` writes nothing and exits 1 if a run would change any file or the regenerator
// reports a stale view. No dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const option = (name, fallback) => {
  const at = argv.indexOf(name);
  if (at < 0) return fallback;
  assert(argv[at + 1] && !argv[at + 1].startsWith('--'), `${name} needs a value`);
  return argv[at + 1];
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !['--date', '--pr', '--report', '--reindex'].includes(argv[i - 1]));
if (positional.length !== 1) {
  console.error('usage: bridge.mjs <checkout> [--check] [--date YYYY-MM-DD] [--pr REF] [--report FILE] --reindex OKF_REINDEX');
  process.exit(2);
}
const CHECK = flag('--check');
const DATE = option('--date', '2026-11-10');
assert(/^\d{4}-\d{2}-\d{2}$/.test(DATE), '--date must be YYYY-MM-DD');
const PR = option('--pr', 'the bridge PR (branch `okf-bridge/2026-11-10`)');
const REPORT = option('--report', null);
// --reindex (required): the layer's regenerator, oats.okf 6.0's okf-reindex.mjs. It alone writes and checks the
// generated views (per-subject indexes, subjects/index.md, verdicts/index.md, the root index's Subjects section).
const REINDEX = option('--reindex', null);
assert(REINDEX && fs.existsSync(REINDEX), '--reindex <okf-reindex.mjs> is required (oats.okf 6.0, the subject layer)');
const BASE = path.join(path.resolve(positional[0]), 'knowledge');
assert(fs.existsSync(path.join(BASE, 'okf-base.json')), `no knowledge/okf-base.json under ${positional[0]}`);

const SENTINEL = '00000000-0000-0000-0000-000000000000';
const RESERVED = ['claims', 'subjects', 'verdicts'];

// ---------------------------------------------------------------------------------------------------------
// The subjects (spec §1.2). Descriptions are OATS's own words; `depends-on` is omitted everywhere because
// the layer allows it only where the body cites code, and these bodies do not.
const GH = 'https://github.com/';
const SUBJECTS = [
  ['system', 'oats-kernel', 'OATS kernel and CLI', `${GH}oats-project/oats`, ['oats-direction'], ['oats-kernel-expert'],
    'The OATS kernel and the `oats` CLI: souls, instances, capabilities and the hook contracts between them, spawn, launch and retirement.'],
  ['system', 'oats-desktop', 'OATS Desktop', `${GH}oats-project/oats/tree/main/packages/desktop`, ['oats-direction'], ['oats-desktop-expert'],
    'The OATS Desktop app: it renders the kernel\'s model and drives it through the kernel\'s JSON verbs.'],
  ['system', 'oats-okf', 'oats.okf knowledge package', `${GH}oats-project/oats-okf`, ['knowledge', 'provider-integration'], ['oats-okf-expert'],
    'The knowledge provider: OKF bases and bindings, consultation of accepted knowledge, and how knowledge is proposed and reviewed.'],
  ['system', 'oats-aweb', 'oats.aweb messaging package', `${GH}awebai/oats-aweb`, ['messaging', 'provider-integration'], ['oats-aweb-expert'],
    'The messaging provider on aweb: per-instance identities, teams, and mail and chat delivered into sessions.'],
  ['system', 'oats-jira', 'oats.jira tasks package', `${GH}awebai/oats-jira`, ['coordination', 'provider-integration'], ['oats-jira-expert'],
    'The Jira tasks-layer integration: the `jira-tasks` skill and an advisory spawn hook.'],
  ['system', 'oats-linear', 'oats.linear tasks package', `${GH}awebai/oats-linear`, ['coordination', 'provider-integration'], ['oats-linear-expert'],
    'The Linear tasks-layer integration: the `linear-tasks` skill, an advisory spawn hook and `oats linear` issue commands.'],
  ['system', 'oats-authoring', 'oats.authoring package', `${GH}oats-project/oats-authoring`, ['oats-direction'], ['oats-authoring-expert'],
    'Authoring guidance: skills for routing capability work, writing Agent Skills and writing souls.'],
  ['system', 'oats-apps', 'oats.apps package', `${GH}awebai/oats-apps`, ['provider-integration'], ['oats-apps-expert'],
    'App guidance capabilities `oats.folio` and `oats.library`: aweb apps used from an OATS instance.'],
  ['system', 'oats-cloning', 'oats.cloning package', `${GH}oats-project/oats-cloning`, ['coordination'], [],
    'Cloning a running instance for a new goal.'],
  ['system', 'oats-engineering', 'oats.engineering coordination package', `${GH}oats-project/oats-engineering`, ['coordination'], [],
    'The engineering coordination package: engineering-expert and developer capabilities, adversarial code review and the code-reviewer soul.'],
  ['system', 'aweb', 'aweb', `${GH}awebai/aweb`, ['messaging'], [],
    'The aweb messaging service OATS integrates: identities, teams, mail and chat.'],
  ['workstream', 'oats-direction', 'OATS direction', null, [], ['oats-maintainer'],
    'Stewardship and project-wide decisions: what OATS is, how it ships and is reviewed, and plans that cross areas.'],
  ['workstream', 'coordination', 'Coordination', null, [], ['oats-expert'],
    'How agents and people work together: leads and experts, briefs and plans, review loops and hand-backs.'],
  ['workstream', 'provider-integration', 'Provider integration', null, [], ['integrations-expert'],
    'How a capability is built against the kernel\'s contracts and proven: hook contracts, live rehearsals, what a fake external CLI must model, compensation reporting.'],
  ['workstream', 'operations', 'Operations', null, [], ['oats-operator-expert'],
    'Running OATS deployments: onboarding and rebuilds, migration and cutover, multi-machine layout and first-time adoption.'],
  ['workstream', 'positioning', 'Positioning', null, [], ['market-research-expert'],
    'Dated, attributable research and fair, scoped comparisons of OATS with other approaches.'],
  ['workstream', 'workspace-administration', 'Workspace administration', null, [], ['oats-setup-admin'],
    'Administering a workspace\'s OATS configuration: which changes went wrong and why, how refusals were read, what verification caught.'],
  ['workstream', 'knowledge', 'Knowledge', null, [], [],
    'How OATS keeps knowledge across packages: what counts as knowledge, and how it is consulted, proposed, reviewed and accepted.'],
  ['workstream', 'messaging', 'Messaging', null, [], [],
    'How instances and people message each other across providers: identities, teams, delivery and wakes.'],
  ['project', 'coordination-rethink', 'Coordination rethink', null, ['coordination'], [],
    'The plan to rethink how OATS instances and people coordinate work.'],
  ['project', 'okf-5', 'oats.okf 5', null, ['knowledge'], [],
    'The oats.okf 5 release line.'],
  ['project', 'roster-2026-11', 'Roster, November 2026', null, ['oats-direction', 'coordination'], [],
    'The November 2026 change to the roster of OATS souls.'],
].map(([kind, slug, title, repo, inWorkstreams, legacyNodes, description]) =>
  ({ kind, slug, ref: `${kind}/${slug}`, title, repo, inWorkstreams, legacyNodes, description }));
const SUBJECT_TYPE = { system: 'System', workstream: 'Workstream', project: 'Project' };

// Primary subject per node (design §2.7), from the subjects' legacy-nodes.
const PRIMARY = Object.fromEntries(SUBJECTS.flatMap(s => s.legacyNodes.map(n => [n, s.ref])));
// Secondary by tag: exact tag (all tags in the base are lower case) → subject.
const TAG_SUBJECTS = {
  kernel: 'system/oats-kernel', desktop: 'system/oats-desktop', messaging: 'workstream/messaging',
  knowledge: 'workstream/knowledge', operator: 'workstream/operations', integrations: 'workstream/provider-integration',
};
const LINK_THRESHOLD = 3;
// Old type → [claim type, kind, extra status, id prefix]. `type:` itself is not changed.
const TYPES = {
  Decision: ['Decision', null, null, 'dec'], Roadmap: ['Decision', 'direction', 'proposed', 'dec'],
  Lesson: ['Insight', 'lesson', null, 'ins'], Conclusion: ['Insight', 'finding', null, 'ins'],
  Limitation: ['Insight', 'constraint', null, 'ins'], Reference: ['Reference', null, null, 'ref'],
  Playbook: ['Playbook', null, null, 'pb'],
};
const BRIDGE_KEYS = ['about', 'kind', 'status', 'decided-by', 'id'];
// Reviewed overrides of the type mapping, keyed by base-relative path and applied after it. Each entry is a
// judgement the base's gate made on the bridge PR; every path must exist (a missing file fails the run).
// Keys allowed: status, decided-by.
const OVERRIDES = {
  // A Roadmap maps to status: proposed, but these two record decisions a human took (the base's gate on #342).
  'nodes/oats-maintainer/stewardship/coordination-redesign-precedes-adaptive-onboarding.md': { status: 'decided', 'decided-by': 'human' },
  'nodes/oats-maintainer/stewardship/direct-knowledge-proposals-retain-maintainer-review.md': { status: 'decided', 'decided-by': 'human' },
};
for (const [rel, o] of Object.entries(OVERRIDES)) {
  assert(Object.keys(o).every(k => ['status', 'decided-by'].includes(k)), `override ${rel}: only status and decided-by may be overridden`);
  assert(fs.existsSync(path.join(BASE, rel)), `override names a missing concept: ${rel} (the reviewed overrides table in bridge.mjs must be updated)`);
}

// ---------------------------------------------------------------------------------------------------------
const posix = path.posix;
const read = rel => fs.readFileSync(path.join(BASE, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(BASE, rel));
const isReserved = rel => ['index.md', 'log.md'].includes(posix.basename(rel));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const list = items => `[${items.join(', ')}]`;

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(BASE, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (e.name.endsWith('.md')) out.push(rel);
  }
  return out.sort(cmp);
}

// Split a concept into its frontmatter lines and its body (everything after the closing fence, byte for byte).
function split(text, rel) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert(m, `${rel}: no frontmatter`);
  assert(!m[1].includes('\r'), `${rel}: CR in frontmatter`);
  return { lines: m[1].split('\n'), body: text.slice(m[0].length) };
}
const keyOf = line => (line.match(/^([A-Za-z_][A-Za-z0-9_-]*):/) || [])[1];
// Values as the OKF reader parses them: 5.8.0's scalar rule (an end-of-line ` # comment` and one leading and
// one trailing quote stripped), and the flow-list subset of the layer spec (bare refs or JSON strings).
// Anything else the reader would see differently is refused, never guessed.
const rawValue = (lines, key, rel) => {
  const found = lines.filter(l => keyOf(l) === key);
  assert(found.length <= 1, `${rel}: duplicate ${key}`);
  return found.length ? found[0].match(/^[A-Za-z_][A-Za-z0-9_-]*:\s*(.*)$/)[1] : undefined;
};
const scalar = (lines, key, rel) => {
  const v = rawValue(lines, key, rel);
  return v === undefined ? undefined : v.replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '').trim();
};
const ITEM = String.raw`"(?:[^"\\]|\\.)*"|[A-Za-z0-9_/.:-]+`;
const FLOW_LIST = new RegExp(String.raw`^\[\s*(?:(?:${ITEM})\s*(?:,\s*(?:${ITEM})\s*)*)?\]$`);
const flowList = (lines, key, rel) => {
  const v = (rawValue(lines, key, rel) ?? '').replace(/\s+#.*$/, '').trim();
  assert(FLOW_LIST.test(v), `${rel}: ${key} is not a flow list the reader parses`);
  return (v.slice(1, -1).match(new RegExp(ITEM, 'g')) ?? []).map(x => (x.startsWith('"') ? JSON.parse(x) : x));
};

// Resolve a body link to a base-relative path, or null if external or a pure fragment.
function linkTarget(from, target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  const clean = target.split('#')[0];
  if (!clean) return null;
  return clean.startsWith('/') ? posix.normalize(clean.slice(1)) : posix.normalize(posix.join(posix.dirname(from), clean));
}
const LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/g;

// ---------------------------------------------------------------------------------------------------------
const writes = new Map(); // rel → new text (only where it differs from disk)
function plan(rel, text) {
  const old = exists(rel) ? read(rel) : null;
  if (old !== text) writes.set(rel, text);
}

// 1. okf-base.json: the three reserved nodes, path = name, sentinel owner, appended in fixed order.
const baseText = read('okf-base.json');
const baseJson = JSON.parse(baseText);
assert.equal(JSON.stringify(baseJson, null, 2) + '\n', baseText, 'okf-base.json is not in canonical 2-space form');
assert.equal(baseJson.version, 1, 'okf-base.json must be version 1');
for (const name of RESERVED) {
  const want = { path: name, owner: SENTINEL };
  if (baseJson.nodes[name]) assert.deepEqual(baseJson.nodes[name], want, `okf-base.json: ${name} exists and differs`);
  else baseJson.nodes[name] = want;
}
const owned = Object.keys(baseJson.nodes).filter(n => !RESERVED.includes(n));
for (const n of owned) {
  assert.equal(baseJson.nodes[n].path, `nodes/${n}`, `node ${n} is not at nodes/${n}`);
  assert(PRIMARY[n], `node ${n} has no subject naming it in legacy-nodes`);
}
plan('okf-base.json', JSON.stringify(baseJson, null, 2) + '\n');

// 2. Concepts under nodes/.
const all = walk('nodes');
const conceptPaths = all.filter(r => !isReserved(r));
const conceptSet = new Set(conceptPaths);
const concepts = [];
for (const rel of conceptPaths) {
  const text = read(rel);
  const { lines, body } = split(text, rel);
  const node = rel.split('/')[1];
  const type = scalar(lines, 'type', rel);
  assert(TYPES[type], `${rel}: unmapped type ${type}`);
  const [claimType, kind, mappedStatus, prefix] = TYPES[type];
  const override = OVERRIDES[rel] ?? {};
  const status = override.status ?? mappedStatus;
  const title = scalar(lines, 'title', rel), description = scalar(lines, 'description', rel);
  assert(title && description, `${rel}: title and description are required`);
  assert(!/[\[\]]/.test(title), `${rel}: a title with brackets would break its index link`);
  const tags = flowList(lines, 'tags', rel);

  const primary = PRIMARY[node];
  const reasons = {};
  const add = (ref, why) => { if (ref !== primary) (reasons[ref] ??= []).push(why); };
  for (const tag of tags) if (TAG_SUBJECTS[tag]) add(TAG_SUBJECTS[tag], `tag ${tag}`);
  const linksInto = {};
  for (const m of body.matchAll(LINK_RE)) {
    const t = linkTarget(rel, m[1]);
    if (!t || !conceptSet.has(t)) continue;
    const other = t.split('/')[1];
    if (other !== node) linksInto[other] = (linksInto[other] || 0) + 1;
  }
  for (const [other, n] of Object.entries(linksInto)) if (n >= LINK_THRESHOLD) add(PRIMARY[other], `${n} links into ${other}`);
  const about = [primary, ...Object.keys(reasons).sort(cmp)];
  const id = `${prefix}-${crypto.createHash('sha256').update(rel).digest('hex').slice(0, 12)}`;

  const inserted = [`about: ${list(about)}`];
  if (kind) inserted.push(`kind: ${kind}`);
  if (status) inserted.push(`status: ${status}`);
  if (override['decided-by']) inserted.push(`decided-by: ${override['decided-by']}`);
  inserted.push(`id: ${id}`);

  const d = lines.findIndex(l => keyOf(l) === 'description');
  assert.equal(lines.filter(l => keyOf(l) === 'description').length, 1, `${rel}: one description line`);
  const present = lines.filter(l => BRIDGE_KEYS.includes(keyOf(l)));
  let next;
  if (present.length === 0) next = [...lines.slice(0, d + 1), ...inserted, ...lines.slice(d + 1)];
  else {
    // Idempotence: the bridge keys must be exactly ours, in our place.
    assert.deepEqual(lines.slice(d + 1, d + 1 + inserted.length), inserted, `${rel}: bridge keys present and different`);
    assert.equal(present.length, inserted.length, `${rel}: stray bridge key`);
    next = lines;
  }
  const out = `---\n${next.join('\n')}\n---\n${body}`;
  // The guarantee: removing the inserted lines restores the frontmatter, and the body is byte-identical.
  const again = split(out, rel);
  assert.equal(again.body, body, `${rel}: body changed`);
  assert.deepEqual(again.lines, next, `${rel}: frontmatter did not round-trip`);
  if (!present.length) assert.deepEqual(next.filter((l, i) => !(i > d && i <= d + inserted.length)), lines, `${rel}: frontmatter changed beyond the insertion`);
  plan(rel, out);
  concepts.push({ path: rel, node, type, claimType, kind, id, title, description, about, reasons });
}
assert.equal(new Set(concepts.map(c => c.id)).size, concepts.length, 'id collision');

// 3. Subject files and generated views.
const subjectRefs = new Set(SUBJECTS.map(s => s.ref));
for (const c of concepts) for (const ref of c.about) assert(subjectRefs.has(ref), `${c.path}: unknown subject ${ref}`);
for (const s of SUBJECTS) for (const w of s.inWorkstreams) assert(subjectRefs.has(`workstream/${w}`), `${s.ref}: unknown workstream ${w}`);
for (const s of SUBJECTS) for (const n of s.legacyNodes) assert(owned.includes(n), `${s.ref}: legacy node ${n} not in okf-base.json`);

for (const s of SUBJECTS) {
  const fm = [`type: ${SUBJECT_TYPE[s.kind]}`, `title: ${s.title}`, `description: ${s.description}`];
  if (s.repo) fm.push(`repo: ${s.repo}`);
  if (s.inWorkstreams.length) fm.push(`in-workstreams: ${list(s.inWorkstreams.map(w => `workstream/${w}`))}`);
  fm.push('status: active');
  if (s.legacyNodes.length) fm.push(`legacy-nodes: ${list(s.legacyNodes)}`);
  const facts = [];
  if (s.legacyNodes.length) facts.push(`Legacy node${s.legacyNodes.length > 1 ? 's' : ''}: ${s.legacyNodes.map(n => `[${n}](/nodes/${n}/index.md)`).join(', ')}.`);
  if (s.repo) facts.push(`Repository: <${s.repo}>.`);
  const body = `\n# ${s.title}\n${facts.length ? `\n${facts.join(' ')}\n` : ''}`;
  plan(`subjects/${s.kind}/${s.slug}.md`, `---\n${fm.join('\n')}\n---\n${body}`);

}
plan('claims/index.md', '# Claims\n\nOne file per claim under `claims/<type-plural>/`, each with `id:` and `about:`. None yet.\n');
const nodeLog = name => `# ${name} log\n\n## ${DATE}\n\n* **Creation**: Reserved node added by ${PR}.\n`;
for (const name of RESERVED) plan(`${name}/log.md`, nodeLog(name));

// 4. Root log: one dated line naming this PR, newest first (replaced on rerun).
const MARK = '* **Update**: Bridge to the subject layout';
const nodesCount = Object.keys(baseJson.nodes).length;
const logLine = `${MARK}, by ${PR}: the reserved nodes [claims](/claims/index.md), [subjects](/subjects/index.md) and [verdicts](/verdicts/index.md) under a placeholder owner, ${SUBJECTS.length} [subject files](/subjects/index.md) with generated views, and \`about:\`, \`kind:\` and \`id:\` frontmatter on all ${concepts.length} concepts. No file moved and no concept body changed. The base declares ${nodesCount} nodes.`;
let rootLog = read('log.md').split('\n').filter(l => !l.startsWith(MARK)).join('\n');
const dateHead = `## ${DATE}\n\n`;
const first = rootLog.indexOf('\n## ');
assert(first >= 0, 'root log.md has no dated section');
if (rootLog.slice(first + 1).startsWith(dateHead)) {
  const at = first + 1 + dateHead.length;
  rootLog = rootLog.slice(0, at) + logLine + '\n' + rootLog.slice(at);
} else rootLog = rootLog.slice(0, first + 1) + dateHead + logLine + '\n\n' + rootLog.slice(first + 1);
plan('log.md', rootLog);

// ---------------------------------------------------------------------------------------------------------
const secondary = concepts.filter(c => c.about.length > 1);
const report = {
  date: DATE, concepts: concepts.length, subjects: SUBJECTS.length, nodes: nodesCount,
  generatedIndexes: SUBJECTS.length + 1,
  about: { one: concepts.filter(c => c.about.length === 1).length, two: concepts.filter(c => c.about.length === 2).length,
    threePlus: concepts.filter(c => c.about.length >= 3).length, edges: concepts.reduce((n, c) => n + c.about.length, 0) },
  types: Object.fromEntries(Object.keys(TYPES).map(t => [t, concepts.filter(c => c.type === t).length])),
  perSubject: Object.fromEntries(SUBJECTS.map(s => [s.ref, concepts.filter(c => c.about.includes(s.ref)).length])),
  secondary: secondary.map(c => ({ path: c.path, about: c.about, reasons: c.reasons })),
  changes: [...writes.keys()].sort(cmp),
};
if (REPORT) fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
if (CHECK) {
  if (writes.size) { console.error(`check: ${writes.size} file(s) would change:\n${[...writes.keys()].slice(0, 20).join('\n')}`); process.exit(1); }
  try { execFileSync(process.execPath, [REINDEX, BASE, '--check'], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { console.error(`check: the regenerator reports stale views:\n${e.stdout}`); process.exit(1); }
  console.log(`check: clean (${concepts.length} concepts, ${SUBJECTS.length} subjects, views current by okf-reindex)`);
} else {
  for (const [rel, text] of writes) {
    fs.mkdirSync(path.dirname(path.join(BASE, rel)), { recursive: true });
    fs.writeFileSync(path.join(BASE, rel), text);
  }
  execFileSync(process.execPath, [REINDEX, BASE], { stdio: ['ignore', 'ignore', 'inherit'] });
  const { secondary: _s, changes: _c, ...summary } = report;
  console.log(JSON.stringify({ ...summary, written: writes.size }, null, 2));
}
