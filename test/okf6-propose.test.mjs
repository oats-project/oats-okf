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
import { backingNotes, SKELETON } from '../oats-package/capabilities/oats-okf/lib/propose.mjs';
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
function fixture(t, { policy = { version: 1, harvest: 'on', reason: 'default' }, soulYaml = 'schemaVersion: 2\nname: source\nknowledge: oats.okf\n', record = {}, settings = {} } = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'okf6-propose-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const d = join(dir, 'deployment'), home = join(d, 'agents', 'source', 'instances', 'src'), soul = join(d, 'agents', 'source', 'souls', 'abc');
  const origin = join(dir, 'origin.git'), user = join(dir, 'user'), bin = isolatedGit(dir, '/dev/null');
  fs.mkdirSync(user, { recursive: true });
  // The accepted base: provisioned in place by init, then committed and pushed.
  const seed = join(dir, 'seed'), bindingsFile = join(d, 'okf-bindings.json'), stateDir = join(dir, 'state');
  json(join(dir, 'nodes.json'), { expert: { path: 'expert', owner: 'source' }, peer: { path: 'peer', owner: 'other' } });
  json(join(dir, 'seed-bindings.json'), { version: 1, stateDir: join(dir, 'seed-state'), bases: { kb: { id: 'kb-1', kind: 'directory', path: seed } } });
  initBase(loadBindings(join(dir, 'seed-bindings.json')), 'kb', join(dir, 'nodes.json'), undefined, { confirm: true });
  const env = { HOME: user, PATH: `${bin}:${join(dir, 'ghbin')}:${dirname(process.execPath)}:/usr/bin:/bin`, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LANG: 'C' };
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, env, encoding: 'utf8' }).trim();
  git(seed, 'init', '-q', '-b', 'main'); git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'accepted');
  git(dir, 'clone', '-q', '--bare', seed, origin);
  json(bindingsFile, { version: 1, stateDir, bases: { kb: { id: 'kb-1', kind: 'git', repository: origin, root: '.', acceptedBranch: 'main', pr: { repository: 'acme/kb' } } } });
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
function edit(f, plan, { concept = 'Retry budget is per request, not per connection.\n', path = 'expert/retry-budget.md', proposal = PROPOSAL() } = {}) {
  const clone = plan.bases[0].clone;
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
  assert.match(r.commitText, /^okf-proposal: retry budget is per request\n\nSource: instance src, soul source\n$/);
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
    [PROPOSAL(['notes/a b.md']), /not a plain notes\/<path>\.md/],
    [PROPOSAL().replace('Observed in', 'Observed (notes/a b.md) in'), /unrecognized backing-note reference/],
    [PROPOSAL(['notes/../STATE.md']), /not a plain notes/],
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
  assert.equal(block.source.incarnation, CREATED);
  assert.ok(block.evidence[0].sha256, 'the recovered notes are read');
  const [pr] = ok(f.run(['--apply', '--slug', 'x', '--home', recovery, '--digest', r.digest], { cwd: f.d, as: 'operator' })).prs;
  assert.match(pr.url, /\/pull\/1$/);
  // The recovery copy's own home is not a live home, and an incomplete recovery is refused.
  refused(f.run(['--plan', '--slug', 'y', '--home', join(recovery, 'home')], { cwd: f.d, as: 'operator' }), 'E_SOURCE', /names another home.*recovery/);
  json(join(recovery, 'recovery.json'), { version: 1, phase: 'copying', instance: 'src', sourceHome: f.home });
  refused(f.run(['--plan', '--slug', 'y', '--home', recovery], { cwd: f.d, as: 'operator' }), 'E_SOURCE', /not a completed/);
});
