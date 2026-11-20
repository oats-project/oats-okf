import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { backingNotes, SKELETON, propose, publication, checkPublish, runHelper, provenance as provenanceBlock } from '../oats-package/capabilities/oats-okf/lib/propose.mjs';
import { execute as shippedExecute } from '../oats-package/capabilities/oats-okf/skills/okf-authoring/scripts/okf-publication.mjs';
import { CLI, write, json, sha, SECRET, CREATED, fixture, ok, refused, PROPOSAL, edit, remoteRefs } from './fixtures/propose.mjs';
// oats.okf 6.0 (docs/design/2026-11-10-no-harvesters-propose-by-pr.md): the
// instance proposes its own knowledge with `oats okf propose`. Real Git, a
// local bare remote and the shipped publication helper; gh is an argv-checked
// local adapter, so these tests do NOT prove GitHub delivery.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { parseProvenance } = await import(new URL('../oats-package/capabilities/oats-okf-maintenance/lib/provenance.mjs', import.meta.url));

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
  ['a hidden file', 'expert/.draft.md', 'E_SCOPE', /hidden/],
  ['a non-Markdown file', 'expert/data.json', 'E_SCOPE', /not a Markdown concept/],
]) test(`check refuses ${name} (${code}) and pushes nothing`, t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])), clone = edit(f, plan);
  write(join(clone, path), path.endsWith('.json') && path !== 'okf-base.json' ? '{}\n' : path === 'okf-base.json' ? fs.readFileSync(join(clone, 'okf-base.json'), 'utf8').replace('"other"', '"source"') : '---\ntype: Note\n---\nx\n');
  refused(f.run(['--check', '--slug', 'x']), code, pattern);
  assert.deepEqual(remoteRefs(f), ['refs/heads/main']);
});
// oats.okf 6.3 (#164, cut-list item 1): these were refusals (E_SCOPE, E_OWNER);
// now a W_SCOPE row for the maintainer, and the check still pushes nothing.
for (const [name, path, code, pattern] of [
  ['the base root log.md', 'log.md', 'E_SCOPE', /^W_SCOPE \[was E_SCOPE\]: log\.md is outside the write surface/],
  ['an unowned node', 'peer/claim.md', 'E_OWNER', /^W_SCOPE \[was E_OWNER\]: peer\/claim\.md is in node kb\/peer, which this soul does not own; the maintainer chooses its home$/],
]) test(`check warns on ${name} (was ${code}) and pushes nothing`, t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])), clone = edit(f, plan);
  // A log.md is a reserved file: it carries no type (a validator error, still refused).
  write(join(clone, path), path === 'log.md' ? '# Log\n\n## 2026-11-20\n\n* **Update**: x\n' : '---\ntype: Note\n---\nx\n');
  assert.ok(ok(f.run(['--check', '--slug', 'x'])).warnings.some(w => pattern.test(w)));
  assert.deepEqual(remoteRefs(f), ['refs/heads/main']);
});

test('check refuses an executable bit, a committed edit outside the surface and an invalid base', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])), clone = edit(f, plan);
  fs.chmodSync(join(clone, 'expert/retry-budget.md'), 0o755);
  refused(f.run(['--check', '--slug', 'x']), 'E_SCOPE', /non-executable/);
  fs.chmodSync(join(clone, 'expert/retry-budget.md'), 0o644);
  // An unreachable concept fails okf-validate --strict: 6.3 (#164, item 7), a W_LINT row.
  write(join(clone, 'expert/orphan.md'), '---\ntype: Note\ntitle: Orphan\ndescription: Not in any index.\n---\nx\n');
  assert.ok(ok(f.run(['--check', '--slug', 'x'])).warnings.includes('W_LINT [was E_VALIDATION]: expert/orphan.md: unreachable from any index.md; the maintainer fixes it at review'));
  fs.rmSync(join(clone, 'expert/orphan.md'));
  // Committing in the clone does not smuggle anything past the checks. 6.3
  // (#164, item 1): the write surface only warns, but a file outside every
  // node makes the base invalid (item 5), so it still refuses, by the validator.
  write(join(clone, 'README.md'), 'hello\n'); f.git(clone, 'add', '-A'); f.git(clone, 'commit', '-qm', 'local');
  refused(f.run(['--check', '--slug', 'x']), 'E_VALIDATION', /file outside node knowledge: README\.md/);
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

// oats.okf 6.3 (#164, cut-list items 9 and 11): a format problem in
// proposal.md is a W_PROPOSAL row and the proposal checks; only a provenance
// fence still refuses (item 10).
test('check: a provenance fence in proposal.md is E_PROPOSAL_FORMAT; any other malformed proposal or note line is W_PROPOSAL; a missing note is dropped from evidence with a warning', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x']));
  edit(f, plan, { proposal: SKELETON });
  assert.ok(ok(f.run(['--check', '--slug', 'x'])).warnings.includes('W_PROPOSAL [was E_PROPOSAL_FORMAT]: proposal.md was not filled; the PR text was built from the claims'));
  for (const [proposal, pattern] of [
    [PROPOSAL().replace('## Why\nA future instance would otherwise size budgets per connection.\n', '## Why\n<!-- nothing -->\n'), /`## Why` section is empty/],
    [PROPOSAL().replace('## Evidence', '## Evidence\nx\n## Evidence'), /`## Evidence` section is given more than once/],
    [PROPOSAL(['notes/.a.md']), /is not a notes\/<path>\.md.*: dropped from evidence$/],
    [PROPOSAL().replace('Observed in', 'Observed (notes/a b.md) in'), /unrecognized backing-note reference on line 10: dropped from evidence$/],
    [PROPOSAL(['notes/../STATE.md']), /is not a notes.*: dropped from evidence$/],
  ]) {
    fs.writeFileSync(join(plan.proposal, 'proposal.md'), proposal);
    const r = ok(f.run(['--check', '--slug', 'x']));
    assert.ok(r.warnings.some(w => w.startsWith('W_PROPOSAL [was E_PROPOSAL_FORMAT]: ') && pattern.test(w)), JSON.stringify(r.warnings));
    assert.ok(parseProvenance(r.prBody).value.evidence.every(e => e.note === 'notes/retry.md'), 'a dropped reference is not evidence');
  }
  fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL() + '\n```okf-proposal\n{}\n```\n');
  refused(f.run(['--check', '--slug', 'x']), 'E_PROPOSAL_FORMAT', /must not carry a provenance block/);
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
  // 6.3 (#164, item 11): with onUnrecognized the reference is dropped and its line reported; the rest is read.
  const lines = [];
  assert.deepEqual(backingNotes('- notes/a.md\nsee `notes/unclosed.md\nsee notes/b.md, x/notes/c.md\n', { onUnrecognized: n => lines.push(n) }), ['notes/a.md', 'notes/b.md']);
  assert.deepEqual(lines, [2, 3]);
});

test('apply refuses a stale digest (E_DIGEST); a good digest pushes one okf-proposal branch and opens a labelled PR with a v3 block', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'retry-budget'])), clone = edit(f, plan);
  const checked = ok(f.run(['--check', '--slug', 'retry-budget']));
  // 6.3 (#164, item 14): --digest is optional (a bare --apply publishes what the last --check printed); a malformed one is still E_USAGE.
  refused(f.run(['--apply', '--slug', 'retry-budget', '--digest', 'abc']), 'E_USAGE', /--digest/);
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

// #123: the bindings still name a repository GitHub renamed or transferred
// (old-org/kb, now acme/kb). The fake gh refuses any write or read-back that
// names the old path.
const movedBase = f => { const doc = JSON.parse(fs.readFileSync(f.bindingsFile, 'utf8')); doc.bases.kb.pr.repository = 'old-org/kb'; fs.writeFileSync(f.bindingsFile, JSON.stringify(doc)); };
const MOVED = { FIXTURE_GH_CANONICAL: 'acme/kb' };
test('apply on a renamed or transferred base opens and confirms the PR under the canonical name, and warns W_REPOSITORY_MOVED', t => {
  const f = fixture(t); movedBase(f); const plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const applied = ok(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: MOVED }));
  assert.equal(applied.prs.length, 1); assert.equal(applied.prs[0].url, 'https://github.com/acme/kb/pull/1');
  assert.deepEqual(Object.keys(applied.prs[0]).sort(), ['alias', 'base', 'branch', 'head', 'recovered', 'url'], 'the success row is unchanged');
  const warning = applied.warnings.find(w => w.startsWith('W_REPOSITORY_MOVED'));
  assert.ok(warning?.includes('the bindings name old-org/kb, which GitHub now answers as acme/kb'), String(warning));
  assert.ok(warning.includes(`edit ${f.bindingsFile}: set pr.repository to acme/kb`));
});
test('apply on a base whose bindings differ from GitHub only in case does not warn', t => {
  const f = fixture(t), doc = JSON.parse(fs.readFileSync(f.bindingsFile, 'utf8')); doc.bases.kb.pr.repository = 'ACME/kb'; fs.writeFileSync(f.bindingsFile, JSON.stringify(doc));
  const plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const applied = ok(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: MOVED }));
  assert.equal(applied.prs.length, 1); assert.ok(!applied.warnings.some(w => w.startsWith('W_REPOSITORY_MOVED')));
});
test('apply refuses E_GH before anything is pushed when the canonical name does not read back as the same repository, and stays re-appliable', t => {
  const f = fixture(t); movedBase(f); const plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const e = refused(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: { ...MOVED, FIXTURE_GH_READBACK: 'acme/kb\nR_another' } }), 'E_GH', /did not read back as the same repository.*nothing was pushed/);
  assert.equal(e.result?.published, undefined);
  assert.ok(!fs.existsSync(join(plan.proposal, 'publish')), 'not marked as attempted');
  assert.equal(f.git(f.dir, '--git-dir', f.origin, 'for-each-ref', 'refs/heads/okf-proposal'), '', 'nothing was pushed');
  assert.equal(f.prs().length, 0);
  // Once the bindings or GitHub agree, the same --apply publishes.
  assert.equal(ok(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: MOVED })).prs.length, 1);
});
test('a failure after the push on a moved base reports the canonical repository and names it in the recovery commands', t => {
  const f = fixture(t); movedBase(f); const plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const e = refused(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: { ...MOVED, FIXTURE_GH_FAIL: 'pr create' } }), 'E_GH', /was pushed to acme\/kb and no PR is confirmed/);
  const pushed = e.result.failed.published;
  assert.deepEqual(Object.keys(pushed).sort(), ['branch', 'head', 'repository']); assert.equal(pushed.repository, 'acme/kb');
  assert.deepEqual(JSON.parse(fs.readFileSync(join(plan.proposal, 'publish/kb-result.json'), 'utf8')).published, pushed, 'the retained result carries it too');
  assert.ok(e.message.includes(`gh pr list --repo 'acme/kb' --head '${pushed.branch}' --state all`), 'how to check');
  assert.ok(e.message.includes(`gh pr create --repo 'acme/kb' --base 'main' --head '${pushed.branch}' --label okf-proposal`), 'how to finish, under the canonical name');
  assert.ok(e.message.includes('its label starts the one review'), 'one review');
  assert.ok(!e.message.includes("--repo 'old-org/kb'"), 'no command names the old path');
  // The clone's origin is the bindings' URL, the old path on a real moved base:
  // removal addresses the repository the branch is on, never origin.
  assert.ok(e.message.includes(`to remove it, \`gh api -X DELETE 'repos/acme/kb/git/refs/heads/${pushed.branch}'\``), 'how to remove, under the canonical name');
  assert.ok(!e.message.includes('push origin --delete'), 'not through the clone\'s origin');
  assert.match(e.message, /W_REPOSITORY_MOVED: base kb: the bindings name old-org\/kb/);
});

test('a publication failure retains the clone and artefacts, reports safely and refuses a retry', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const e = refused(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: { FIXTURE_GH_FAIL: 'pr create' } }), 'E_GH', /retained.*Do not retry.*was pushed to acme\/kb and no PR is confirmed, never assume there is none/);
  assert.equal(e.result.failed.code, 'E_GH'); assert.deepEqual(e.result.published, []);
  // It says what it published and how to finish or remove it (#148).
  const pushed = e.result.failed.published;
  assert.match(pushed.branch, /^okf-proposal\/\d{8}-[0-9a-f-]{36}$/);
  assert.equal(f.git(f.dir, '--git-dir', f.origin, 'rev-parse', `refs/heads/${pushed.branch}`), pushed.head, 'the named branch is the one on the remote');
  // Every argument is shell-quoted: a home path with a space stays one argument.
  assert.ok(e.message.includes(`gh pr create --repo 'acme/kb' --base 'main' --head '${pushed.branch}' --label okf-proposal --title 'OKF knowledge proposal' --body-file '${join(plan.proposal, 'publish', 'kb-pr.md')}'`), 'how to finish');
  assert.ok(e.message.includes(`git -C '${join(plan.proposal, 'work', 'kb')}' push origin --delete '${pushed.branch}'`), 'how to remove');
  assert.deepEqual(JSON.parse(fs.readFileSync(join(plan.proposal, 'publish/kb-result.json'), 'utf8')).published, pushed);
  for (const p of ['work/kb', 'outgoing/kb-commit.txt', 'outgoing/kb-pr.md', 'publish/kb-result.json']) assert.ok(fs.existsSync(join(plan.proposal, p)), p);
  assert.ok(!fs.readFileSync(join(plan.proposal, 'publish/kb-result.json'), 'utf8').includes('fixture gh failure'), 'no raw tool stderr');
  refused(f.run(['--apply', '--slug', 'x', '--digest', digest]), 'E_PROPOSAL_EXISTS');
  // An attempted proposal is never called untouched, even when gh is now unusable (it is not re-appliable).
  refused(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: { FIXTURE_GH_FAIL: 'api --hostname' } }), 'E_PROPOSAL_EXISTS');
});

// #148: every gh precondition is decided before the push and before the
// attempt marker, so the refusal changes nothing and the same --apply works.
const remoteBranches = f => f.git(f.dir, '--git-dir', f.origin, 'for-each-ref', '--format=%(refname)', 'refs/heads/');
for (const [reason, breakGh, fix] of [
  ['gh-absent', f => fs.rmSync(join(f.dir, 'ghbin', 'gh')), /gh is not installed on this host/],
  ['gh-failed', () => ({ FIXTURE_GH_FAIL: 'api --hostname' }), /gh could not read the repository or its permission on it: sign gh in/],
  ['no-write-permission', () => ({ FIXTURE_GH_PUSH: 'false' }), /less than write permission/],
  // GitHub did not say: nothing establishes write, so the attempt never begins.
  ['gh-failed', () => ({ FIXTURE_GH_PUSH: 'null' }), /or its permission on it/],
  ['gh-failed', () => ({ FIXTURE_GH_PUSH: '' }), /or its permission on it/],
]) test(`apply refuses E_GH_UNAVAILABLE (${reason}) before anything is pushed, and the same apply works once fixed`, t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  const gh = fs.readFileSync(join(f.dir, 'ghbin', 'gh'));
  // No other gh on this PATH: the wrapped git, this node, nothing else.
  const nodeBin = join(f.dir, 'nodebin'); fs.mkdirSync(nodeBin); fs.symlinkSync(process.execPath, join(nodeBin, 'node'));
  const PATH = `${join(f.dir, 'bin')}:${join(f.dir, 'ghbin')}:${nodeBin}`;
  const extra = { PATH, ...(breakGh(f) || {}) };
  const e = refused(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra }), 'E_GH_UNAVAILABLE', fix);
  assert.match(e.message, /^base kb \(acme\/kb\): .*Nothing was pushed and the proposal is unchanged: fix this host, then run the same --apply again$/);
  assert.deepEqual(e.result, { reason, alias: 'kb', repository: 'acme/kb', pushed: false });
  assert.equal(remoteBranches(f), 'refs/heads/main', 'nothing was pushed');
  assert.ok(!fs.existsSync(join(plan.proposal, 'publish')), 'no attempt marker');
  assert.deepEqual(f.calls().filter(c => c.argv[0] !== 'api' && !(c.argv[0] === 'pr' && c.argv[1] === 'list')), [], 'no gh write');
  // The host is fixed: the same command publishes.
  fs.writeFileSync(join(f.dir, 'ghbin', 'gh'), gh, { mode: 0o755 });
  const [pr] = ok(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: { PATH } })).prs;
  assert.equal(f.git(f.dir, '--git-dir', f.origin, 'rev-parse', `refs/heads/${pr.branch}`), pr.head);
});

test('a gh that fails only at the helper\'s own check, after the attempt marker, is a publication error and not the re-appliable refusal', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])); edit(f, plan);
  const { digest } = ok(f.run(['--check', '--slug', 'x']));
  // The gate before the marker passes (call 1); create's own check fails (call 2).
  const e = refused(f.run(['--apply', '--slug', 'x', '--digest', digest], { extra: { FIXTURE_GH_PREFLIGHT_FAIL_AT: '2' } }), 'E_GH', /Do not retry.*gh stopped answering after the proposal was marked as attempted \(gh-failed\): nothing was pushed for base kb$/);
  assert.equal(e.result.failed.code, 'E_GH'); assert.equal(e.result.failed.published, undefined);
  assert.equal(remoteBranches(f), 'refs/heads/main', 'nothing was pushed');
  refused(f.run(['--apply', '--slug', 'x', '--digest', digest]), 'E_PROPOSAL_EXISTS');
});

test('a receipt that cannot be written after the PR is confirmed is a warning: the PR is still reported', { skip: process.getuid?.() === 0 && 'root ignores directory modes' }, async t => {
  const f = fixture(t);
  await inProcess(f, async () => {
    const plan = propose(f.home, { plan: true, slug: 'r' }).result; edit(f, plan);
    const { digest } = propose(f.home, { check: true, slug: 'r' }).result;
    const publish = join(plan.proposal, 'publish'), wrapped = publication.execute;
    publication.execute = (command, o) => { const out = wrapped(command, o); if (command === 'create') fs.chmodSync(publish, 0o500); return out; };
    let result; try { result = propose(f.home, { apply: true, slug: 'r', digest }).result; } finally { publication.execute = wrapped; if (fs.existsSync(publish)) fs.chmodSync(publish, 0o700); }
    assert.equal(result.prs.length, 1); assert.equal(result.prs[0].url, 'https://github.com/acme/kb/pull/1');
    assert.equal(f.git(f.dir, '--git-dir', f.origin, 'rev-parse', `refs/heads/${result.prs[0].branch}`), result.prs[0].head);
    assert.equal(result.warnings.filter(w => /^W_RECEIPT: the PR for base kb is open/.test(w)).length, 1);
    assert.ok(!fs.existsSync(join(publish, 'kb-result.json')));
  });
});

test('a gate that fails while another apply of the same proposal began reports it as attempted, not as untouched', async t => {
  const f = fixture(t);
  await inProcess(f, async () => {
    const plan = propose(f.home, { plan: true, slug: 'c' }).result; edit(f, plan);
    const { digest } = propose(f.home, { check: true, slug: 'c' }).result;
    const publish = join(plan.proposal, 'publish'), wrapped = publication.execute;
    // The other apply creates the marker while this one's gh call is out; then this call fails.
    publication.execute = (command, o) => { if (command !== 'preflight') return wrapped(command, o); fs.mkdirSync(publish); throw Object.assign(new Error('E_GH_UNAVAILABLE'), { code: 'E_GH_UNAVAILABLE', diagnostic: { phase: 'preflight', reason: 'gh-failed' } }); };
    let error; try { propose(f.home, { apply: true, slug: 'c', digest }); } catch (e) { error = e; } finally { publication.execute = wrapped; }
    assert.equal(error?.code, 'E_PROPOSAL_EXISTS'); assert.match(error.message, /already applied or attempted/);
  });
});

test('an installation credential GitHub refuses, or that could not be checked, refuses --apply with its fix line, nothing pushed', async t => {
  for (const [reason, fix] of [['installation-cannot-push', /signed in as a GitHub App installation, and GitHub refused that installation a push to the repository or does not show it the repository .* give the installation access to the repository with contents write, plus pull-requests and issues write/], ['installation-check-failed', /could not be checked .* check the network \(the check uses no proxy\) and `gh auth status`, then run it again/]]) {
    const f = fixture(t);
    await inProcess(f, async () => {
      const plan = propose(f.home, { plan: true, slug: 'i' }).result; edit(f, plan);
      const { digest } = propose(f.home, { check: true, slug: 'i' }).result, wrapped = publication.execute, asked = [];
      publication.execute = (command, o) => { if (command !== 'preflight') return wrapped(command, o); asked.push(o); throw Object.assign(new Error('E_GH_UNAVAILABLE'), { code: 'E_GH_UNAVAILABLE', diagnostic: { phase: 'preflight', reason } }); };
      let error; try { propose(f.home, { apply: true, slug: 'i', digest }); } catch (e) { error = e; } finally { publication.execute = wrapped; }
      assert.equal(error?.code, 'E_GH_UNAVAILABLE'); assert.match(error.message, fix); assert.match(error.message, /Nothing was pushed/);
      assert.deepEqual(error.result, { reason, alias: 'kb', repository: 'acme/kb', pushed: false });
      assert.deepEqual(asked, [{ github: 'acme/kb' }]);
      assert.ok(!fs.existsSync(join(plan.proposal, 'publish')), 'the proposal is not marked as attempted');
    });
  }
});

test('a host that can answer GitHub in the token file\'s place refuses --apply before the attempt marker: nothing pushed, the same apply works once the host is fixed', async t => {
  const f = fixture(t);
  await inProcess(f, async () => {
    const plan = propose(f.home, { plan: true, slug: 'h' }).result; edit(f, plan);
    const { digest } = propose(f.home, { check: true, slug: 'h' }).result, wrapped = publication.execute;
    publication.execute = (command, o) => { if (command !== 'preflight') return wrapped(command, o); throw Object.assign(new Error('E_HOST_CREDENTIAL'), { code: 'E_HOST_CREDENTIAL', diagnostic: { phase: 'host', routes: ['an authorization header (http.extraHeader) in the system Git configuration'], unread: [] } }); };
    let error; try { propose(f.home, { apply: true, slug: 'h', digest }); } catch (e) { error = e; } finally { publication.execute = wrapped; }
    assert.equal(error?.code, 'E_HOST_CREDENTIAL');
    assert.match(error.message, /^Git on this host may not use the token in github-token-file: an authorization header \(http\.extraHeader\) in the system Git configuration: remove each of them .*\. Nothing was pushed and the proposal is unchanged: fix this host, then run the same --apply again$/);
    assert.ok(!fs.existsSync(join(plan.proposal, 'publish')), 'the proposal is not marked as attempted');
    assert.equal(propose(f.home, { apply: true, slug: 'h', digest }).result.prs.length, 1);
  });
});

test('a host route that appears between the gate and create refuses at create, after the marker: not re-appliable, nothing pushed for that base, the kinds and the fix in the message', async t => {
  const f = fixture(t);
  await inProcess(f, async () => {
    const plan = propose(f.home, { plan: true, slug: 'r' }).result; edit(f, plan);
    const { digest } = propose(f.home, { check: true, slug: 'r' }).result, wrapped = publication.execute;
    publication.execute = (command, o) => { if (command !== 'create') return wrapped(command, o); throw Object.assign(new Error('E_HOST_CREDENTIAL'), { code: 'E_HOST_CREDENTIAL', diagnostic: { phase: 'host', routes: ['a netrc entry that answers for github.com (.netrc in this user\'s home)'], unread: [] } }); };
    let error; try { propose(f.home, { apply: true, slug: 'r', digest }); } catch (e) { error = e; } finally { publication.execute = wrapped; }
    assert.equal(error?.code, 'E_HOST_CREDENTIAL');
    assert.match(error.message, /Do not retry: report it; nothing was pushed for base kb: Git on this host may not use the token in github-token-file: a netrc entry that answers for github\.com \(\.netrc in this user's home\): remove each of them /);
    assert.ok(fs.existsSync(join(plan.proposal, 'publish')), 'the proposal is marked as attempted'); assert.equal(error.result.failed.published, undefined);
  });
});

test('a credential refusal at create, before its push, says nothing was pushed for that base and carries the helper\'s refusal text', async t => {
  const f = fixture(t);
  await inProcess(f, async () => {
    const plan = propose(f.home, { plan: true, slug: 'k' }).result; edit(f, plan);
    const { digest } = propose(f.home, { check: true, slug: 'k' }).result, wrapped = publication.execute;
    publication.execute = (command, o) => { if (command !== 'create') return wrapped(command, o); throw Object.assign(new Error('E_CREDENTIAL'), { code: 'E_CREDENTIAL', diagnostic: { phase: 'credential', reason: 'empty' } }); };
    let error; try { propose(f.home, { apply: true, slug: 'k', digest }); } catch (e) { error = e; } finally { publication.execute = wrapped; }
    assert.equal(error?.code, 'E_CREDENTIAL');
    assert.match(error.message, /Do not retry: report it; nothing was pushed for base kb: the publication helper refused \(E_CREDENTIAL\)$/);
    assert.equal(error.result.failed.published, undefined);
  });
});
test('a snapshot that cannot be written after the attempt began fails inside the publication envelope, with the published rows', { skip: process.getuid?.() === 0 && 'root ignores directory modes' }, async t => {
  const f = fixture(t);
  await inProcess(f, async () => {
    const plan = propose(f.home, { plan: true, slug: 's' }).result; edit(f, plan);
    const { digest } = propose(f.home, { check: true, slug: 's' }).result;
    // The lib's fs is node's default export: the one object this patches.
    const { default: nodeFs } = await import('node:fs'); const { syncBuiltinESMExports: sync } = await import('node:module');
    const publish = join(plan.proposal, 'publish'), mkdir = nodeFs.mkdirSync;
    nodeFs.mkdirSync = (path, ...rest) => { const out = mkdir(path, ...rest); if (path === publish) fs.chmodSync(publish, 0o500); return out; }; sync();
    let error; try { propose(f.home, { apply: true, slug: 's', digest }); } catch (e) { error = e; } finally { nodeFs.mkdirSync = mkdir; sync(); if (fs.existsSync(publish)) fs.chmodSync(publish, 0o700); }
    assert.equal(error?.code, 'E_PUBLICATION'); assert.match(error.message, /publication of base kb stopped \(E_PUBLICATION\).*Do not retry/);
    assert.deepEqual(error.result.published, []); assert.equal(error.result.failed.alias, 'kb');
    assert.equal(remoteBranches(f), 'refs/heads/main', 'nothing was pushed');
  });
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

test('with github-token-file, a base not bound over HTTPS and a committed value each refuse at --plan with the fix, before anything is cloned or sent', t => {
  const origins = kind => ({ OATS_SETTINGS_ORIGINS: JSON.stringify({ '/github-token-file': { kind, at: 'x' } }) });
  const f = fixture(t, { settings: { 'github-token-file': '/nonexistent/okf-token' } });
  // The fixture's base is a local repository: the token serves https://github.com/ only.
  refused(f.run(['--plan', '--slug', 'x'], { extra: origins('host') }), 'E_CREDENTIAL', /git base "kb" is not bound by an https:\/\/github\.com\/ URL.*bind it by its HTTPS URL/);
  refused(f.run(['--plan', '--slug', 'x'], { extra: origins('soul') }), 'E_CONFIG', /github-token-file from soul \(x\) is not valid: it is host-only/);
  assert.equal(fs.existsSync(join(f.home, 'proposals')), false, 'nothing was planned');
  assert.equal(f.calls().length, 0, 'no gh call');
});

test('with github-token-file the one publish predicate judges that file: it is passed to the preflight, every fix names the token and never gh\'s login, and an unusable file refuses E_CREDENTIAL', () => {
  const saved = { ...process.env }, wrapped = publication.execute, base = { pr: { repository: 'acme/kb' } };
  const answer = reason => { publication.execute = (command, o) => { asked.push([command, o]); throw Object.assign(new Error('x'), reason.startsWith('E_') ? { code: reason, diagnostic: { phase: 'credential', reason: 'missing' } } : { code: 'E_GH_UNAVAILABLE', diagnostic: { phase: 'preflight', reason } }); }; };
  const refusal = () => { try { checkPublish('kb', base); } catch (e) { return e; } assert.fail('expected a refusal'); };
  let asked = [];
  try {
    process.env.OATS_SETTINGS = JSON.stringify({ 'github-token-file': '/run/secrets/okf-token' }); process.env.OATS_SETTINGS_ORIGINS = JSON.stringify({ '/github-token-file': { kind: 'host', at: 'x' } });
    for (const [reason, fix] of [
      ['gh-absent', /install it \(github-token-file supplies its credential\)/],
      ['gh-failed', /GitHub did not show the repository or a permission on it to the token in github-token-file: check that the token is valid and not expired, and that its identity can see the repository/],
      ['no-write-permission', /the identity of the token in github-token-file has less than write permission .* give that identity the write role there/],
      ['installation-cannot-push', /the token in github-token-file is a GitHub App installation's, and GitHub refused it a push to the repository or does not show it the repository \(asked with that token; nothing was sent\): give the installation access/],
      ['installation-check-failed', /the token in github-token-file is a GitHub App installation's, and whether GitHub accepts a push from it could not be checked .* check the network \(the check uses no proxy\), then run it again/],
    ]) {
      asked = []; answer(reason); const e = refusal();
      assert.equal(e.code, 'E_GH_UNAVAILABLE'); assert.match(e.message, fix); assert.doesNotMatch(e.message, /gh auth|sign gh in|gh's account|signed in/);
      assert.deepEqual(e.result, { reason, alias: 'kb', repository: 'acme/kb', pushed: false, credential: 'file' });
      assert.deepEqual(asked, [['preflight', { github: 'acme/kb', 'token-file': '/run/secrets/okf-token' }]]);
    }
    // The host can answer GitHub in the file's place: the helper's refusal, with the whole fix, before anything is asked of gh.
    publication.execute = () => { throw Object.assign(new Error('E_HOST_CREDENTIAL'), { code: 'E_HOST_CREDENTIAL', diagnostic: { phase: 'host', routes: ['a netrc entry that answers for github.com (.netrc in this user\'s home)'], unread: ['the user Git configuration'] } }); };
    const h = refusal();
    assert.equal(h.code, 'E_HOST_CREDENTIAL');
    assert.equal(h.message, 'Git on this host may not use the token in github-token-file: a netrc entry that answers for github.com (.netrc in this user\'s home); the user Git configuration could not be read: ' + h.fix);
    assert.match(h.fix, /^remove each of them from the agents' container .*; and repair what could not be read, or make it readable by this user, so that it can be checked$/);
    answer('E_CREDENTIAL'); const e = refusal();
    assert.equal(e.code, 'E_CREDENTIAL'); assert.match(e.message, /^github-token-file \/run\/secrets\/okf-token does not exist: provision .* nothing was sent$/);
  } finally { publication.execute = wrapped; for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
});

test('a token file that turns unusable after the push keeps what was published: it is never reported as "nothing was sent"', () => {
  const wrapped = publication.execute, published = { branch: 'okf-proposal/20261116-x', head: 'a'.repeat(40), repository: 'acme/kb' }, options = { 'token-file': '/run/secrets/okf-token' };
  const thrown = extra => { publication.execute = () => { throw Object.assign(new Error('E_CREDENTIAL'), { code: 'E_CREDENTIAL', diagnostic: { phase: 'credential', reason: 'empty' }, ...extra }); }; try { runHelper('create', options); } catch (e) { return e; } finally { publication.execute = wrapped; } assert.fail('expected a refusal'); };
  const before = thrown({});
  assert.equal(before.code, 'E_CREDENTIAL'); assert.match(before.message, /^github-token-file \/run\/secrets\/okf-token is empty: provision .* own git and gh login$/); assert.doesNotMatch(before.message, /nothing was sent/); assert.equal(before.result, undefined);
  const after = thrown({ published });
  assert.equal(after.code, 'E_CREDENTIAL'); assert.deepEqual(after.result.published, published); assert.equal(after.result.diagnostic.reason, 'empty');
  assert.match(after.message, /became unusable after the push/); assert.doesNotMatch(after.message, /nothing was sent/);
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
      // The gh preflight sits between them: before the attempt marker and the commit.
      assert.deepEqual(calls.map(([c]) => c), ['screen', 'preflight', 'commit', 'create']);
      assert.deepEqual(calls[1][1], { github: 'acme/kb' });
      const [[, rescreen, rescreened], , [, commit, committedText], [, create, createdText]] = calls;
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

// 6.3 (#164, cut-list item 11): such a note is dropped from the evidence with
// a W_PROPOSAL row (it was E_PROPOSAL_FORMAT) and never reaches the provenance block.
test('note paths: no hidden, parent, empty, backslash or control-character segment, in propose and in the parser', t => {
  const f = fixture(t), plan = ok(f.run(['--plan', '--slug', 'x']));
  for (const note of ['notes/.hidden.md', 'notes/a\\b.md', 'notes//a.md', 'notes/a\tb.md']) {
    edit(f, plan, { proposal: PROPOSAL([]).replace('## Backing notes\n', `## Backing notes\n- \`${note}\`\n`) });
    const r = ok(f.run(['--check', '--slug', 'x']));
    assert.ok(r.warnings.some(w => /^W_PROPOSAL \[was E_PROPOSAL_FORMAT\]: backing note .* is not a notes\/<path>\.md .*: dropped from evidence$/.test(w)), JSON.stringify(r.warnings));
    assert.deepEqual(parseProvenance(r.prBody).value.evidence, [], note);
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
