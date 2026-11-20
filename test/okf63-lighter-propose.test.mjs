import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fixture as plainFixture, ok, refused, PROPOSAL, edit, remoteRefs, SECRET, write } from './fixtures/propose.mjs';
import { fixture as subjectFixture, V2, CLAIM } from './fixtures/subjects-propose.mjs';
import { REJECTED, VERDICT } from './fixtures/bridged-base.mjs';
import { SKELETON } from '../oats-package/capabilities/oats-okf/lib/propose.mjs';
// oats.okf 6.3 (oats-project/oats-okf#164, cut list r1 and its decision):
// lighter knowledge proposals. Mechanical refusals become W_* warnings the
// knowledge maintainer resolves at review (`## Check warnings` in the PR
// body); --slug and --digest are optional (a bare --apply prints the check
// and stops, then publishes what it printed); only what protects against
// real harm still refuses. Real Git, a local bare remote and the shipped
// publication helper; gh is a local adapter (no GitHub).
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { parseProvenance } = await import(new URL('../oats-package/capabilities/oats-okf-maintenance/lib/provenance.mjs', import.meta.url));
const SLUG_FORM = /^p-\d{6}-[0-9a-f]{4}$/;
const INSIGHT = (title, extra = '') => `---\ntype: Insight\ntitle: ${title}\ndescription: Two commands publish a proposal.${extra}\n---\n\n# ${title}\n\nThe first --apply prints; the second publishes.\n`;
const subjectRefs = f => f.git(f.dir, '--git-dir', f.origin, 'for-each-ref', '--format=%(refname)').split('\n').filter(Boolean);
const section = (body, heading) => { const at = body.indexOf(`\n## ${heading}\n`); assert.ok(at >= 0, `no ## ${heading} in ${body}`); const next = body.indexOf('\n## ', at + 1); return body.slice(at, next < 0 ? undefined : next); };
const checkRows = body => body.includes('\n## Check warnings\n') ? section(body, 'Check warnings').split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)) : [];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('acceptance 1: a version-2 proposer proposes with --plan, one claim and --apply twice: no slug, no digest, no proposal.md', t => {
  const f = subjectFixture(t, { decl: V2 });
  const plan = ok(f.run(['--plan']));
  assert.match(plan.slug, SLUG_FORM); assert.ok(plan.proposal.endsWith(`-${plan.slug}`));
  assert.match(plan.next, /then oats okf propose --apply: it prints the outgoing diff and stops/);
  const path = 'claims/insights/two-commands.md';
  write(join(plan.bases[0].clone, path), INSIGHT('Proposals publish in two commands', '\nabout: [system/okf]'));
  assert.equal(fs.readFileSync(join(plan.proposal, 'proposal.md'), 'utf8'), SKELETON, 'proposal.md is left as the skeleton');
  // The first --apply prints the check and stops.
  const first = ok(f.run(['--apply']));
  assert.equal(first.published, false); assert.ok(first.bases[0].diff.length > 0);
  assert.match(first.next, /^nothing was pushed: read the complete outgoing diff.*then run oats okf propose --apply again/);
  assert.deepEqual(subjectRefs(f), ['refs/heads/main'], 'no remote ref other than main');
  assert.deepEqual(f.prs(), [], 'no pr create call');
  // The second publishes what the first printed.
  const second = ok(f.run(['--apply']));
  assert.equal(second.published, true); assert.equal(second.prs.length, 1); assert.equal(f.prs().length, 1);
  const { body } = f.prs()[0];
  assert.match(body, /^# OKF proposal: Proposals publish in two commands\n/m);
  assert.match(section(body, 'What'), new RegExp(`^- ${path.replaceAll('.', '\\.')}: Proposals publish in two commands — Two commands publish a proposal\\.$`, 'm'));
  assert.deepEqual(checkRows(body), ['W_PROPOSAL [was E_PROPOSAL_FORMAT]: proposal.md was not filled; the PR text was built from the claims']);
  assert.ok(body.indexOf('## Check warnings') > body.indexOf('## What') && body.indexOf('## Check warnings') < body.indexOf('```okf-proposal'));
  const block = parseProvenance(body);
  assert.equal(block.valid, true, JSON.stringify(block.problems)); assert.equal(block.value.version, 3);
  assert.equal(second.prs[0].head, f.git(f.dir, '--git-dir', f.origin, 'rev-parse', `refs/heads/${second.prs[0].branch}`));
  assert.match(f.git(f.dir, '--git-dir', f.origin, 'log', '-1', '--format=%s', second.prs[0].head), /^okf-proposal: Proposals publish in two commands$/, 'the commit subject is the built claim line');
});

test('acceptance 2: a bare --apply after the claim changed refuses E_DIGEST and pushes nothing; --check then --apply publishes', t => {
  const f = subjectFixture(t, { decl: V2 }), plan = ok(f.run(['--plan'])), file = join(plan.bases[0].clone, 'claims/insights/two-commands.md');
  write(file, INSIGHT('Proposals publish in two commands', '\nabout: [system/okf]'));
  const checked = ok(f.run(['--check']));
  const record = JSON.parse(fs.readFileSync(join(plan.proposal, 'checked.json'), 'utf8'));
  assert.deepEqual(Object.keys(record), ['version', 'digest', 'checkedAt']); assert.deepEqual([record.version, record.digest], [1, checked.digest]);
  assert.equal(fs.statSync(join(plan.proposal, 'checked.json')).mode & 0o777, 0o600);
  fs.appendFileSync(file, 'An unread line.\n');
  refused(f.run(['--apply']), 'E_DIGEST', /changed since the last --check: run --check again and read its diff, then --apply/);
  assert.deepEqual(subjectRefs(f), ['refs/heads/main']); assert.equal(fs.existsSync(join(plan.proposal, 'publish')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(join(plan.proposal, 'checked.json'), 'utf8')), record, 'a refused apply never records a check');
  const again = ok(f.run(['--check']));
  assert.notEqual(again.digest, checked.digest);
  const applied = ok(f.run(['--apply']));
  assert.equal(applied.published, true); assert.equal(f.prs()[0].body, again.prBody);
});

test('a malformed checked.json is no record: a bare --apply checks again, records the check and stops, then publishes', t => {
  const f = subjectFixture(t, { decl: V2 }), plan = ok(f.run(['--plan'])), file = join(plan.bases[0].clone, 'claims/insights/two-commands.md');
  write(file, INSIGHT('Proposals publish in two commands', '\nabout: [system/okf]'));
  const { digest } = ok(f.run(['--check'])), record = join(plan.proposal, 'checked.json');
  for (const bad of [
    '{"version": 1, "digest": "' + digest + '", "checkedAt": "not-an-ISO-date"}',
    '{"version": 1, "digest": "' + digest + '", "checkedAt": "2026-02-30T00:00:00.000Z"}',
    '{"version": 1, "digest": "' + digest + '", "checkedAt": "2026-13-20T00:00:00.000Z"}',
    '{"version": 1, "digest": "' + digest + '", "checkedAt": 1}',
    '{"version": 1, "digest": "' + digest + '"}',
    '{"version": 1, "checkedAt": "2026-11-20T00:00:00.000Z"}',
    '{"version": 2, "digest": "' + digest + '", "checkedAt": "2026-11-20T00:00:00.000Z"}',
    '{"version": 1, "digest": "' + digest.toUpperCase() + '", "checkedAt": "2026-11-20T00:00:00.000Z"}',
    '[]', '{"version": 1, "digest": "' + digest, '',
  ]) {
    fs.writeFileSync(record, bad, { mode: 0o600 });
    const checked = ok(f.run(['--apply']));
    assert.equal(checked.published, false, bad); assert.equal(checked.digest, digest, bad);
    assert.deepEqual(subjectRefs(f), ['refs/heads/main'], bad);
    const written = JSON.parse(fs.readFileSync(record, 'utf8'));
    assert.deepEqual([written.version, written.digest], [1, digest], bad); assert.equal(new Date(written.checkedAt).toISOString(), written.checkedAt, bad);
  }
  const applied = ok(f.run(['--apply']));
  assert.equal(applied.published, true); assert.equal(f.prs().length, 1);
});

test('acceptance 3: the 6.2 invocations work as before: --plan --slug, a filled proposal.md, --check, --apply --slug --digest', t => {
  const f = plainFixture(t), plan = ok(f.run(['--plan', '--slug', 'x']));
  assert.equal(plan.slug, 'x'); assert.match(plan.next, /then oats okf propose --check --slug x$/);
  edit(f, plan);
  const checked = ok(f.run(['--check', '--slug', 'x']));
  assert.match(checked.next, new RegExp(`then oats okf propose --apply --slug x --digest ${checked.digest}$`));
  assert.deepEqual(checked.warnings, []); assert.doesNotMatch(checked.prBody, /## Check warnings/);
  assert.match(checked.prBody, /^# OKF proposal: retry budget is per request\n\n## What\nA decision in kb\/expert/);
  const applied = ok(f.run(['--apply', '--slug', 'x', '--digest', checked.digest]));
  assert.equal(applied.published, true); assert.equal(applied.prs.length, 1); assert.equal(f.prs()[0].body, checked.prBody);
  assert.match(f.git(f.dir, '--git-dir', f.origin, 'log', '-1', '--format=%s', applied.prs[0].head), /^okf-proposal: retry budget is per request$/);
});

test('acceptance 4: version 1, a file in an unowned node and the base root log.md warn W_SCOPE; --apply publishes both rows', t => {
  const f = plainFixture(t), plan = ok(f.run(['--plan', '--slug', 'x'])), clone = edit(f, plan);
  write(join(clone, 'peer/claim.md'), '---\ntype: Note\ntitle: A peer lesson\ndescription: It belongs in peer.\n---\n\nx\n');
  fs.appendFileSync(join(clone, 'peer/index.md'), '\n* [A peer lesson](claim.md) - It belongs in peer.\n');
  fs.appendFileSync(join(clone, 'log.md'), '\n## 2026-11-20\n\n* **Update**: a peer lesson.\n');
  const checked = ok(f.run(['--check', '--slug', 'x']));
  const owner = 'W_SCOPE [was E_OWNER]: peer/claim.md is in node kb/peer, which this soul does not own; the maintainer chooses its home';
  const root = checked.warnings.find(w => w.startsWith('W_SCOPE [was E_SCOPE]: log.md is outside the write surface'));
  assert.ok(checked.warnings.includes(owner), JSON.stringify(checked.warnings)); assert.ok(root, JSON.stringify(checked.warnings));
  assert.ok(checked.warnings.some(w => w.startsWith('W_SCOPE [was E_OWNER]: peer/index.md is in node kb/peer')));
  const applied = ok(f.run(['--apply', '--slug', 'x', '--digest', checked.digest]));
  const rows = checkRows(f.prs()[0].body);
  assert.ok(rows.includes(owner) && rows.includes(root), JSON.stringify(rows)); assert.equal(applied.prs.length, 1);
  assert.deepEqual(rows, checked.warnings.filter(w => w.startsWith('W_')), 'the rows are the warnings, verbatim and in order');
});

test('acceptance 5: what protects the base still refuses with its code and pushes nothing', t => {
  const cases = [
    ['okf-base.json', (f, clone) => fs.writeFileSync(join(clone, 'okf-base.json'), fs.readFileSync(join(clone, 'okf-base.json'), 'utf8').replace('"other"', '"source"')), 'E_SCOPE'],
    ['expert/data.json', (f, clone) => write(join(clone, 'expert/data.json'), '{}\n'), 'E_SCOPE'],
    ['a hidden file', (f, clone) => write(join(clone, 'expert/.draft.md'), '---\ntype: Note\n---\nx\n'), 'E_SCOPE'],
    ['an executable bit', (f, clone) => fs.chmodSync(join(clone, 'expert/retry-budget.md'), 0o755), 'E_SCOPE'],
    ['a concept with no frontmatter', (f, clone) => write(join(clone, 'expert/bare.md'), 'no frontmatter\n'), 'E_VALIDATION'],
    ['a secret', (f, clone) => fs.appendFileSync(join(clone, 'expert/retry-budget.md'), `token ${SECRET}\n`), 'E_CONTENT_REFUSED'],
    ['a provenance fence in proposal.md', (f, clone, plan) => fs.appendFileSync(join(plan.proposal, 'proposal.md'), '\n```okf-proposal\n{}\n```\n'), 'E_PROPOSAL_FORMAT'],
  ];
  for (const [name, mutate, code] of cases) {
    const f = plainFixture(t), plan = ok(f.run(['--plan'])), clone = edit(f, plan);
    mutate(f, clone, plan);
    refused(f.run(['--check']), code);
    refused(f.run(['--apply']), code);
    assert.deepEqual(remoteRefs(f), ['refs/heads/main'], name); assert.deepEqual(f.prs(), [], name);
    assert.equal(fs.existsSync(join(plan.proposal, 'checked.json')), false, `${name}: a refused check records nothing`);
  }
});

test('acceptance 6: version 2, verdicts/, a workstream edit, a delete and a supersession no claim makes each answer ok with a W_SCOPE row', t => {
  for (const [path, mutate] of [
    ['verdicts/x.md', clone => write(join(clone, 'verdicts/x.md'), VERDICT('x'))],
    ['subjects/workstream/knowledge.md', clone => { const p = join(clone, 'subjects/workstream/knowledge.md'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('description: How', 'description: Why')); }],
    ['claims/insights/consult-reads-one-blob.md', clone => fs.rmSync(join(clone, 'claims/insights/consult-reads-one-blob.md'))],
    ['peer/lesson.md', clone => { const p = join(clone, 'peer/lesson.md'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('id: ins-000000000002', 'id: ins-000000000002\nstatus: superseded')); }],
  ]) {
    const f = subjectFixture(t, { decl: V2 }), plan = ok(f.run(['--plan'])), clone = plan.bases[0].clone;
    write(join(clone, 'claims/decisions/pin.md'), CLAIM('\nabout: [system/okf]'));
    mutate(clone);
    const checked = ok(f.run(['--check']));
    assert.ok(checked.warnings.some(w => w.startsWith(`W_SCOPE [was E_SCOPE]: ${path}: `)), `${path}: ${JSON.stringify(checked.warnings)}`);
    assert.ok(checkRows(checked.prBody).some(r => r.startsWith(`W_SCOPE [was E_SCOPE]: ${path}: `)), path);
  }
});

test('acceptance 7: a claim with no subject answers W_SUBJECT: version 1 unmapped, version 2 without about:, version 2 naming no subject file', t => {
  const v1 = subjectFixture(t), plan1 = ok(v1.run(['--plan'])), clone1 = plan1.bases[0].clone;
  const subject = join(clone1, 'subjects/system/okf.md');
  fs.writeFileSync(subject, fs.readFileSync(subject, 'utf8').replace('legacy-nodes: [expert]', 'legacy-nodes: []'));
  write(join(clone1, 'expert/pin.md'), CLAIM());
  fs.appendFileSync(join(clone1, 'expert/index.md'), '* [Pin owners before the first read](pin.md) - The owner is pinned before any consult read.\n');
  const w1 = ok(v1.run(['--check'])).warnings.filter(w => w.startsWith('W_SUBJECT'));
  assert.deepEqual(w1, ['W_SUBJECT [was E_SUBJECT]: expert/pin.md: no subject on this base names node expert in its legacy-nodes, so about: is left as written; the maintainer assigns its subject']);
  for (const about of ['', '\nabout: [system/nope]']) {
    const v2 = subjectFixture(t, { decl: V2 }), plan2 = ok(v2.run(['--plan']));
    write(join(plan2.bases[0].clone, 'claims/decisions/pin.md'), CLAIM(about));
    const checked = ok(v2.run(['--check']));
    const rows = checked.warnings.filter(w => w.startsWith('W_SUBJECT'));
    assert.equal(rows.length, 1, JSON.stringify(checked.warnings));
    assert.match(rows[0], about ? /^W_SUBJECT \[was E_VALIDATION\]: claims\/decisions\/pin\.md: about names "system\/nope", which has no subject file subjects\/system\/nope\.md; the maintainer assigns its subject$/
      : /^W_SUBJECT \[was E_VALIDATION\]: claims\/decisions\/pin\.md: 'about' must list one or more subjects/);
    // The regenerator ignores an unknown subject: the published indexes are its own.
    assert.ok(!checked.bases[0].changed.some(c => c.includes('subjects/system/nope')), JSON.stringify(checked.bases[0].changed));
    assert.ok(ok(v2.run(['--apply', '--digest', checked.digest])).prs.length === 1);
  }
});

test('acceptance 8: version 1 lints answer one W_LINT row each: an unreachable concept, a broken link, a missing description', t => {
  const f = plainFixture(t), plan = ok(f.run(['--plan'])), clone = edit(f, plan, { concept: 'Retry budget is per request; see [the old note](gone.md).\n' });
  write(join(clone, 'expert/orphan.md'), '---\ntype: Note\ntitle: Orphan\ndescription: Not in any index.\n---\nx\n');
  write(join(clone, 'expert/terse.md'), '---\ntype: Note\ntitle: Terse\n---\nx\n');
  fs.appendFileSync(join(clone, 'expert/index.md'), '* [Terse](terse.md)\n');
  const lints = ok(f.run(['--check'])).warnings.filter(w => w.startsWith('W_LINT'));
  assert.deepEqual(lints, [
    'W_LINT [was E_VALIDATION]: expert/orphan.md: unreachable from any index.md; the maintainer fixes it at review',
    'W_LINT [was E_VALIDATION]: expert/retry-budget.md: broken link: gone.md; the maintainer fixes it at review',
    "W_LINT [was E_VALIDATION]: expert/terse.md: missing recommended field 'description'; the maintainer fixes it at review",
  ]);
});

test('acceptance 9: a rejected id without reconsiders: answers W_VERDICT, and the PR body still lists the candidates', t => {
  const f = subjectFixture(t, { decl: V2 }), plan = ok(f.run(['--plan'])), clone = plan.bases[0].clone;
  write(join(clone, 'claims/decisions/again.md'), `---\ntype: Decision\ntitle: Something\ndescription: x\nabout: [system/okf]\nid: ${REJECTED.id}\n---\n\n# x\n`);
  write(join(clone, 'claims/decisions/same-title.md'), `---\ntype: Decision\ntitle: ${REJECTED.title}\ndescription: x\nabout: [system/okf]\n---\n\n# x\n`);
  const checked = ok(f.run(['--check']));
  const verdict = checked.warnings.filter(w => w.startsWith('W_VERDICT'));
  assert.equal(verdict.length, 1);
  assert.match(verdict[0], new RegExp(`^W_VERDICT \\[was E_VERDICT\\]: claims/decisions/again\\.md: claim id ${REJECTED.id} was rejected on 2026-11-10 .*; the maintainer judges whether it is the same claim or a reconsideration$`));
  const candidates = section(checked.prBody, 'Verdict candidates');
  assert.match(candidates, new RegExp(`- \`claims/decisions/again\\.md\` names the rejected id \`${REJECTED.id}\` \\(rejected\\) with no \`reconsiders:\` line`));
  assert.match(candidates, new RegExp(`- \`claims/decisions/same-title\\.md\`: title-hash candidate \`${REJECTED.id}\``));
  assert.ok(checked.prBody.indexOf('## Check warnings') < checked.prBody.indexOf('## Verdict candidates'), 'the warnings come before the verdict candidates');
  assert.equal(parseProvenance(checked.prBody).valid, true);
});

test('acceptance 10: an unrecognized note reference and notes/.a.md answer W_PROPOSAL and are not evidence; E_NOTE stays out of the rows', t => {
  const f = plainFixture(t), plan = ok(f.run(['--plan']));
  write(join(f.home, 'notes/.a.md'), 'hidden\n');
  edit(f, plan, { proposal: PROPOSAL(['notes/retry.md', 'notes/.a.md', 'notes/missing.md']).replace('Observed in', 'Observed (notes/a b.md) in') });
  const checked = ok(f.run(['--check']));
  const rows = checked.warnings.filter(w => w.startsWith('W_PROPOSAL'));
  assert.deepEqual(rows, [
    'W_PROPOSAL [was E_PROPOSAL_FORMAT]: backing note "notes/.a.md" is not a notes/<path>.md (no backslash or control character, no empty, hidden or parent segment): dropped from evidence',
    'W_PROPOSAL [was E_PROPOSAL_FORMAT]: unrecognized backing-note reference on line 10: dropped from evidence',
  ]);
  assert.deepEqual(parseProvenance(checked.prBody).value.evidence, [{ note: 'notes/retry.md', sha256: sha(fs.readFileSync(join(f.home, 'notes/retry.md'))) }, { note: 'notes/missing.md' }]);
  assert.ok(checked.warnings.some(w => w.startsWith('E_NOTE: notes/missing.md is missing')));
  assert.deepEqual(checkRows(checked.prBody), rows, 'E_NOTE is not a check warning');
});

test('acceptance 11: without --slug, --check and --apply use the one open proposal; with two, E_USAGE names both', t => {
  const f = plainFixture(t);
  refused(f.run(['--check']), 'E_USAGE', /^no open proposal: run oats okf propose --plan$/);
  const a = ok(f.run(['--plan', '--slug', 'first'])), b = ok(f.run(['--plan']));
  refused(f.run(['--check']), 'E_USAGE', new RegExp(`more than one open proposal \\((?:first, ${b.slug}|${b.slug}, first)\\)`));
  refused(f.run(['--apply']), 'E_USAGE', /more than one open proposal/);
  edit(f, a);
  const checked = ok(f.run(['--check', '--slug', 'first']));
  ok(f.run(['--apply', '--slug', 'first', '--digest', checked.digest]));
  assert.ok(fs.existsSync(join(a.proposal, 'publish')));
  edit(f, b);
  assert.equal(ok(f.run(['--check'])).proposal, b.proposal, 'the applied proposal is no longer open');
  // A bare --apply of the applied proposal refuses as attempted before printing anything.
  refused(f.run(['--apply', '--slug', 'first']), 'E_PROPOSAL_EXISTS', /never retry/);
});

test('acceptance 12: both okf-authoring copies are byte-identical, the publication, validator and regenerator scripts among them, and the lib copies match', () => {
  const caps = ['oats-okf', 'oats-okf-maintenance'].map(c => join(ROOT, 'oats-package/capabilities', c, 'skills/okf-authoring'));
  const files = dir => fs.readdirSync(dir, { recursive: true }).filter(p => fs.statSync(join(dir, p)).isFile()).sort();
  assert.deepEqual(files(caps[1]), files(caps[0]));
  for (const p of files(caps[0])) assert.ok(fs.readFileSync(join(caps[0], p)).equals(fs.readFileSync(join(caps[1], p))), p);
  for (const script of ['okf-publication.mjs', 'okf-validate.mjs', 'okf-reindex.mjs']) assert.ok(files(caps[0]).includes(join('scripts', script)), script);
  for (const script of ['okf-validate.mjs', 'okf-reindex.mjs']) assert.ok(fs.readFileSync(join(ROOT, 'oats-package/capabilities/oats-okf/lib', script)).equals(fs.readFileSync(join(caps[0], 'scripts', script))), `lib/${script}`);
});

// Beyond the pinned acceptance: the PR text built from the claims, and checked.json's edges.
test('a missing proposal.md builds the whole text from the claims; one with sections and no title gets only the title; a long title is cut', t => {
  const f = plainFixture(t), plan = ok(f.run(['--plan'])), clone = edit(f, plan);
  write(join(clone, 'expert/second.md'), '---\ntype: Note\ntitle: A second claim‮gnp.exe\ndescription: Second.\n---\nx\n');
  fs.appendFileSync(join(clone, 'expert/index.md'), '* [A second claim](second.md) - Second.\n');
  fs.rmSync(join(plan.proposal, 'proposal.md'));
  const built = ok(f.run(['--check']));
  assert.equal(built.prBody.split('\n```okf-proposal')[0], `# OKF proposal: Retry budget is per request (and 1 more)\n\n## What\n- expert/retry-budget.md: Retry budget is per request — Retries are budgeted per request.\n- expert/second.md: A second claim\\u202egnp.exe — Second.\n\n## Check warnings\n\nThe proposer's \`oats okf propose --check\` reported these. The knowledge maintainer resolves each before merging (fixed, moved, or accepted with a reason).\n\n- W_PROPOSAL [was E_PROPOSAL_FORMAT]: proposal.md was not filled; the PR text was built from the claims\n`);
  assert.match(built.commitText, /^okf-proposal: Retry budget is per request \(and 1 more\)\n/);
  // Sections and no title: the proposer's text is kept, the title is built.
  fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL().replace('# OKF proposal: retry budget is per request\n', '').replace('## What\nA decision in kb/expert: retries are budgeted per request.\n\n', ''));
  const titled = ok(f.run(['--check']));
  assert.match(titled.prBody, /^# OKF proposal: Retry budget is per request \(and 1 more\)\n\n## What\n- expert\/retry-budget\.md: .*\n- expert\/second\.md: .*\n\n## Why\nA future instance would otherwise size budgets per connection\.\n\n## Evidence\n/);
  assert.deepEqual(titled.warnings.filter(w => w.startsWith('W_PROPOSAL')), [
    'W_PROPOSAL [was E_PROPOSAL_FORMAT]: proposal.md has no `# OKF proposal: <one-line claim>` title; the title was built from the claims',
    'W_PROPOSAL [was E_PROPOSAL_FORMAT]: proposal.md has no `## What` section; the What list was built from the claims',
  ]);
  fs.writeFileSync(join(plan.proposal, 'proposal.md'), PROPOSAL().replace('retry budget is per request', 'x'.repeat(250)));
  const long = ok(f.run(['--check']));
  assert.match(long.commitText, new RegExp(`^okf-proposal: ${'x'.repeat(200)}\n`));
  assert.ok(long.warnings.includes('W_PROPOSAL [was E_PROPOSAL_FORMAT]: proposal.md: the one-line claim is longer than 200 characters; it was cut to 200'));
});

test('checked.json is never read or written through a symlink: --check and a bare --apply refuse E_PATH, push nothing and leave the target alone', t => {
  const f = plainFixture(t), plan = ok(f.run(['--plan'])); edit(f, plan);
  const checked = ok(f.run(['--check']));
  const elsewhere = join(f.dir, 'elsewhere.json'), record = join(plan.proposal, 'checked.json');
  fs.renameSync(record, elsewhere);
  const target = fs.readFileSync(elsewhere);
  fs.symlinkSync(elsewhere, record);
  refused(f.run(['--apply']), 'E_PATH', /symlink not allowed/);
  refused(f.run(['--check']), 'E_PATH', /symlink not allowed/);
  assert.deepEqual(remoteRefs(f), ['refs/heads/main']); assert.ok(fs.readFileSync(elsewhere).equals(target), 'the link target is untouched');
  // With the link gone, a bare --apply runs the check and stops, then publishes.
  fs.rmSync(record);
  const first = ok(f.run(['--apply']));
  assert.equal(first.published, false); assert.equal(first.digest, checked.digest);
  assert.equal(ok(f.run(['--apply'])).published, true);
});
