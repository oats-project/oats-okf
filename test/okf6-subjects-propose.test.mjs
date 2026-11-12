import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isolatedGit } from './fixtures/isolated-git.mjs';
import { writePlainBase, bridge, reindex, REJECTED, VALIDATE } from './fixtures/bridged-base.mjs';
// oats.okf 6.0, the subject layout in `oats okf propose` (spec
// docs/design/2026-11-10-subject-layer-in-oats-okf.md §3): on a bridged base a
// version-1 soul's claim gets about: from legacy-nodes, the generated indexes
// are regenerated, the write surface and the verdict lanes are checked, and a
// version-2 soul proposes under claims/ with provenance v3 subjects. Real Git,
// a local bare remote and the shipped helper; gh is a local adapter (no GitHub).
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = join(ROOT, 'oats-package/capabilities/oats-okf/bin/oats-okf.mjs');
const { parseProvenance } = await import(new URL('../oats-package/capabilities/oats-okf-maintenance/lib/provenance.mjs', import.meta.url));
const write = (file, text) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
const CREATED = '2026-11-10T08:00:00.000Z';
const FAKE_GH = String.raw`const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const a = process.argv.slice(2), state = process.env.FIXTURE_GH_STATE;
const s = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')) : { prs: [] };
const input = a.includes('--body-file') && a[a.indexOf('--body-file') + 1] === '-' ? fs.readFileSync(0, 'utf8') : null;
const save = () => fs.writeFileSync(state, JSON.stringify(s));
if (a[0] === 'pr' && a[1] === 'list') { console.log('[]'); process.exit(0); }
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
const UNSTAMPED = 'claims/insights/merged-unstamped.md';
const OLD_UNSTAMPED = 'peer/merged-unstamped.md';
const V1 = { version: 1, owner: 'source', owns: ['kb/expert'], reads: ['kb/peer'] };
const V2 = { version: 2, subjects: ['system/okf', 'workstream/knowledge'] };

/** One Git base `kb` (the bridged fixture, or the plain one), the soul `source`
 *  with the given okf.json, and its live home `src`. */
function fixture(t, { decl = V1, plain = false, ident = false, identTitle = false, large = false, unstamped = false, oldNodeUnstamped = false } = {}) {
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
const ok = r => { assert.equal(r.status, 0, JSON.stringify(r.out)); return r.out.result; };
const refused = (r, code, pattern) => { assert.equal(r.status, 1, JSON.stringify(r.out)); assert.equal(r.out.error.code, code, JSON.stringify(r.out.error)); if (pattern) assert.match(r.out.error.message, pattern); return r.out.error; };
const PROPOSAL = '# OKF proposal: owners are pinned before the first read\n\n## What\nA decision about the knowledge package.\n\n## Why\nA future instance would otherwise pin late.\n\n## Evidence\nObserved while building the subject layer.\n\n## Backing notes\n- notes/n.md\n';
const CLAIM = (extra = '') => `---\ntype: Decision\ntitle: Pin owners before the first read\ndescription: The owner is pinned before any consult read.${extra}\n---\n\n# Pin owners before the first read\n\nPinned early.\n`;
const edit = (plan, path, text) => { write(join(plan.bases[0].clone, path), text); fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL); return plan.bases[0].clone; };

test('version 1 on a bridged base: the plan shows the generated indexes; check adds about: from legacy-nodes and regenerates; apply opens the PR', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'pin']));
  assert.deepEqual([plan.bases[0].layout, plan.bases[0].surface], ['subjects', ['expert/', 'index.md', 'the generated indexes (regenerated by --check)']]);
  const clone = edit(plan, 'expert/pin.md', CLAIM());
  fs.appendFileSync(join(clone, 'expert/index.md'), '* [Pin owners before the first read](pin.md) - The owner is pinned before any consult read.\n');
  const checked = ok(f.run(['--check', '--slug', 'pin']));
  assert.deepEqual(checked.bases[0].changed, ['M expert/index.md', 'A expert/pin.md', 'M subjects/system/okf/index.md']);
  assert.match(checked.bases[0].diff, /\+about: \[system\/okf\]\n/);
  assert.match(checked.bases[0].diff, /\+\* \[Pin owners before the first read\]\(\/expert\/pin\.md\) - The owner is pinned before any consult read\./);
  assert.match(fs.readFileSync(join(clone, 'expert/pin.md'), 'utf8'), /^description: .*\nabout: \[system\/okf\]\n---/m, 'the clone carries what is checked');
  assert.equal(ok(f.run(['--check', '--slug', 'pin'])).digest, checked.digest, 'check is idempotent');
  const [pr] = ok(f.run(['--apply', '--slug', 'pin', '--digest', checked.digest])).prs;
  const [created] = f.prs();
  const block = parseProvenance(created.body);
  assert.equal(block.valid, true, JSON.stringify(block.problems));
  assert.deepEqual([block.value.source.owner, block.value.source.ownedNodes, block.value.source.subjects], ['source', ['kb/expert'], undefined]);
  assert.match(f.git(f.dir, '--git-dir', f.origin, 'show', `${pr.head}:subjects/system/okf/index.md`), /\(\/expert\/pin\.md\)/);
});

test('version 1 on a bridged base: E_SUBJECT when no subject absorbs the owned node; E_OWNER for another node, as before', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'pin']));
  const clone = edit(plan, 'peer/pin.md', CLAIM('\nabout: [workstream/knowledge]'));
  refused(f.run(['--check', '--slug', 'pin']), 'E_OWNER', /peer\/pin\.md.*node kb\/peer, which this soul does not own/);
  fs.rmSync(join(clone, 'peer/pin.md'));
  write(join(clone, 'expert/pin.md'), CLAIM());
  const subject = join(clone, 'subjects/system/okf.md');
  fs.writeFileSync(subject, fs.readFileSync(subject, 'utf8').replace('legacy-nodes: [expert]', 'legacy-nodes: []'));
  refused(f.run(['--check', '--slug', 'pin']), 'E_SUBJECT', /no subject on this base names node expert in its legacy-nodes/);
});

test('version 2: plan shows the subject write surface; a claim under claims/ (no id) checks and applies with provenance v3 subjects', t => {
  const f = fixture(t, { decl: V2 }), plan = ok(f.run(['--plan', '--slug', 'pin']));
  assert.deepEqual(plan.bases[0].surface, ['claims/', 'new subjects/system/ and subjects/project/ files', 'status: superseded on a concept it supersedes', 'the generated indexes (regenerated by --check)']);
  assert.match(plan.next, /claims\/, with about: \[<kind>\/<slug>\] on each claim and no id/);
  edit(plan, 'claims/decisions/pin.md', CLAIM('\nabout: [system/okf]'));
  const checked = ok(f.run(['--check', '--slug', 'pin']));
  assert.deepEqual(checked.bases[0].changed, ['A claims/decisions/pin.md', 'M subjects/system/okf/index.md']);
  ok(f.run(['--apply', '--slug', 'pin', '--digest', checked.digest]));
  const block = parseProvenance(f.prs()[0].body);
  assert.equal(block.valid, true, JSON.stringify(block.problems));
  assert.deepEqual([block.value.source.owner, block.value.source.subjects, block.value.source.ownedNodes, block.value.source.readNodes, block.value.source.bases.map(b => b.alias)],
    [null, ['system/okf', 'workstream/knowledge'], [], [], ['kb']]);
});

test('version 2 on a base holding a claim merged without id (#138): check and apply work; the accepted unstamped claim is a W_ID_MISSING warning, not E_VALIDATION; the proposal\'s own claim still needs no id', t => {
  const f = fixture(t, { decl: V2, unstamped: true }), plan = ok(f.run(['--plan', '--slug', 'pin']));
  const at = plan.bases[0].accepted.slice(0, 12), w = `W_ID_MISSING: 1 claim lacks an id at kb@${at}; the maintainer stamps it (knowledge-review)`;
  edit(plan, 'claims/decisions/pin.md', CLAIM('\nabout: [system/okf]'));
  const checked = ok(f.run(['--check', '--slug', 'pin']));
  assert.deepEqual(checked.warnings, [w]);
  assert.deepEqual(checked.bases[0].changed, ['A claims/decisions/pin.md', 'M subjects/system/okf/index.md'], 'the accepted unstamped claim is not touched');
  const applied = ok(f.run(['--apply', '--slug', 'pin', '--digest', checked.digest]));
  assert.deepEqual([applied.warnings, applied.prs.length], [[w], 1]);
});

test('version 1 on a base holding a claim merged without id (#138): check warns W_ID_MISSING; another validation finding still refuses E_VALIDATION', t => {
  const f = fixture(t, { unstamped: true }), plan = ok(f.run(['--plan', '--slug', 'pin']));
  const clone = edit(plan, 'expert/pin.md', CLAIM());
  fs.appendFileSync(join(clone, 'expert/index.md'), '* [Pin owners before the first read](pin.md) - The owner is pinned before any consult read.\n');
  assert.deepEqual(ok(f.run(['--check', '--slug', 'pin'])).warnings, [`W_ID_MISSING: 1 claim lacks an id at kb@${plan.bases[0].accepted.slice(0, 12)}; the maintainer stamps it (knowledge-review)`]);
  write(join(clone, 'expert/pin.md'), CLAIM('\nid: dec-000000000001'));
  const error = refused(f.run(['--check', '--slug', 'pin']), 'E_VALIDATION', /id dec-000000000001 is also/);
  assert.doesNotMatch(error.message, /missing 'id'/, 'the tolerated finding is not among the refusals');
});

test('an old-node concept merged without id (#140): check warns W_ID_MISSING for version 2 and version 1, counts it with an unstamped claims/ concept, and leaves it untouched; okf-validate --strict still reports it', t => {
  const warning = (n, plan) => `W_ID_MISSING: ${n === 1 ? '1 claim lacks' : `${n} claims lack`} an id at kb@${plan.bases[0].accepted.slice(0, 12)}; the maintainer stamps ${n === 1 ? 'it' : 'them'} (knowledge-review)`;
  const v2 = fixture(t, { decl: V2, oldNodeUnstamped: true }), plan2 = ok(v2.run(['--plan', '--slug', 'pin']));
  const clone = edit(plan2, 'claims/decisions/pin.md', CLAIM('\nabout: [system/okf]'));
  const checked = ok(v2.run(['--check', '--slug', 'pin']));
  assert.deepEqual(checked.warnings, [warning(1, plan2)]);
  assert.deepEqual(checked.bases[0].changed, ['A claims/decisions/pin.md', 'M subjects/system/okf/index.md'], 'the accepted unstamped concept is not touched');
  const strict = spawnSync(process.execPath, [VALIDATE, clone, '--strict', '--json'], { encoding: 'utf8' });
  assert.ok(JSON.parse(strict.stdout).warnings.includes(`${OLD_UNSTAMPED}: missing 'id' (stamped by the maintainer at acceptance)`), strict.stdout);
  const applied = ok(v2.run(['--apply', '--slug', 'pin', '--digest', checked.digest]));
  assert.deepEqual([applied.warnings, applied.prs.length], [[warning(1, plan2)], 1]);

  const v1 = fixture(t, { oldNodeUnstamped: true, unstamped: true }), plan1 = ok(v1.run(['--plan', '--slug', 'pin']));
  const clone1 = edit(plan1, 'expert/pin.md', CLAIM());
  fs.appendFileSync(join(clone1, 'expert/index.md'), '* [Pin owners before the first read](pin.md) - The owner is pinned before any consult read.\n');
  assert.deepEqual(ok(v1.run(['--check', '--slug', 'pin'])).warnings, [warning(2, plan1)]);
  // Another strict finding on an untouched file still refuses.
  write(join(clone1, 'expert/pin.md'), CLAIM('\nid: dec-000000000001'));
  const error = refused(v1.run(['--check', '--slug', 'pin']), 'E_VALIDATION', /id dec-000000000001 is also/);
  assert.doesNotMatch(error.message, /missing 'id'/);
});

test('version 2: E_SCOPE for verdicts/, a workstream subject, an old-node file and a supersession no claim makes', t => {
  for (const [path, text, rule] of [
    ['verdicts/dec-000000000099.md', '---\ntype: Verdict\n---\n', /verdicts\/dec-000000000099\.md: only the knowledge maintainer writes verdicts\//],
    ['subjects/workstream/new.md', '---\ntype: Workstream\ntitle: New\ndescription: x\n---\n', /subjects\/workstream\/new\.md: workstreams change only on a person's cited acceptance/],
    ['peer/lesson.md', null, /peer\/lesson\.md: outside the write surface/],
    ['peer/lesson.md', 'status', /peer\/lesson\.md: status: superseded only on a concept a claim of this proposal supersedes/],
  ]) {
    const f = fixture(t, { decl: V2 }), plan = ok(f.run(['--plan', '--slug', 'pin']));
    const clone = edit(plan, 'claims/decisions/pin.md', CLAIM('\nabout: [system/okf]'));
    if (text === 'status') fs.writeFileSync(join(clone, path), fs.readFileSync(join(clone, path), 'utf8').replace('id: ins-000000000002', 'id: ins-000000000002\nstatus: superseded'));
    else if (text) write(join(clone, path), text); else fs.appendFileSync(join(clone, path), 'An edit.\n');
    refused(f.run(['--check', '--slug', 'pin']), 'E_SCOPE', rule);
  }
});

test('version 2: a rejected id without reconsiders refuses E_VERDICT; a title-hash hit goes into the PR body as a candidate', t => {
  const f = fixture(t, { decl: V2 }), plan = ok(f.run(['--plan', '--slug', 'pin']));
  const clone = edit(plan, 'claims/decisions/again.md', `---\ntype: Decision\ntitle: Something\ndescription: x\nabout: [system/okf]\nid: ${REJECTED.id}\n---\n\n# x\n`);
  refused(f.run(['--check', '--slug', 'pin']), 'E_VERDICT', new RegExp(`claims/decisions/again\\.md: claim id ${REJECTED.id} was rejected`));
  write(join(clone, 'claims/decisions/again.md'), `---\ntype: Decision\ntitle: ${REJECTED.title}\ndescription: x\nabout: [system/okf]\n---\n\n# x\n`);
  const checked = ok(f.run(['--check', '--slug', 'pin']));
  assert.match(checked.prBody, /## Verdict candidates\n\n- `claims\/decisions\/again\.md`: title-hash candidate `dec-0000000000aa` \(rejected, Decision\) "Keep a harvester per proposal"/);
  assert.equal(parseProvenance(checked.prBody).valid, true);
});

test('version 2: the write surface judges stored bytes: a status-only supersession of a file the clone ident-expands checks clean', t => {
  const f = fixture(t, { decl: V2, ident: true }), plan = ok(f.run(['--plan', '--slug', 'pin']));
  const clone = edit(plan, 'claims/decisions/pin.md', CLAIM('\nabout: [system/okf]\nsupersedes: [/peer/lesson.md]'));
  write(join(clone, '.git/info/attributes'), 'peer/lesson.md ident\n');
  fs.rmSync(join(clone, 'peer/lesson.md'));
  f.git(clone, 'checkout-index', '--force', '--', 'peer/lesson.md');
  const path = join(clone, 'peer/lesson.md'), expanded = fs.readFileSync(path, 'utf8');
  assert.match(expanded, /\$Id: [0-9a-f]+ \$/, 'the clone shows the expanded ident');
  fs.writeFileSync(path, expanded.replace('id: ins-000000000002', 'id: ins-000000000002\nstatus: superseded'));
  const stored = f.git(clone, 'cat-file', 'blob', f.git(clone, 'hash-object', '--path=peer/lesson.md', '-w', 'peer/lesson.md'));
  assert.equal(stored.replace('\nstatus: superseded', ''), f.git(clone, 'cat-file', 'blob', `${plan.bases[0].accepted}:peer/lesson.md`), 'the stored blob changes only the status');
  ok(f.run(['--check', '--slug', 'pin']));
});

test('version 2: about: and the generated indexes are prepared from stored bytes: an ident expanded in an unchanged claim\'s title never reaches an index', t => {
  const f = fixture(t, { decl: V2, identTitle: true }), plan = ok(f.run(['--plan', '--slug', 'pin']));
  const clone = edit(plan, 'claims/decisions/pin.md', CLAIM('\nabout: [system/okf]'));
  write(join(clone, '.git/info/attributes'), 'claims/insights/consult-reads-one-blob.md ident\n');
  fs.rmSync(join(clone, 'claims/insights/consult-reads-one-blob.md'));
  f.git(clone, 'checkout-index', '--force', '--', 'claims/insights/consult-reads-one-blob.md');
  assert.match(fs.readFileSync(join(clone, 'claims/insights/consult-reads-one-blob.md'), 'utf8'), /title: Consult reads one committed index \$Id: [0-9a-f]+ \$/);
  const checked = ok(f.run(['--check', '--slug', 'pin']));
  assert.deepEqual(checked.bases[0].changed.sort(), ['A claims/decisions/pin.md', 'M subjects/system/okf/index.md'], JSON.stringify(checked.bases[0].changed));
  const view = fs.readFileSync(join(clone, 'subjects/system/okf/index.md'), 'utf8');
  assert.ok(view.includes('[Consult reads one committed index $Id$]') && !view.includes('$Id: '), view);
});

test('version 2: a status-only supersession of an accepted concept over 16 MiB passes the write surface (the accepted bytes are read whole); the content screen\'s own size limit then answers', t => {
  const f = fixture(t, { decl: V2, large: true }), plan = ok(f.run(['--plan', '--slug', 'pin']));
  const clone = edit(plan, 'claims/decisions/pin.md', CLAIM('\nabout: [system/okf]\nsupersedes: [/peer/lesson.md]'));
  const path = join(clone, 'peer/lesson.md');
  assert.ok(fs.statSync(path).size > 16 * 1024 * 1024);
  fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace('id: ins-000000000002', 'id: ins-000000000002\nstatus: superseded'));
  // Not E_SCOPE: the write surface read the 17 MiB accepted blob and saw a status-only change.
  refused(f.run(['--check', '--slug', 'pin']), 'E_CONTENT_INPUT');
});

for (const [name, setup] of [
  ['working-tree-encoding UTF-16LE', (f, clone) => write(join(clone, '.git/info/attributes'), 'subjects/system/okf/index.md working-tree-encoding=UTF-16LE\n')],
  ['a clean filter that changes bytes', (f, clone) => { write(join(clone, '.git/info/attributes'), 'subjects/system/okf/index.md filter=up\n'); f.git(clone, 'config', 'filter.up.clean', 'tr a-z A-Z'); }],
]) test(`version 2: a regenerated index under ${name} in the clone: check twice to one digest, then apply publishes the checked stored bytes`, t => {
  const f = fixture(t, { decl: V2 }), plan = ok(f.run(['--plan', '--slug', 'pin']));
  const clone = edit(plan, 'claims/decisions/pin.md', CLAIM('\nabout: [system/okf]'));
  setup(f, clone);
  fs.rmSync(join(clone, 'subjects/system/okf/index.md'));
  f.git(clone, 'checkout-index', '--force', '--', 'subjects/system/okf/index.md');
  const first = ok(f.run(['--check', '--slug', 'pin']));
  if (name.startsWith('working')) assert.deepEqual([...fs.readFileSync(join(clone, 'subjects/system/okf/index.md')).subarray(0, 2)], [0x23, 0x00], 'checked out again in UTF-16LE');
  assert.equal(ok(f.run(['--check', '--slug', 'pin'])).digest, first.digest, 'a second check, nothing edited, gives the same digest');
  const [pr] = ok(f.run(['--apply', '--slug', 'pin', '--digest', first.digest])).prs;
  const published = f.git(f.dir, '--git-dir', f.origin, 'show', `${pr.head}:subjects/system/okf/index.md`);
  assert.match(published, /\(\/claims\/decisions\/pin\.md\)/);assert.match(published, /^# oats-okf/, 'the generated bytes as checked (no filter applied to them)');
});

test('version 2 against a plain base: plan refuses E_CONFIG with the remedy and keeps no clone', t => {
  const f = fixture(t, { decl: V2, plain: true });
  refused(f.run(['--plan', '--slug', 'pin']), 'E_CONFIG', /^base kb has no subject layout; declare owns\/reads \(version 1\) or bridge the base/);
  assert.equal(fs.existsSync(join(f.home, 'proposals')) && fs.readdirSync(join(f.home, 'proposals')).filter(n => !n.startsWith('.')).length, 0);
});
