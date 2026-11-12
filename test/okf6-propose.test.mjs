import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initBase } from '../oats-package/capabilities/oats-okf/lib/migration.mjs';
import { loadBindings } from '../oats-package/capabilities/oats-okf/lib/config.mjs';
import { backingNotes, SKELETON, propose, publication, provenance as provenanceBlock } from '../oats-package/capabilities/oats-okf/lib/propose.mjs';
import { execute as shippedExecute } from '../oats-package/capabilities/oats-okf/skills/okf-authoring/scripts/okf-publication.mjs';
import { isolatedGit } from './fixtures/isolated-git.mjs';
// oats.okf 6.0 (docs/design/2026-11-10-no-harvesters-propose-by-pr.md): the
// instance proposes its own knowledge with `oats okf propose`. Real Git, a
// local bare remote and the shipped publication helper; gh is an argv-checked
// local adapter, so these tests do NOT prove GitHub delivery.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = join(ROOT, 'oats-package/capabilities/oats-okf/bin/oats-okf.mjs');
const { parseProvenance } = await import(new URL('../oats-package/capabilities/oats-okf-maintenance/lib/provenance.mjs', import.meta.url));
const write = (file, text) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const SECRET = `ghp_${'A'.repeat(36)}`;
const CREATED = '2026-11-10T08:00:00.000Z';

const FAKE_GH = String.raw`const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const a = process.argv.slice(2), state = process.env.FIXTURE_GH_STATE;
const s = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')) : { prs: [] };
const input = a.includes('--body-file') && a[a.indexOf('--body-file') + 1] === '-' ? fs.readFileSync(0, 'utf8') : null;
fs.appendFileSync(process.env.FIXTURE_GH_LOG, JSON.stringify({ argv: a, input }) + '\n');
const save = () => fs.writeFileSync(state, JSON.stringify(s));
if (process.env.FIXTURE_GH_FAIL === a.slice(0, 2).join(' ')) { console.error('fixture gh failure'); process.exit(9); }
if (a[0] === 'pr' && a[1] === 'list') { console.log(JSON.stringify(s.open || [])); process.exit(0); }
if (a[0] === 'label' && a[1] === 'create') process.exit(0);
if (a[0] === 'pr' && a[1] === 'create') {
  const head = a[a.indexOf('--head') + 1], label = a[a.indexOf('--label') + 1];
  s.prs.push({ head, label, title: a[a.indexOf('--title') + 1], body: input }); save();
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

/** A deployment: one Git base `kb` (nodes expert owned by `source`, peer by
 *  `other`) in a local bare remote, the soul `source` owning kb/expert and
 *  reading kb/peer, and its live instance home `src` with a spawn policy. */
function fixture(t, { policy = { version: 1, harvest: 'on', reason: 'default' }, soulYaml = 'schemaVersion: 2\nname: source\nknowledge: oats.okf\n', record = {}, settings = {}, root = '.' } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'okf6-propose-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const d = join(dir, 'deployment'), home = join(d, 'agents', 'source', 'instances', 'src'), soul = join(d, 'agents', 'source', 'souls', 'abc');
  const origin = join(dir, 'origin.git'), user = join(dir, 'user'), bin = isolatedGit(dir, '/dev/null');
  fs.mkdirSync(user, { recursive: true });
  // The accepted base: provisioned in place by init, then committed and pushed.
  const seed = join(dir, 'seed'), bindingsFile = join(d, 'okf-bindings.json'), stateDir = join(dir, 'state');
  json(join(dir, 'nodes.json'), { expert: { path: 'expert', owner: 'source' }, peer: { path: 'peer', owner: 'other' } });
  json(join(dir, 'seed-bindings.json'), { version: 1, stateDir: join(dir, 'seed-state'), bases: { kb: { id: 'kb-1', kind: 'directory', path: root === '.' ? seed : join(seed, root) } } });
  initBase(loadBindings(join(dir, 'seed-bindings.json')), 'kb', join(dir, 'nodes.json'), undefined, { confirm: true });
  const env = { HOME: user, PATH: `${bin}:${join(dir, 'ghbin')}:${dirname(process.execPath)}:/usr/bin:/bin`, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LANG: 'C' };
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, env, encoding: 'utf8' }).trim();
  git(seed, 'init', '-q', '-b', 'main'); git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'accepted');
  git(dir, 'clone', '-q', '--bare', seed, origin);
  json(bindingsFile, { version: 1, stateDir, bases: { kb: { id: 'kb-1', kind: 'git', repository: origin, root, acceptedBranch: 'main', pr: { repository: 'acme/kb' } } } });
  write(join(soul, 'soul.yaml'), soulYaml);
  json(join(soul, 'okf.json'), { version: 1, owner: 'source', owns: ['kb/expert'], reads: ['kb/peer'] });
  json(join(home, 'instance.json'), { agent: 'source', kind: 'persistent', instance: 'src', home, soulDir: soul, createdAt: CREATED,
    capabilities: [{ id: 'oats.okf', layer: 'knowledge' }, { id: 'oats.aweb', layer: 'messaging' }], ...record });
  if (policy) json(join(home, 'okf-harvest-policy.json'), policy);
  write(join(home, 'notes', 'retry.md'), '---\ntype: Decision\n---\nRetry budget is per request.\n');
  fs.mkdirSync(join(dir, 'ghbin'));
  fs.writeFileSync(join(dir, 'ghbin', 'gh'), `#!${process.execPath}\n${FAKE_GH}`, { mode: 0o755 });
  const ghLog = join(dir, 'gh.jsonl'), ghState = join(dir, 'gh-state.json');
  const f = { dir, d, home, soul, origin, seed, env, git, ghLog, ghState, bindingsFile,
    settings: { 'bindings-file': bindingsFile, ...settings },
    calls: () => fs.existsSync(ghLog) ? fs.readFileSync(ghLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [],
    prs: () => fs.existsSync(ghState) ? JSON.parse(fs.readFileSync(ghState, 'utf8')).prs : [],
  };
  f.run = (args, { extra = {}, drop = [], cwd = home, as = 'instance' } = {}) => {
    const e = { ...env, OATS_SOUL: soul, OATS_SETTINGS: JSON.stringify(f.settings), OATS_TEAM_SCOPE: d,
      FIXTURE_GH_LOG: ghLog, FIXTURE_GH_STATE: ghState, FIXTURE_REMOTE: origin,
      ...(as === 'instance' ? { OATS_INSTANCE_HOME: home, OATS_INSTANCE: 'src' } : {}), ...extra };
    for (const k of drop) delete e[k];
    const r = spawnSync(process.execPath, [CLI, 'propose', ...args, '--json'], { cwd, env: e, encoding: 'utf8', timeout: 120000 });
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* reported below */ }
    assert.ok(out, `propose answered JSON: ${r.stdout}${r.stderr}`);
    return { status: r.status, out, stderr: r.stderr };
  };
  return f;
}
const ok = r => { assert.equal(r.status, 0, JSON.stringify(r.out)); assert.equal(r.out.ok, true); return r.out.result; };
const refused = (r, code, pattern) => {
  assert.equal(r.status, 1, JSON.stringify(r.out)); assert.equal(r.out.ok, false);
  assert.equal(r.out.error.code, code, JSON.stringify(r.out.error)); if (pattern) assert.match(r.out.error.message, pattern);
  return r.out.error;
};
const PROPOSAL = (notes = ['notes/retry.md']) => `# OKF proposal: retry budget is per request\n\n## What\nA decision in kb/expert: retries are budgeted per request.\n\n## Why\nA future instance would otherwise size budgets per connection.\n\n## Evidence\nObserved in the load test of the retry work.\n\n## Backing notes\n${notes.map(n => `- ${n}`).join('\n')}\n`;
/** Write one concept into the clone, reachable from the node index, and fill proposal.md. */
function edit(f, plan, { concept = 'Retry budget is per request, not per connection.\n', path = 'expert/retry-budget.md', proposal = PROPOSAL(), root = '.' } = {}) {
  const clone = root === '.' ? plan.bases[0].clone : join(plan.bases[0].clone, root);
  write(join(clone, path), `---\ntype: Decision\ntitle: Retry budget is per request\ndescription: Retries are budgeted per request.\n---\n\n${concept}`);
  if (path.startsWith('expert/')) fs.appendFileSync(join(clone, 'expert', 'index.md'), `\n* [Retry budget is per request](${path.slice('expert/'.length)}) - Retries are budgeted per request.\n`);
  fs.writeFileSync(join(plan.proposal, 'proposal.md'), proposal);
  return clone;
}
const remoteRefs = f => f.git(f.dir, '--git-dir', f.origin, 'for-each-ref', '--format=%(refname)').split('\n').filter(Boolean);

test('plan clones every owned base at the accepted branch, writes the skeleton and prints the write surface and open proposals', t => {
  const f = fixture(t);
  fs.writeFileSync(f.ghState, JSON.stringify({ prs: [], open: [{ number: 3, title: 'OKF knowledge proposal', url: 'https://github.com/acme/kb/pull/3' }] }));
  const plan = ok(f.run(['--plan', '--slug', 'retry-budget']));
  assert.match(plan.proposal, /\/proposals\/\d{4}-\d{2}-\d{2}-retry-budget$/);
  assert.ok(plan.proposal.startsWith(f.home));
  assert.equal(plan.form, 'live');
  assert.deepEqual(plan.source, { instance: 'src', soul: 'source', owner: 'source' });
  const [b] = plan.bases;
  assert.equal(b.alias, 'kb'); assert.equal(b.accepted, f.git(f.seed, 'rev-parse', 'HEAD'));
  assert.deepEqual(b.surface, ['expert/', 'index.md']); assert.deepEqual(b.nodes, ['kb/expert']);
  assert.equal(f.git(b.clone, 'rev-parse', 'HEAD'), b.accepted);
  assert.deepEqual(b.duplicates.map(x => [x.label, x.number]), [['okf-proposal', 3], ['okf-harvest', 3]]);
  assert.equal(fs.readFileSync(join(plan.proposal, 'proposal.md'), 'utf8'), SKELETON);
  for (const s of ['## What', '## Why', '## Evidence', '## Backing notes']) assert.ok(SKELETON.includes(`\n${s}\n`), s);
  assert.deepEqual(f.calls().map(c => c.argv.slice(0, 2).join(' ')), ['pr list', 'pr list'], 'plan only reads');
  // The text form names the surface and the next step.
  const text = spawnSync(process.execPath, [CLI, 'propose', '--plan', '--slug', 'other'], { cwd: f.home, env: { ...f.env, OATS_SOUL: f.soul, OATS_SETTINGS: JSON.stringify(f.settings), OATS_INSTANCE_HOME: f.home, FIXTURE_GH_LOG: f.ghLog, FIXTURE_GH_STATE: f.ghState }, encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr); assert.match(text.stdout, /write surface: expert\/, index\.md/); assert.match(text.stdout, /next: .*--check --slug other/);
});

test('plan refuses before cloning: E_PROPOSAL_EXISTS, E_SOURCE, E_OPTED_OUT, E_USAGE', t => {
  const f = fixture(t);
  ok(f.run(['--plan', '--slug', 'retry-budget']));
  refused(f.run(['--plan', '--slug', 'retry-budget']), 'E_PROPOSAL_EXISTS');
  for (const args of [['--slug', 'x'], ['--plan', '--check', '--slug', 'x'], ['--plan', '--slug', 'Bad Slug'], ['--plan', '--slug', 'x', '--digest', 'a'.repeat(64)]]) refused(f.run(args), 'E_USAGE');
  const proposals = fs.readdirSync(join(f.home, 'proposals'));
  // A 5.0/5.1 home has no spawn-recorded duty.
  const old = fixture(t, { policy: null });
  refused(old.run(['--plan', '--slug', 'x']), 'E_SOURCE', /no spawn-recorded knowledge duty.*respawn/);
  assert.equal(fs.existsSync(join(old.home, 'proposals')), false, 'nothing cloned');
  // A record that names another home, a home that is not one, a service home.
  refused(fixture(t, { record: { home: '/elsewhere/src' } }).run(['--plan', '--slug', 'x']), 'E_SOURCE', /names another home/);
  const empty = fixture(t); fs.rmSync(join(empty.home, 'instance.json'));
  refused(empty.run(['--plan', '--slug', 'x']), 'E_SOURCE', /no instance record/);
  refused(fixture(t, { record: { kind: 'capability' } }).run(['--plan', '--slug', 'x']), 'E_SOURCE', /service instance/);
  // The opt-out: the spawn-recorded policy, or the soul's own text (either spelling).
  const off = fixture(t, { policy: { version: 1, harvest: 'off', reason: 'soul-opt-out' } });
  refused(off.run(['--plan', '--slug', 'x']), 'E_OPTED_OUT');
  for (const yaml of ['schemaVersion: 2\nname: source\nknowledge: { publish: off }\n', 'schemaVersion: 2\nname: source\nknowledge:\n  harvest: off\n']) {
    const g = fixture(t, { soulYaml: yaml });
    refused(g.run(['--plan', '--slug', 'x']), 'E_OPTED_OUT'); assert.equal(fs.existsSync(join(g.home, 'proposals')), false);
  }
  // A capability id ending in -harvest is not the opt-out key.
  ok(fixture(t, { soulYaml: 'schemaVersion: 2\nname: source\ncapabilities:\n  oats.okf-harvest: { from: here }\n' }).run(['--plan', '--slug', 'x']));
  // The soul the kernel dispatched must be the recorded one.
  const other = join(f.dir, 'other-soul'); write(join(other, 'soul.yaml'), 'schemaVersion: 2\nname: intruder\n'); json(join(other, 'okf.json'), { version: 1, owner: 'source', owns: ['kb/expert'], reads: [] });
  refused(f.run(['--plan', '--slug', 'y'], { extra: { OATS_SOUL: other } }), 'E_SOURCE', /not the soul this home's record was spawned from/);
  assert.deepEqual(fs.readdirSync(join(f.home, 'proposals')), proposals, 'no refusal leaves a proposal directory');
});

test('plan refuses E_OWNER when okf.json owns a node the accepted base gives another owner', t => {
  const f = fixture(t); json(join(f.soul, 'okf.json'), { version: 1, owner: 'source', owns: ['kb/expert', 'kb/peer'], reads: [] });
  refused(f.run(['--plan', '--slug', 'x']), 'E_OWNER', /kb\/peer/);
  assert.deepEqual(fs.readdirSync(join(f.home, 'proposals')).filter(n => !n.startsWith('.')), []);
});

test('check validates, scopes and screens the edits, then prints the complete outgoing diff and a digest', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'retry-budget']));
  // Nothing written yet: nothing to propose.
  fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL());
  refused(f.run(['--check', '--slug', 'retry-budget']), 'E_USAGE', /nothing to propose/);
  edit(f, plan);
  const before = remoteRefs(f), calls = f.calls().length;
  const r = ok(f.run(['--check', '--slug', 'retry-budget']));
  assert.match(r.digest, /^[0-9a-f]{64}$/);
  const [b] = r.bases;
  assert.deepEqual(b.changed.sort(), ['A expert/retry-budget.md', 'M expert/index.md']);
  assert.match(b.diff, /^\+Retry budget is per request, not per connection\.$/m);
  assert.match(r.commitText, /^okf-proposal: retry budget is per request\n\nSource: instance src, soul source\n\nProposed-by: src \(soul source\)\n$/);
  assert.doesNotMatch(r.prBody, /<!--/, 'skeleton guidance is not published');
  const block = parseProvenance(r.prBody);
  assert.equal(block.valid, true, block.problems.join('; '));
  assert.deepEqual(block.value.evidence, [{ note: 'notes/retry.md', sha256: sha(fs.readFileSync(join(f.home, 'notes/retry.md'))) }]);
  assert.deepEqual(block.value.proposer, { form: 'live', instance: 'src', alias: 'src' });
  assert.deepEqual(block.value.source, { soul: 'source', owner: 'source', instance: 'src', incarnation: CREATED, ownedNodes: ['kb/expert'], readNodes: ['kb/peer'], bases: [{ alias: 'kb', id: 'kb-1', kind: 'git', root: '.', repository: 'acme/kb' }] });
  assert.ok(!r.prBody.includes(f.dir) && !r.commitText.includes(f.dir), 'no machine path in outgoing text');
  assert.deepEqual(remoteRefs(f), before, 'check pushes nothing'); assert.equal(f.calls().length, calls, 'check calls no gh');
  // The digest is stable while nothing changes, and moves when anything does.
  assert.equal(ok(f.run(['--check', '--slug', 'retry-budget'])).digest, r.digest);
  fs.appendFileSync(join(f.home, 'notes/retry.md'), 'more\n');
  assert.notEqual(ok(f.run(['--check', '--slug', 'retry-budget'])).digest, r.digest, 'a named note is in the digest');
});

for (const [name, path, code, pattern] of [
  ['okf-base.json', 'okf-base.json', 'E_SCOPE', /outside the write surface/],
  ['the base root log.md', 'log.md', 'E_SCOPE', /outside the write surface/],
  ['a hidden file', 'expert/.draft.md', 'E_SCOPE', /hidden/],
  ['a non-Markdown file', 'expert/data.json', 'E_SCOPE', /not a Markdown concept/],
  ['an unowned node', 'peer/claim.md', 'E_OWNER', /node kb\/peer, which this soul does not own/],
]) test(`check refuses ${name} (${code}) and pushes nothing`, t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])), clone = edit(f, plan);
  write(join(clone, path), path.endsWith('.json') && path !== 'okf-base.json' ? '{}\n' : path === 'okf-base.json' ? fs.readFileSync(join(clone, 'okf-base.json'), 'utf8').replace('"other"', '"source"') : '---\ntype: Note\n---\nx\n');
  refused(f.run(['--check', '--slug', 'x']), code, pattern);
  assert.deepEqual(remoteRefs(f), ['refs/heads/main']);
});

test('check refuses an executable bit, a committed edit outside the surface and an invalid base', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])), clone = edit(f, plan);
  fs.chmodSync(join(clone, 'expert/retry-budget.md'), 0o755);
  refused(f.run(['--check', '--slug', 'x']), 'E_SCOPE', /non-executable/);
  fs.chmodSync(join(clone, 'expert/retry-budget.md'), 0o644);
  // An unreachable concept fails okf-validate --strict.
  write(join(clone, 'expert/orphan.md'), '---\ntype: Note\ntitle: Orphan\ndescription: Not in any index.\n---\nx\n');
  refused(f.run(['--check', '--slug', 'x']), 'E_VALIDATION');
  fs.rmSync(join(clone, 'expert/orphan.md'));
  // Committing in the clone does not smuggle anything past the scope check.
  write(join(clone, 'README.md'), 'hello\n'); f.git(clone, 'add', '-A'); f.git(clone, 'commit', '-qm', 'local');
  refused(f.run(['--check', '--slug', 'x']), 'E_SCOPE', /README\.md/);
});

test('check refuses a secret (E_CONTENT_REFUSED) by location only, in a concept or in proposal.md', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x']));
  edit(f, plan, { concept: `token ${SECRET}\n` });
  const e = refused(f.run(['--check', '--slug', 'x']), 'E_CONTENT_REFUSED');
  assert.ok(e.result.findings.some(x => x.rule === 'secret-github'));
  assert.ok(!JSON.stringify(e).includes(SECRET), 'never echoed');
  const g = fixture(t), plan2 = ok(g.run(['--plan', '--slug', 'x']));
  edit(g, plan2, { proposal: PROPOSAL().replace('Observed in', `Observed with ${SECRET} in`) });
  assert.ok(refused(g.run(['--check', '--slug', 'x']), 'E_CONTENT_REFUSED').result.findings.some(x => x.location === 'outward file 2'));
});

test('a host term (setting screen-terms-file) refuses as host-term, case-insensitively, location only', t => {
  const terms = join(tmpdir(), `okf6-terms-${process.pid}-${Date.now()}.txt`); fs.writeFileSync(terms, 'Nightjar\n'); t.after(() => fs.rmSync(terms, { force: true }));
  const f = fixture(t, { settings: { 'screen-terms-file': terms } }), plan = ok(f.run(['--plan', '--slug', 'x']));
  edit(f, plan, { concept: 'The NIGHTJAR rollout taught this.\n' });
  const e = refused(f.run(['--check', '--slug', 'x']), 'E_CONTENT_REFUSED');
  assert.ok(e.result.findings.some(x => x.rule === 'host-term')); assert.ok(!JSON.stringify(e).toLowerCase().includes('nightjar'));
  f.settings['screen-terms-file'] = 'relative.txt';
  refused(f.run(['--check', '--slug', 'x']), 'E_CONFIG', /screen-terms-file/);
});

test('check: a malformed proposal or note line is E_PROPOSAL_FORMAT; a missing note is dropped from evidence with a warning', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x']));
  edit(f, plan, { proposal: SKELETON });
  refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', /must start with/);
  for (const [proposal, pattern] of [
    [PROPOSAL().replace('## Why\nA future instance would otherwise size budgets per connection.\n', '## Why\n<!-- nothing -->\n'), /`## Why` section is empty/],
    [PROPOSAL().replace('## Evidence', '## Evidence\nx\n## Evidence'), /exactly one `## Evidence`/],
    [PROPOSAL(['notes/.a.md']), /is not a notes\/<path>\.md/],
    [PROPOSAL().replace('Observed in', 'Observed (notes/a b.md) in'), /unrecognized backing-note reference/],
    [PROPOSAL(['notes/../STATE.md']), /is not a notes/],
    [PROPOSAL() + '\n```okf-proposal\n{}\n```\n', /must not carry a provenance block/],
  ]) {
    fs.writeFileSync(join(plan.proposal, 'proposal.md'), proposal);
    refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', pattern);
  }
  fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL(['notes/retry.md', 'notes/missing.md']));
  fs.symlinkSync(join(f.home, 'notes/retry.md'), join(f.home, 'notes/linked.md'));
  fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL(['notes/retry.md', 'notes/missing.md', 'notes/linked.md']));
  const r = ok(f.run(['--check', '--slug', 'x']));
  assert.deepEqual(r.evidence.map(e => [e.note, !!e.sha256]), [['notes/retry.md', true], ['notes/missing.md', false], ['notes/linked.md', false]]);
  assert.ok(r.warnings.some(w => /^E_NOTE: notes\/missing\.md is missing/.test(w)));
  assert.ok(r.warnings.some(w => /^E_NOTE: notes\/linked\.md is unreadable/.test(w)));
  assert.deepEqual(parseProvenance(r.prBody).value.evidence.slice(1), [{ note: 'notes/missing.md' }, { note: 'notes/linked.md' }]);
});

test('the 5.8 note-locator rules carry over: list entries and explicit references', () => {
  assert.deepEqual(backingNotes('## Backing notes\n- notes/a.md\n- `notes/b c.md`\n\nSee notes/d.md, and [x](notes/e.md).\n').sort(), ['notes/a.md', 'notes/b c.md', 'notes/d.md', 'notes/e.md']);
  assert.throws(() => backingNotes('see `notes/unclosed.md\n'), { code: 'E_PROPOSAL_FORMAT' });
});

test('apply refuses a stale digest (E_DIGEST); a good digest pushes one okf-proposal branch and opens a labelled PR with a v3 block', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'retry-budget'])), clone = edit(f, plan);
  const checked = ok(f.run(['--check', '--slug', 'retry-budget']));
  refused(f.run(['--apply', '--slug', 'retry-budget']), 'E_USAGE', /--digest/);
  // Anything changed after the check: refused, nothing pushed, no attempt recorded.
  fs.appendFileSync(join(clone, 'expert/retry-budget.md'), 'An unread line.\n');
  refused(f.run(['--apply', '--slug', 'retry-budget', '--digest', checked.digest]), 'E_DIGEST');
  assert.deepEqual(remoteRefs(f), ['refs/heads/main']); assert.equal(fs.existsSync(join(plan.proposal, 'publish')), false);
  const again = ok(f.run(['--check', '--slug', 'retry-budget']));
  const applied = ok(f.run(['--apply', '--slug', 'retry-budget', '--digest', again.digest]));
  const [pr] = applied.prs;
  assert.match(pr.branch, /^okf-proposal\/\d{8}-[0-9a-f-]{36}$/);
  assert.equal(pr.url, 'https://github.com/acme/kb/pull/1'); assert.equal(pr.recovered, 0); assert.equal(pr.base, plan.bases[0].accepted);
  assert.equal(f.git(f.dir, '--git-dir', f.origin, 'rev-parse', `refs/heads/${pr.branch}`), pr.head);
  assert.equal(f.git(f.dir, '--git-dir', f.origin, 'rev-parse', 'refs/heads/main'), plan.bases[0].accepted, 'the accepted branch is never pushed');
  assert.equal(f.git(f.dir, '--git-dir', f.origin, 'show', '-s', '--format=%an <%ae>%n%P%n%B', pr.head), `OKF harvest <okf@localhost>\n${pr.base}\n${again.commitText.trim()}`);
  const [created] = f.prs();
  assert.equal(created.label, 'okf-proposal'); assert.equal(created.title, 'OKF knowledge proposal'); assert.equal(created.body, again.prBody);
  const block = parseProvenance(created.body); assert.equal(block.valid, true); assert.equal(block.value.version, 3);
  assert.ok(f.calls().some(c => c.argv[0] === 'label' && c.argv[2] === 'okf-proposal'));
  assert.deepEqual(JSON.parse(fs.readFileSync(join(plan.proposal, 'published.json'), 'utf8')).prs, applied.prs);
  // One attempt per proposal: never a retry.
  refused(f.run(['--apply', '--slug', 'retry-budget', '--digest', again.digest]), 'E_PROPOSAL_EXISTS', /never retry/);
  assert.equal(f.prs().length, 1);
});

test('apply recovers an accepted branch that moved before the push (#130) and reports it', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  // Another writer merges an unrelated change to the accepted branch.
  const writer = join(f.dir, 'writer'); f.git(f.dir, 'clone', '-q', f.origin, writer);
  write(join(writer, 'peer', 'index.md'), fs.readFileSync(join(writer, 'peer', 'index.md'), 'utf8') + '\n');
  f.git(writer, 'commit', '-qam', 'independently accepted'); f.git(writer, 'push', '-q', 'origin', 'HEAD:main');
  const moved = f.git(writer, 'rev-parse', 'HEAD');
  const [pr] = ok(f.run(['--apply', '--slug', 'x', '--digest', digest])).prs;
  assert.equal(pr.recovered, 1); assert.equal(pr.base, moved);
  assert.equal(f.git(f.dir, '--git-dir', f.origin, 'rev-parse', `${pr.head}^`), moved, 'the PR is parented on the moved tip');
});

test('a publication failure retains the clone and artefacts, reports safely and refuses a retry', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const e = refused(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: { FIXTURE_GH_FAIL: 'pr create' } }), 'E_GH', /retained.*Do not retry.*never assume it does not/);
  assert.equal(e.result.failed.code, 'E_GH'); assert.deepEqual(e.result.published, []);
  for (const p of ['work/kb', 'outgoing/kb-commit.txt', 'outgoing/kb-pr.md', 'publish/kb-result.json']) assert.ok(fs.existsSync(join(plan.proposal, p)), p);
  assert.ok(!fs.readFileSync(join(plan.proposal, 'publish/kb-result.json'), 'utf8').includes('fixture gh failure'), 'no raw tool stderr');
  refused(f.run(['--apply', '--slug', 'x', '--digest', digest]), 'E_PROPOSAL_EXISTS');
});

test('the commit names the proposer in trailers: the messaging identity and its attributed human, read by slot as the kernel reads attributedHuman', t => {
  const record = (identity, runtime = [{ id: 'oats.aweb', layer: 'messaging' }]) => ({ capabilityRuntime: runtime, capabilityMeta: { 'oats.aweb': { identity } } });
  const text = extra => { const f = fixture(t, extra), plan = ok(f.run(['--plan', '--slug', 'who'])); edit(f, plan); return ok(f.run(['--check', '--slug', 'who'])); };
  const tail = r => r.commitText.split('\n\n').at(-1);
  // No recorded identity: the proposer alone. Absence never warns.
  const bare = text({});
  assert.equal(tail(bare), 'Proposed-by: src (soul source)\n'); assert.deepEqual(bare.warnings, []);
  // The address when the identity has one, else its alias; the human only in mode "human".
  assert.equal(tail(text({ record: record({ mode: 'local', alias: 'src', address: null }) })), 'Proposed-by: src (soul source)\nProposer-identity: src\n');
  assert.equal(tail(text({ record: record({ alias: 'src', address: 'acme/src', attribution: { mode: 'human', human: { id: 'h-1', label: 'Ada Example' }, parent: null } }) })),
    'Proposed-by: src (soul source)\nProposer-identity: acme/src\nAttributed-human: Ada Example\n');
  for (const attribution of [{ mode: 'none', human: { id: 'h-1', label: 'Ada Example' } }, { mode: 'unknown' }, { mode: 'person', human: { id: 'h-1', label: 'Ada Example' } },
    { mode: 'human', human: { label: 'Ada Example' } }, { mode: 'human', human: { id: 'h-1', label: 'two\nlines' } }, { mode: 'human', human: { id: 'h-1', label: 'x'.repeat(201) } },
    { mode: 'human', human: { id: 'h-1', label: 'Ada Example' }, parent: { id: 7 } }, 'human']) {
    assert.equal(tail(text({ record: record({ alias: 'src', attribution }) })), 'Proposed-by: src (soul source)\nProposer-identity: src\n', JSON.stringify(attribution));
  }
  // By slot: an identity a non-messaging capability recorded names nobody.
  assert.equal(tail(text({ record: record({ alias: 'other', attribution: { mode: 'human', human: { id: 'h-1', label: 'Ada Example' } } }, [{ id: 'oats.aweb', layer: 'tasks' }]) })), 'Proposed-by: src (soul source)\n');
  // A value the content screen refuses is left out with a warning; the proposal still checks.
  const withheld = text({ record: record({ alias: 'src', attribution: { mode: 'human', human: { id: 'h-1', label: SECRET } } }) });
  assert.equal(tail(withheld), 'Proposed-by: src (soul source)\nProposer-identity: src\n');
  assert.equal(withheld.warnings.length, 1); assert.match(withheld.warnings[0], /^W_ATTRIBUTION: the Attributed-human trailer is left out/);
  assert.ok(!withheld.warnings[0].includes(SECRET), 'the warning never echoes the value');
});

test('the operator form reads a retirement recovery copy and names the form in the provenance', t => {
  const f = fixture(t);
  const recovery = join(f.d, 'agents', 'source', 'instances', '.oats-retirement', 'recovery', 'src-AbC123');
  fs.mkdirSync(recovery, { recursive: true }); fs.renameSync(f.home, join(recovery, 'home'));
  json(join(recovery, 'recovery.json'), { version: 1, phase: 'complete', instance: 'src', sourceHome: f.home, createdAt: '2026-11-10T09:00:00.000Z' });
  const plan = ok(f.run(['--plan', '--slug', 'x', '--home', recovery], { cwd: f.d, as: 'operator' }));
  assert.equal(plan.form, 'recovery'); assert.ok(plan.proposal.startsWith(join(recovery, 'home', 'proposals')));
  edit(f, plan);
  const r = ok(f.run(['--check', '--slug', 'x', '--home', recovery], { cwd: f.d, as: 'operator' }));
  const block = parseProvenance(r.prBody).value;
  assert.deepEqual(block.proposer, { form: 'recovery', instance: null, alias: null });
  assert.equal(r.commitText.split('\n\n').at(-1), 'Proposed-by: src (soul source)\nPublished-by: operator\n');
  assert.equal(block.source.incarnation, CREATED);
  assert.ok(block.evidence[0].sha256, 'the recovered notes are read');
  const [pr] = ok(f.run(['--apply', '--slug', 'x', '--home', recovery, '--digest', r.digest], { cwd: f.d, as: 'operator' })).prs;
  assert.match(pr.url, /\/pull\/1$/);
  // The recovery copy's own home is not a live home, and an incomplete recovery is refused.
  refused(f.run(['--plan', '--slug', 'y', '--home', join(recovery, 'home')], { cwd: f.d, as: 'operator' }), 'E_SOURCE', /names another home.*recovery/);
  json(join(recovery, 'recovery.json'), { version: 1, phase: 'copying', instance: 'src', sourceHome: f.home });
  refused(f.run(['--plan', '--slug', 'y', '--home', recovery], { cwd: f.d, as: 'operator' }), 'E_SOURCE', /not a completed/);
});

// The recovery form keeps 5.8's retired-seat admission (oats-okf#125, #128):
// a recovery copy without the spawn policy (a retired 4.x or 5.0/5.1 seat) is
// decided from the recorded soul.yaml text and the record's keys by origin.
const OKF4 = fs.readFileSync(join(ROOT, 'test/fixtures/okf4-instance-record.json'), 'utf8');
function retired(t, { edit = r => r, soulYaml, record = true } = {}) {
  const f = fixture(t, { policy: null, ...(soulYaml ? { soulYaml } : {}) });
  if (record) {
    const r = edit(JSON.parse(OKF4.replaceAll('<HOME>', f.home).replaceAll('<SOUL_DIR>', f.soul).replaceAll('<BINDINGS_FILE>', f.bindingsFile)));
    delete r._comment; r.agent = 'source';
    json(join(f.home, 'instance.json'), r);
  } else {
    // A 5.0/5.1 record: the slot with its bindings, no policy file.
    const r = JSON.parse(fs.readFileSync(join(f.home, 'instance.json'), 'utf8'));
    json(join(f.home, 'instance.json'), { ...r, providers: { 'oats.okf': { 'bindings-file': f.bindingsFile } } });
  }
  const recovery = join(f.d, 'agents', 'source', 'instances', '.oats-retirement', 'recovery', 'src-Old4x');
  fs.mkdirSync(recovery, { recursive: true }); fs.renameSync(f.home, join(recovery, 'home'));
  json(join(recovery, 'recovery.json'), { version: 1, phase: 'complete', instance: 'src', sourceHome: f.home });
  f.plan = (slug = 'x') => f.run(['--plan', '--slug', slug, '--home', recovery], { cwd: f.d, as: 'operator' });
  return f;
}
const origin = (key, kind, value) => r => { if (value !== undefined) { r.providers['oats.okf'][key] = value; r.capabilities[0].settings[key] = value; } r.capabilities[0].settingsOrigins[`/${key}`] = { kind, at: 'x' }; return r; };

test('the recovery form admits a retired 4.x seat with only manifest defaults, and a retired 5.0/5.1 seat, with no policy file', t => {
  const plan = ok(retired(t).plan());
  assert.equal(plan.form, 'recovery'); assert.equal(Object.hasOwn(plan, 'legacyKeysIgnored'), false);
  const five = retired(t, { record: false });
  assert.equal(ok(five.plan()).form, 'recovery', 'a 5.0/5.1 recovery copy without a policy is admitted too');
});

for (const [key, kind, value] of [['harvest', 'host', 'on'], ['harvest', 'host', 'off'], ['harvest', 'spawn', 'on'], ['harvest-runtime', 'host', 'claude'], ['harvest', 'workspace', 'on']]) {
  test(`the recovery form ignores a retired 4.x seat's ${key} set by ${kind} (${value}) and names it`, t => {
    assert.deepEqual(ok(retired(t, { edit: origin(key, kind, value) }).plan()).legacyKeysIgnored, [key]);
  });
}

test('the recovery form never admits an opted-out or undecidable retired seat', t => {
  // The soul's off in its text, masked in the record by a host on: the text decides.
  refused(retired(t, { edit: origin('harvest', 'host', 'on'), soulYaml: 'schemaVersion: 2\nname: source\nknowledge: { harvest: off }\n' }).plan(), 'E_OPTED_OUT');
  refused(retired(t, { edit: origin('harvest', 'soul') }).plan(), 'E_OPTED_OUT', /recorded soul-origin harvest: off/);
  refused(retired(t, { edit: origin('harvest', 'soul', 'on') }).plan(), 'E_SOURCE', /harvest from soul, a setting removed/);
  refused(retired(t, { edit: r => { delete r.capabilities; return r; } }).plan(), 'E_SOURCE', /no recorded origin/);
  for (const yaml of ['schemaVersion: 2\nname: source\nknowledge: { harvest: on }\n', 'schemaVersion: 2\nname: source\nknowledge:\n  publish: on\n'])
    refused(retired(t, { soulYaml: yaml }).plan(), 'E_SOURCE', /other than off/);
  // A capability id ending in -harvest is not a harvest key.
  ok(retired(t, { soulYaml: 'schemaVersion: 2\nname: source\ncapabilities:\n  oats.okf-harvest: { from: here }\n' }).plan());
  refused(retired(t, { edit: r => { delete r.providers; return r; } }).plan(), 'E_SOURCE', /no oats\.okf knowledge slot/);
  // The same 4.x record in a LIVE home stays refused: respawn.
  const live = fixture(t, { policy: null });
  json(join(live.home, 'instance.json'), { ...JSON.parse(OKF4.replaceAll('<HOME>', live.home).replaceAll('<SOUL_DIR>', live.soul).replaceAll('<BINDINGS_FILE>', live.bindingsFile)), agent: 'source' });
  refused(live.run(['--plan', '--slug', 'x']), 'E_SOURCE', /no spawn-recorded knowledge duty/);
});

// Acceptance condition 1 (spec §8): the proposer's pre-push screen is the SAME
// screen and helper calls the 5.x harvester's publication made, moved. The
// expected calls are read from the released v5.8.0 knowledge-harvest skill's
// publish block in this repository's history, not restated here.
function harvesterCalls() {
  const skill = execFileSync('git', ['show', 'v5.8.0:oats-package/capabilities/oats-okf-harvest/skills/knowledge-harvest/SKILL.md'], { cwd: ROOT, encoding: 'utf8' });
  const call = name => {
    const m = new RegExp(`okf-publication\\.mjs' ${name} \\\\\\n([\\s\\S]*?)2>/dev/null\\)`).exec(skill);
    assert.ok(m, `v5.8.0 skill calls the helper's ${name}`);
    return Object.fromEntries([...m[1].matchAll(/--([a-z-]+) ('[^']*'|"[^"]*")/g)].map(([, k, v]) => [k, v.slice(1, -1)]));
  };
  return { commit: call('commit'), create: call('create') };
}
async function inProcess(f, fn) {
  const saved = { ...process.env }, cwd = process.cwd();
  Object.assign(process.env, f.env, { OATS_SOUL: f.soul, OATS_SETTINGS: JSON.stringify(f.settings), OATS_TEAM_SCOPE: f.d, OATS_INSTANCE_HOME: f.home, OATS_INSTANCE: 'src',
    FIXTURE_GH_LOG: f.ghLog, FIXTURE_GH_STATE: f.ghState, FIXTURE_REMOTE: f.origin });
  for (const k of Object.keys(process.env)) if (/^GIT_(?!CONFIG_)/.test(k)) delete process.env[k];
  process.chdir(f.home);
  const calls = [], real = publication.execute;
  // Record each call's options and the bytes of its text inputs at call time.
  const bytes = o => Object.fromEntries(['text-file', 'commit-file', 'body-file'].filter(k => o[k]).map(k => [k, [o[k]].flat().map(file => fs.readFileSync(file, 'utf8'))]));
  publication.execute = (command, o) => { calls.push([command, structuredClone(o), bytes(o)]); return real(command, o); };
  try { return await fn(calls); }
  finally { publication.execute = real; process.chdir(cwd); for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
}

test('condition 1: --check and --apply feed the shipped helper exactly the harvester\'s §8 inputs (plus the host terms), through the same screen', async t => {
  assert.equal(publication.execute, shippedExecute, 'propose calls the shipped okf-authoring helper, not a copy of its logic');
  const terms = join(tmpdir(), `okf6-same-terms-${process.pid}-${Date.now()}.txt`); fs.writeFileSync(terms, 'unrelated-term\n'); t.after(() => fs.rmSync(terms, { force: true }));
  const expected = harvesterCalls();
  assert.deepEqual(Object.keys(expected.commit).sort(), ['base', 'branch', 'commit-file', 'head', 'repo']);
  assert.deepEqual(Object.keys(expected.create).sort(), ['base', 'base-branch', 'body-file', 'branch', 'github', 'head', 'remote', 'repo']);
  for (const withTerms of [false, true]) {
    const f = fixture(t, { settings: withTerms ? { 'screen-terms-file': terms } : {} });
    await inProcess(f, async calls => {
      const plan = propose(f.home, { plan: true, slug: 'same' }).result;
      const clone = edit(f, plan), accepted = plan.bases[0].accepted;
      assert.deepEqual(calls, [], 'plan never calls the helper');
      const checked = propose(f.home, { check: true, slug: 'same' }).result;
      const extra = withTerms ? { 'terms-file': terms } : {};
      // --check: the helper's `screen` over the exact outgoing range and both outgoing texts.
      assert.equal(calls.length, 1); const [cmd, screen, screened] = calls[0];
      assert.equal(cmd, 'screen');
      assert.deepEqual(Object.keys(screen).sort(), ['base', 'head', 'repo', 'text-file', ...Object.keys(extra)].sort());
      assert.equal(screen.repo, clone); assert.equal(screen.base, accepted); assert.equal(screen['terms-file'], extra['terms-file']);
      assert.deepEqual(screened['text-file'], [checked.commitText, checked.prBody], 'the screen read exactly the texts --check printed');
      calls.length = 0;
      const [pr] = propose(f.home, { apply: true, slug: 'same', digest: checked.digest }).result.prs;
      // --apply: the same screen again (it re-verifies before any write), then exactly the
      // harvester's commit and create, with its flags bound to the same values.
      assert.deepEqual(calls.map(([c]) => c), ['screen', 'commit', 'create']);
      const [[, rescreen, rescreened], [, commit, committedText], [, create, createdText]] = calls;
      assert.deepEqual({ ...rescreen, head: undefined, 'text-file': undefined }, { ...screen, head: undefined, 'text-file': undefined });
      assert.deepEqual(rescreened, screened);
      assert.equal(f.git(clone, 'rev-parse', `${rescreen.head}^{tree}`), f.git(clone, 'rev-parse', `${screen.head}^{tree}`));
      assert.deepEqual(Object.keys(commit).sort(), [...Object.keys(expected.commit), ...Object.keys(extra)].sort());
      // One addition to the harvester's create: the base's okf-base.json guards base-move recovery.
      assert.deepEqual(Object.keys(create).sort(), [...Object.keys(expected.create), 'guard-file', ...Object.keys(extra)].sort());
      // The texts --apply publishes are this attempt's own snapshot (publish/), the bytes --check printed.
      const commitFile = join(plan.proposal, 'publish', 'kb-commit.txt'), bodyFile = join(plan.proposal, 'publish', 'kb-pr.md');
      assert.deepEqual([committedText['commit-file'], createdText['body-file']], [[checked.commitText], [checked.prBody]]);
      assert.deepEqual(commit, { repo: clone, base: accepted, head: accepted, branch: pr.branch, 'commit-file': commitFile, ...extra }, 'harvester: --base "$base" --head "$base"');
      assert.deepEqual(create, { repo: clone, remote: f.origin, github: 'acme/kb', base: accepted, 'base-branch': 'main', head: pr.head, branch: pr.branch, 'body-file': bodyFile, 'guard-file': 'okf-base.json', ...extra },
        'harvester: --remote <recorded clone locator> --github <owner>/<repo> --base-branch <acceptedBranch> --head "$head"');
      // What --check screened is what --apply published: the same tree and message bytes.
      assert.equal(f.git(clone, 'rev-parse', `${screen.head}^{tree}`), f.git(clone, 'rev-parse', `${pr.head}^{tree}`));
      assert.equal(f.git(clone, 'cat-file', '-p', screen.head).split('\n\n').slice(1).join('\n\n'), f.git(clone, 'cat-file', '-p', pr.head).split('\n\n').slice(1).join('\n\n'));
    });
  }
});

// Round-1 review findings (PR #131 at 042faff).
test('a base move that changes okf-base.json is never replayed: E_BASE_MOVED before any push', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const writer = join(f.dir, 'writer'); f.git(f.dir, 'clone', '-q', f.origin, writer);
  const meta = JSON.parse(fs.readFileSync(join(writer, 'okf-base.json'), 'utf8'));
  meta.nodes.expert.owner = 'other';
  json(join(writer, 'okf-base.json'), meta); f.git(writer, 'commit', '-qam', 'expert moves to other'); f.git(writer, 'push', '-q', 'origin', 'HEAD:main');
  const e = refused(f.run(['--apply', '--slug', 'x', '--digest', digest]), 'E_BASE_MOVED');
  assert.deepEqual(e.result.failed.diagnostic, { phase: 'recover', attempts: 1, reason: 'guarded-file-changed' });
  assert.deepEqual(remoteRefs(f), ['refs/heads/main'], 'nothing was pushed');
});

test('a clone that is a symlink, or whose .git is a gitfile, is refused before any Git write', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); const clone = edit(f, plan);
  const elsewhere = join(f.dir, 'elsewhere'); fs.renameSync(clone, elsewhere); fs.symlinkSync(elsewhere, clone);
  refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', /symlink or not a directory/);
  assert.equal(f.git(elsewhere, 'symbolic-ref', 'HEAD'), 'refs/heads/main', 'the other checkout is untouched');
  fs.rmSync(clone); fs.mkdirSync(clone);
  for (const name of fs.readdirSync(elsewhere).filter(n => n !== '.git')) fs.renameSync(join(elsewhere, name), join(clone, name));
  fs.writeFileSync(join(clone, '.git'), `gitdir: ${join(elsewhere, '.git')}\n`);
  refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', /symlink or not a directory/);
});

test('Git\'s writable state must stay inside the clone: symlinked refs or objects, or an alternate store, are refused', t => {
  for (const [inside, check] of [['refs', 'apply'], ['objects', 'check'], ['refs/heads', 'check'], ['config', 'check']]) {
    const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); const clone = edit(f, plan);
    const { digest } = ok(f.run(['--check', '--slug', 'x']));
    const outside = join(f.dir, `outside-${inside.replace('/', '-')}`);
    fs.renameSync(join(clone, '.git', inside), outside); fs.symlinkSync(outside, join(clone, '.git', inside));
    const before = fs.statSync(outside).isDirectory() ? fs.readdirSync(outside, { recursive: true }).sort() : null;
    refused(f.run(check === 'apply' ? ['--apply', '--slug', 'x', '--digest', digest] : ['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', new RegExp(`\\.git/${inside} is a symlink`));
    if (before) assert.deepEqual(fs.readdirSync(outside, { recursive: true }).sort(), before, `nothing written under the outside ${inside}`);
    assert.deepEqual(remoteRefs(f), ['refs/heads/main']);
  }
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); const clone = edit(f, plan);
  write(join(clone, '.git', 'objects', 'info', 'alternates'), `${join(f.origin, 'objects')}\n`);
  refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', /shares another repository \(objects\/info\/alternates\)/);
});

test('a failing Git command on the clone reports E_GIT with the subcommand only, never Git\'s or a filter\'s output', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); const clone = edit(f, plan);
  write(join(clone, '.git', 'info', 'attributes'), '*.md filter=leak\n');
  f.git(clone, 'config', 'filter.leak.clean', "printf 'PRIVATE_PAYLOAD_NIGHTJAR' >&2; exit 1");
  f.git(clone, 'config', 'filter.leak.required', 'true');
  const e = refused(f.run(['--check', '--slug', 'x']), 'E_GIT', /^git add failed on a proposal clone \(exit \d+\); Git's own output is withheld/);
  assert.doesNotMatch(JSON.stringify(e), /PRIVATE_PAYLOAD|fatal|error:|filter/);
});

test('a base root with a space publishes end to end, and its okf-base.json guards a base-move recovery', t => {
  const root = 'knowledge base', f = fixture(t, { root }), plan = ok(f.run(['--plan', '--slug', 'x']));
  assert.deepEqual(plan.bases[0].surface, [`${root}/expert/`, `${root}/index.md`]);
  edit(f, plan, { root });
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  // An unrelated accepted change: recovered past, with the guard file unchanged.
  const writer = join(f.dir, 'writer'); f.git(f.dir, 'clone', '-q', f.origin, writer);
  fs.appendFileSync(join(writer, root, 'peer', 'index.md'), '\n'); f.git(writer, 'commit', '-qam', 'unrelated'); f.git(writer, 'push', '-q', 'origin', 'HEAD:main');
  const [pr] = ok(f.run(['--apply', '--slug', 'x', '--digest', digest])).prs;
  assert.equal(pr.recovered, 1);
  assert.ok(f.git(f.dir, '--git-dir', f.origin, 'ls-tree', '-r', '--name-only', pr.head).split('\n').includes(`${root}/expert/retry-budget.md`));
});

test('an unreadable recorded soul never lets another dispatched soul through', t => {
  const f = fixture(t);
  const intruder = join(f.d, 'agents', 'intruder', 'souls', 'x');
  write(join(intruder, 'soul.yaml'), 'schemaVersion: 2\nname: intruder\nknowledge: oats.okf\n');
  json(join(intruder, 'okf.json'), { version: 1, owner: 'other', owns: ['kb/peer'], reads: [] });
  fs.rmSync(join(f.soul, 'soul.yaml'));
  refused(f.run(['--plan', '--slug', 'x'], { extra: { OATS_SOUL: intruder } }), 'E_SOURCE', /intruder\) is not the soul this home's record was spawned from \(source\)/);
});

test('the digest binds the generated commit text and PR body: a changed incarnation needs a new --check', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const before = ok(f.run(['--check', '--slug', 'x']));
  const rec = JSON.parse(fs.readFileSync(join(f.home, 'instance.json'), 'utf8'));
  json(join(f.home, 'instance.json'), { ...rec, createdAt: '2020-01-01T00:00:00.000Z' });
  const after = ok(f.run(['--check', '--slug', 'x']));
  assert.notEqual(after.prBody, before.prBody); assert.notEqual(after.digest, before.digest);
  refused(f.run(['--apply', '--slug', 'x', '--digest', before.digest]), 'E_DIGEST');
  assert.deepEqual(remoteRefs(f), ['refs/heads/main']);
});

test('the outgoing diff is raw text: Git attributes and text conversion cannot hide it', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); const clone = edit(f, plan);
  write(join(clone, '.git', 'info', 'attributes'), '*.md -diff\n*.md diff=hide\n');
  f.git(clone, 'config', 'diff.hide.textconv', 'true');
  const [b] = ok(f.run(['--check', '--slug', 'x'])).bases;
  assert.match(b.diff, /\+Retry budget is per request, not per connection\./); assert.doesNotMatch(b.diff, /Binary files/);
});

test('a clone failure reports a fixed classification, never the tool\'s own bytes', t => {
  const f = fixture(t);
  // A corrupt accepted object: Git fails with its own stderr (paths, ids).
  const objects = join(f.origin, 'objects');
  for (const d of fs.readdirSync(objects).filter(n => /^[0-9a-f]{2}$/.test(n))) for (const o of fs.readdirSync(join(objects, d))) { fs.rmSync(join(objects, d, o)); fs.writeFileSync(join(objects, d, o), 'PRIVATE_PAYLOAD_NIGHTJAR'); }
  const e = refused(f.run(['--plan', '--slug', 'x']), 'E_BASE_UNAVAILABLE');
  assert.doesNotMatch(e.message, /PRIVATE_PAYLOAD|original Git failure|fatal|error:/i, e.message);
  assert.deepEqual(fs.readdirSync(join(f.home, 'proposals')), [], 'the staging directory is removed');
});

// Provenance v3 carries a version-2 soul too (subjects, no owner/owns/reads):
// one writer (propose) and one parser (the maintainer's), both shapes.
test('provenance v3: the writer and the parser agree on the node shape and the subjects shape', () => {
  const fence = v => `x\n\n\`\`\`okf-proposal\n${JSON.stringify(v, null, 2)}\n\`\`\`\n`;
  const bases = [{ alias: 'kb', base: { id: 'kb-1', root: '.', pr: { repository: 'acme/kb' } } }];
  const src = decl => ({ soul: 'source', decl, record: { instance: 'src', createdAt: CREATED }, tasksProvider: null, proposer: { form: 'live', instance: 'src', alias: null } });
  const nodes = provenanceBlock(src({ owner: 'source', owns: ['kb/expert'], reads: ['kb/peer', 'kb/expert'] }), bases, []);
  assert.deepEqual(nodes.source, { soul: 'source', owner: 'source', instance: 'src', incarnation: CREATED, ownedNodes: ['kb/expert'], readNodes: ['kb/peer'], bases: [{ alias: 'kb', id: 'kb-1', kind: 'git', root: '.', repository: 'acme/kb' }] });
  assert.equal(Object.hasOwn(nodes.source, 'subjects'), false);
  const subjects = provenanceBlock(src({ subjects: ['product/oats-okf', 'team/knowledge'] }), bases, []);
  assert.deepEqual([subjects.source.owner, subjects.source.subjects, subjects.source.ownedNodes, subjects.source.readNodes], [null, ['product/oats-okf', 'team/knowledge'], [], []]);
  for (const v of [nodes, subjects, { ...subjects, source: { ...subjects.source, owner: 'source' } }]) {
    const parsed = parseProvenance(fence(v)); assert.equal(parsed.valid, true, parsed.problems.join('; ')); assert.deepEqual(parsed.value, v);
  }
  const bad = (source, problem) => { const r = parseProvenance(fence({ ...subjects, source: { ...subjects.source, ...source } })); assert.equal(r.valid, false); assert.ok(r.problems.some(p => p.includes(problem)), r.problems.join('; ')); };
  bad({ subjects: undefined }, 'source.owner must be the source soul');
  bad({ subjects: [] }, 'non-empty list of distinct');
  bad({ subjects: ['Product/x'] }, 'non-empty list of distinct');
  bad({ subjects: ['a/b', 'a/b'] }, 'non-empty list of distinct');
  bad({ ownedNodes: ['kb/expert'] }, 'must be [] when source.owner is null');
  // subjects stay a v3 key only.
  const v2 = parseProvenance(`\`\`\`okf-harvest\n${JSON.stringify({ version: 2, source: { ...nodes.source, incarnation: undefined, subjects: ['a/b'] }, evidence: [], tasks: nodes.tasks, harvester: { instance: 'h', alias: null } })}\n\`\`\`\n`);
  assert.equal(v2.valid, false); assert.ok(v2.problems.some(p => p.includes('unknown key "subjects"')));
});

// Round-3 review findings (PR #131 at 401dd78).
test('plan.json values never reach Git unchecked: a non-OID accepted value or a bad alias is E_PROPOSAL_FORMAT, before any Git call', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const file = join(plan.proposal, 'plan.json'), good = JSON.parse(fs.readFileSync(file, 'utf8'));
  const victim = join(f.dir, 'victim'); fs.writeFileSync(victim, 'DO NOT OVERWRITE');
  for (const bases of [[{ ...good.bases[0], accepted: `--output=${victim}` }], [{ ...good.bases[0], accepted: 'HEAD' }], [{ ...good.bases[0], accepted: good.bases[0].accepted.slice(0, 12) }],
    [{ ...good.bases[0], alias: '../kb' }], [{ ...good.bases[0], extra: 1 }], [good.bases[0], good.bases[0]]]) {
    json(file, { ...good, bases });
    refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', /plan\.json is not an oats okf propose plan/);
    assert.equal(fs.readFileSync(victim, 'utf8'), 'DO NOT OVERWRITE');
  }
  json(file, { ...good, bases: [{ ...good.bases[0], accepted: 'f'.repeat(40) }] });
  refused(f.run(['--check', '--slug', 'x']), 'E_GIT', /git cat-file failed/);
  const tree = f.git(plan.bases[0].clone, 'rev-parse', `${good.bases[0].accepted}^{tree}`);
  json(file, { ...good, bases: [{ ...good.bases[0], accepted: tree }] });
  refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', /is not a commit in its clone/);
});

test('plan clones without hard links, and a hard-linked file under .git is refused before any write', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); const clone = edit(f, plan);
  const links = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (fs.lstatSync(p).nlink !== 1) links.push(p); } };
  walk(join(clone, '.git')); assert.deepEqual(links, [], 'a local-path origin is cloned with --no-hardlinks');
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const outside = join(f.dir, 'outside-reflog');
  fs.renameSync(join(clone, '.git', 'logs', 'HEAD'), outside); fs.linkSync(outside, join(clone, '.git', 'logs', 'HEAD'));
  const before = fs.readFileSync(outside, 'utf8');
  refused(f.run(['--apply', '--slug', 'x', '--digest', digest]), 'E_PROPOSAL_FORMAT', /\.git\/logs\/HEAD is hard-linked elsewhere/);
  assert.equal(fs.readFileSync(outside, 'utf8'), before, 'nothing appended outside the clone');
  assert.deepEqual(remoteRefs(f), ['refs/heads/main']);
});

// The 5.8 note-locator and note-path rules, end to end (oats.okf 5.8's
// quoted-capture cases): a quoted filename with a space or parentheses is
// read, hashed and published, and the maintainer's parser accepts it.
for (const filename of ['notes/decision.md (v2).md', 'notes/decision.md(v2).md']) test(`a quoted backing note keeps its whole filename end to end: ${filename}`, t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])), intended = 'Literal quoted filename: the intended evidence.\n';
  write(join(f.home, filename), intended); write(join(f.home, 'notes/decision.md'), 'a different note\n');
  edit(f, plan, { proposal: PROPOSAL([]).replace('## Backing notes\n', `## Backing notes\n- \`${filename}\`\n`) });
  const checked = ok(f.run(['--check', '--slug', 'x']));
  assert.deepEqual(checked.evidence, [{ note: filename, sha256: sha(intended) }]);
  const block = parseProvenance(checked.prBody);
  assert.equal(block.valid, true, block.problems.join('; ')); assert.deepEqual(block.value.evidence, [{ note: filename, sha256: sha(intended) }]);
  const [pr] = ok(f.run(['--apply', '--slug', 'x', '--digest', checked.digest])).prs;
  assert.ok(pr.url);
});

test('note paths: no hidden, parent, empty, backslash or control-character segment, in propose and in the parser', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x']));
  for (const note of ['notes/.hidden.md', 'notes/a\\b.md', 'notes//a.md', 'notes/a\tb.md']) {
    edit(f, plan, { proposal: PROPOSAL([]).replace('## Backing notes\n', `## Backing notes\n- \`${note}\`\n`) });
    refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT');
  }
  const fence = evidence => `x\n\n\`\`\`okf-proposal\n${JSON.stringify({ version: 3, source: { soul: 's', owner: 'o', instance: 'i', incarnation: CREATED, ownedNodes: [], readNodes: [], bases: [] }, evidence, tasks: { provider: null, refs: [] }, proposer: { form: 'live', instance: 'i', alias: null } })}\n\`\`\`\n`;
  assert.equal(parseProvenance(fence([{ note: 'notes/decision.md (v2).md' }])).valid, true);
  for (const note of ['notes/.hidden.md', 'notes/a\\b.md', 'notes/a\u0001.md', 'notes/../x.md']) assert.equal(parseProvenance(fence([{ note }])).valid, false, note);
});

// Round-4 review findings (PR #131 at fdab304).
test('strict validation reads the tree\'s stored bytes: a clean/smudge filter cannot pass an invalid concept', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); const clone = edit(f, plan);
  write(join(clone, '.git', 'info', 'attributes'), 'expert/retry-budget.md filter=frontmatter\n');
  // clean strips the YAML frontmatter from what is stored; smudge would put it back in a checkout.
  f.git(clone, 'config', 'filter.frontmatter.clean', "awk 'BEGIN{n=0} n<2 && /^---$/ {n++; next} n>=2 || n==0 {print}'");
  f.git(clone, 'config', 'filter.frontmatter.smudge', "awk 'BEGIN{print \"---\"; print \"type: Decision\"; print \"title: Retry budget is per request\"; print \"description: Retries are budgeted per request.\"; print \"---\"} {print}'");
  refused(f.run(['--check', '--slug', 'x']), 'E_VALIDATION', /retry-budget\.md/);
  assert.deepEqual(remoteRefs(f), ['refs/heads/main']);
});

test('identifiers the bindings accept work end to end: a 96-character alias and an uppercase node, and the parser accepts the v3 block', t => {
  const alias = 'B'.repeat(96), f = fixture(t);
  // Rebind kb under a long alias, and rename the owned node to Expert (same path and owner).
  const bindings = JSON.parse(fs.readFileSync(f.bindingsFile, 'utf8')); bindings.bases = { [alias]: bindings.bases.kb }; json(f.bindingsFile, bindings);
  const writer = join(f.dir, 'writer'); f.git(f.dir, 'clone', '-q', f.origin, writer);
  const meta = JSON.parse(fs.readFileSync(join(writer, 'okf-base.json'), 'utf8')); meta.nodes = { Expert: meta.nodes.expert, peer: meta.nodes.peer };
  json(join(writer, 'okf-base.json'), meta); f.git(writer, 'commit', '-qam', 'node id Expert'); f.git(writer, 'push', '-q', 'origin', 'HEAD:main');
  json(join(f.soul, 'okf.json'), { version: 1, owner: 'source', owns: [`${alias}/Expert`], reads: [`${alias}/peer`] });
  const plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const checked = ok(f.run(['--check', '--slug', 'x']));
  const block = parseProvenance(checked.prBody);
  assert.equal(block.valid, true, block.problems.join('; '));
  assert.deepEqual([block.value.source.ownedNodes, block.value.source.bases[0].alias], [[`${alias}/Expert`], alias]);
  assert.ok(ok(f.run(['--apply', '--slug', 'x', '--digest', checked.digest])).prs[0].url);
});

// Round-7 review findings (PR #131 at cf51148).
test('a concurrent --check between apply\'s digest check and its publication cannot change the published texts', async t => {
  const f = fixture(t);
  await inProcess(f, async () => {
    const plan = propose(f.home, { plan: true, slug: 'x' }).result; edit(f, plan);
    const checked = propose(f.home, { check: true, slug: 'x' }).result;
    // Interleave a second, ordinary --check (with new wording) just before apply's commit.
    const real = publication.execute; let interleaved = false;
    publication.execute = (command, o) => {
      if (command === 'commit' && !interleaved) {
        interleaved = true;
        fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL().replace('retry budget is per request', 'retry budget, reworded'));
        publication.execute = real; propose(f.home, { check: true, slug: 'x' }); publication.execute = wrapped;
      }
      return real(command, o);
    };
    const wrapped = publication.execute;
    try {
      const [pr] = propose(f.home, { apply: true, slug: 'x', digest: checked.digest }).result.prs;
      assert.equal(interleaved, true);
      const msg = f.git(f.dir, '--git-dir', f.origin, 'cat-file', '-p', pr.head).split('\n\n').slice(1).join('\n\n');
      assert.equal(msg.trim(), checked.commitText.trim(), 'the published commit text is the checked one');
      assert.equal(f.prs().at(-1).body, checked.prBody, 'the published PR body is the checked one');
    } finally { publication.execute = real; }
  });
});

test('a soul\'s publish: off never excuses a host or spawn harvest key (only harvest\'s own soul-origin off does)', async () => {
  const { legacySettings } = await import('../oats-package/capabilities/oats-okf/lib/legacy-settings.mjs');
  const env = (settings, origins) => ({ OATS_SETTINGS: JSON.stringify(settings), OATS_SETTINGS_ORIGINS: JSON.stringify(Object.fromEntries(Object.entries(origins).map(([k, kind]) => [`/${k}`, { kind, at: 'x' }]))) });
  for (const kind of ['host', 'spawn']) {
    const found = legacySettings(env({ publish: 'off', harvest: 'on' }, { publish: 'soul', harvest: kind }));
    assert.deepEqual(found.map(x => [x.key, x.kind]), [['harvest', kind]]);
  }
  assert.deepEqual(legacySettings(env({ harvest: 'off' }, { harvest: 'soul' })), [], 'the soul\'s own harvest: off is the opt-out');
  assert.deepEqual(legacySettings(env({ harvest: 'off' }, { harvest: 'host' })).map(x => x.key), ['harvest'], 'a host off masks nothing and refuses');
});

// Round-8 review finding (PR #131 at 4e77a32).
test('an index change between apply\'s tree check and the helper\'s commit is refused before anything is pushed', async t => {
  const f = fixture(t);
  await inProcess(f, async () => {
    const plan = propose(f.home, { plan: true, slug: 'x' }).result; const clone = edit(f, plan);
    const checked = propose(f.home, { check: true, slug: 'x' }).result;
    const real = publication.execute; let interleaved = false;
    publication.execute = (command, o) => {
      if (command === 'commit' && !interleaved) {
        interleaved = true;
        fs.appendFileSync(join(clone, 'expert/retry-budget.md'), 'An unchecked line.\n');
        f.git(clone, 'add', 'expert/retry-budget.md');
      }
      return real(command, o);
    };
    try {
      assert.throws(() => propose(f.home, { apply: true, slug: 'x', digest: checked.digest }), e => e.code === 'E_DIGEST' && e.result?.failed?.code === 'E_DIGEST' && e.result.published.length === 0);
      assert.equal(interleaved, true);
      assert.deepEqual(remoteRefs(f), ['refs/heads/main'], 'nothing was pushed');
      assert.deepEqual(f.prs(), []);
    } finally { publication.execute = real; }
  });
});
