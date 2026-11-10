// This checkout's oats.okf on the REAL released kernel (@awebai/oats 0.69.2). CI-only:
// it runs only when OATS_OKF_REAL_CLI names that kernel's bin/oats.mjs (the
// real-kernel-0692 CI job installs it and fails on any skip).
//
// Evidence boundary. What is real: the released kernel's sync, operator and
// in-home command dispatch, spawn (soul resolution, module materialization,
// skill composition, the oats.okf spawn hook, the TASK.md copy, lineage) and
// retire; this checkout's oats-package, pinned by commit from a file:// Git
// remote; a real Git knowledge base (a bare repository on disk). What is NOT
// exercised: no model (pi/claude/codex on PATH are fakes that record being
// asked and exit 98, and every spawn is --no-launch), no GitHub (`oats okf
// propose` runs --plan and --check through the kernel's in-home and operator
// dispatch; --apply's push and PR are the unit suite's, against a local
// remote and a fake gh), no messaging (messaging: none, tasks: none,
// oats.core off), no network, host timer or production setting. HOME,
// OATS_HOME_DIR and every repository live in one temporary directory.
//
// One fixture, ordered steps (a)-(g): each subtest is one concern and builds
// on the state the previous one left, as a deployment would live through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { dirname, join, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseProvenance } from '../oats-package/capabilities/oats-okf-maintenance/lib/provenance.mjs';
import { machine } from './fixtures/real-machine.mjs';

const cli = process.env.OATS_OKF_REAL_CLI;
const KERNEL = '0.69.2';
const root = fileURLToPath(new URL('../', import.meta.url));
const write = (file, text) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const real = p => fs.realpathSync(p);
/** Every path under dir (relative, sorted), with each file's size: a cheap "nothing was written" witness. */
const listing = dir => {
  const out = [];
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) { out.push(`${r}/`); walk(join(d, e.name), r); } else out.push(`${r} ${fs.lstatSync(join(d, e.name)).size}`); } };
  walk(dir, ''); return out.sort();
};
/** Every string value in a JSON document. */
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out); return out; };

const HARVESTER_DIR = 'oats-okf--knowledge-harvester'; // packageSoulAgentName('oats.okf', 'knowledge-harvester'): no home is ever kept
const { REMOVED_SPAWN } = await import('../oats-package/capabilities/oats-okf-harvest/bin/okf-harvest.mjs');

test(`${json(join(root, 'package.json')).version} real OATS ${KERNEL}: legacy-key cleanup, a source spawn proposing by PR (plan, check), the retired source's recovery form, no harvester, knowledge.propose and opt-out refusals, and the maintainer soul`, { skip: !cli }, async t => {
  const base = real(fs.mkdtempSync(join(tmpdir(), 'okf5-real-kernel-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  assert.doesNotMatch(base, /harvest/, 'the cleanup reader looks for the word harvest in oats-local.yaml; the fixture path must not carry it');

  // ---- an isolated machine: node and git only, harnesses that refuse to run ----
  const { env, git, repo, asked } = machine(base);

  // ---- the package under test, pinned by commit; a workspace with one source soul ----
  fs.cpSync(join(root, 'oats-package'), join(base, 'pkg/oats-package'), { recursive: true, verbatimSymlinks: true });
  const pkg = repo(join(base, 'pkg'), join(base, 'pkg.git'));
  const ws = join(base, 'ws'), soul = join(ws, 'souls/source');
  write(join(ws, 'oats-workspace.yaml'), `schemaVersion: 2\nname: okf5-real-kernel\nmembers:\n  - file://${base}/ws.git\npackages:\n  oats.okf: git:file://${base}/pkg.git@${pkg}\ndefaults:\n  capabilities:\n    oats.core: off\n  knowledge: { oats.okf: { from: package } }\n  messaging: none\n  tasks: none\n`);
  write(join(ws, 'oats-membership.yaml'), `schemaVersion: 2\nworkspace: file://${base}/ws.git\n`);
  write(join(soul, 'soul.yaml'), 'schemaVersion: 2\nname: source\ndescription: Domain expert fixture.\nwork: directory\n');
  write(join(soul, 'AGENTS.md'), '# Source\nNo model or production operations in this fixture.\n');
  write(join(soul, 'okf.json'), JSON.stringify({ version: 1, owner: 'source-owner', owns: ['project/expert'], reads: ['project/peer'] }));
  // Souls whose authors opt out (both spellings): they consult, but never publish knowledge.
  for (const [name, optOut] of [['quiet', 'harvest'], ['hushed', 'publish']]) {
    const dir = join(ws, 'souls', name);
    write(join(dir, 'soul.yaml'), `schemaVersion: 2\nname: ${name}\ndescription: Public fixture soul that opts out.\nwork: directory\nknowledge: { ${optOut}: off }\n`);
    write(join(dir, 'AGENTS.md'), `# ${name}\nNo model or production operations in this fixture.\n`);
    write(join(dir, 'okf.json'), JSON.stringify({ version: 1, owner: 'source-owner', owns: ['project/expert'], reads: ['project/peer'] }));
  }
  // A soul that still asks for the removed proposer setting: its spawn is refused.
  const pushySoul = join(ws, 'souls/pushy');
  write(join(pushySoul, 'soul.yaml'), 'schemaVersion: 2\nname: pushy\ndescription: Fixture soul with knowledge.propose.\nwork: directory\nknowledge: { propose: on }\n');
  write(join(pushySoul, 'AGENTS.md'), '# Pushy\nNo model or production operations in this fixture.\n');
  write(join(pushySoul, 'okf.json'), JSON.stringify({ version: 1, owner: 'source-owner', owns: [], reads: ['project/peer'] }));
  repo(ws, join(base, 'ws.git'));

  // ---- the deployment: one Git knowledge base, and a 4.x harvest key left in its host settings ----
  const dep = join(base, 'deployment'), bindingsFile = join(base, 'bindings.json'), kbRemote = join(base, 'knowledge.git');
  const bindingsDoc = { version: 1, stateDir: join(base, 'state'), bases: { project: { id: 'kb-1', kind: 'git', repository: kbRemote, root: 'knowledge', acceptedBranch: 'main', pr: { repository: 'fixture/knowledge' } } } };
  write(bindingsFile, JSON.stringify(bindingsDoc));
  write(join(base, 'nodes.json'), JSON.stringify({ expert: { path: 'expert', owner: 'source-owner' }, peer: { path: 'peer', owner: 'peer-owner' } }));
  const localYaml = join(dep, 'oats-local.yaml');
  write(localYaml, `schemaVersion: 2\nworkspace: file://${base}/ws.git\nsettings:\n  oats.okf:\n    bindings-file: ${bindingsFile}\n    harvest: off\n`);

  /** The real kernel: from the deployment (operator), or from an instance home as that
   *  instance's session runs it (OATS_INSTANCE/OATS_INSTANCE_HOME/OATS_HOME, cwd = home). */
  const run = (args, { cwd = dep, as } = {}) => {
    const e = as ? { ...env, OATS_INSTANCE: as.instance, OATS_INSTANCE_HOME: as.home, OATS_HOME: as.home } : env;
    const r = spawnSync(process.execPath, [cli, ...args, '--json'], { cwd, env: e, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* asserted by the caller */ }
    return { status: r.status, out, text: `oats ${args.join(' ')}\nstatus ${r.status}\n${r.stdout}\n${r.stderr}` };
  };
  const ok = (args, opts) => { const r = run(args, opts); assert.equal(r.status, 0, r.text); assert.ok(r.out && r.out.ok !== false, r.text); return r.out; };
  const refused = (args, code, opts) => { const r = run(args, opts); assert.notEqual(r.status, 0, r.text); assert.equal(r.out?.ok, false, r.text); assert.equal(r.out.error.code, code, r.text); return r.out.error; };

  // The kernel this file qualifies, exactly (bin/oats.mjs versionCmd: top-level `version`).
  const version = run(['version']);
  assert.equal(version.status, 0, version.text);
  assert.equal(version.out?.version, KERNEL, 'this test qualifies the released 0.69.2 kernel, not another one');
  ok(['sync']);

  const state = {};

  await t.test('a) a 4.x host key refuses every okf command with its origin and fix; setup --remove-legacy-settings plans, removes it, and okf works again', () => {
    const e = refused(['okf', 'inspect', '--soul', 'source'], 'E_REMOVED');
    assert.match(e.message, /settings\.oats\.okf\.harvest from host \(oats-local\.yaml#\/settings\/oats\.okf\) was removed in oats\.okf 5\.0/, 'the kernel forwards the host origin (OATS_SETTINGS_ORIGINS) and the provider names it');
    assert.ok(e.message.includes('oats okf setup --remove-legacy-settings --soul <soul> --json'), e.message);
    assert.doesNotMatch(e.message, /\boff\b/, 'the refusal names the key, never its value');

    const before = fs.readFileSync(localYaml);
    const plan = ok(['okf', 'setup', '--remove-legacy-settings', '--soul', 'source', '--plan']).result;
    assert.deepEqual(plan, { file: join(dep, 'oats-local.yaml'), removed: ['settings.oats.okf.harvest'], plan: true, written: false });
    assert.deepEqual(fs.readFileSync(localYaml), before, '--plan writes nothing');

    const applied = ok(['okf', 'setup', '--remove-legacy-settings', '--soul', 'source']).result;
    assert.deepEqual(applied, { file: join(dep, 'oats-local.yaml'), removed: ['settings.oats.okf.harvest'], written: true });
    const after = fs.readFileSync(localYaml, 'utf8');
    assert.doesNotMatch(after, /harvest/);
    assert.ok(after.includes(`    bindings-file: ${bindingsFile}\n`), 'only the legacy line is removed');
    assert.deepEqual(ok(['okf', 'setup', '--remove-legacy-settings', '--soul', 'source']).result, { file: join(dep, 'oats-local.yaml'), removed: [], written: false }, 'idempotent');

    // okf commands run again: init stages the base, it is published as the accepted Git base, and bases reads it.
    const staged = ok(['okf', 'init', '--base', 'project', '--nodes', join(base, 'nodes.json'), '--output', join(base, 'stage'), '--soul', 'source']).result;
    assert.equal(staged.status, 'staged', JSON.stringify(staged));
    const kbWork = join(base, 'kb-work');
    fs.mkdirSync(kbWork); fs.cpSync(join(base, 'stage'), join(kbWork, 'knowledge'), { recursive: true });
    repo(kbWork, kbRemote); git(kbRemote, ['config', 'uploadpack.allowFilter', 'true']);
    const bases = ok(['okf', 'bases', '--soul', 'source']).result.bases;
    assert.equal(bases.length, 1, JSON.stringify(bases));
    assert.equal(bases[0].alias, 'project'); assert.equal(bases[0].kind, 'git');
    assert.deepEqual(bases[0].validated, { ok: true }, JSON.stringify(bases[0]));
    assert.deepEqual(bases[0].owns, ['expert']); assert.deepEqual(bases[0].reads, ['peer']);
  });

  await t.test('b) a source spawned from the package proposes by PR: --plan clones its owned base and prints the write surface; --check prints the outgoing diff and a v3 block', () => {
    // The working source: directory work, the real oats.okf spawn hook (required) seeds instance knowledge.
    const spawned = ok(['spawn', 'source', '--name', 'src', '--no-launch']).result;
    assert.equal(spawned.launched, false);
    const src = spawned.home;
    // Only the package's service soul is background: a working soul composing oats.okf is not.
    assert.equal(spawned.background, false);
    assert.equal(fs.existsSync(join(src, '.oats-background.json')), false);
    assert.equal(real(src), real(join(dep, 'agents/source/instances/src')));
    for (const p of ['STATE.md', 'log.md']) assert.ok(fs.statSync(join(src, p)).isFile(), `${p} seeded by the spawn hook`);
    assert.ok(fs.statSync(join(src, 'notes')).isDirectory());
    const srcRecord = json(join(src, 'instance.json'));
    assert.equal(srcRecord.capabilityMeta?.['oats.okf'], undefined, 'no meta: the hook creates no external state for the kernel to keep');
    assert.doesNotMatch(fs.readFileSync(join(src, 'TASK.md'), 'utf8'), /harvest|propos|okf-propose/i, 'no proposing direction in TASK.md');
    const srcAgents = fs.readFileSync(join(src, 'AGENTS.md'), 'utf8');
    assert.ok(srcAgents.includes('## Knowledge: OKF'), 'the okf inject is composed');
    assert.match(srcAgents, /\*\*okf-propose\*\* skill is \*\*compulsory\*\*/);
    assert.match(srcAgents, /oats okf propose --plan --slug <slug>/);
    assert.doesNotMatch(srcAgents, /harvester/i, 'no harvester in the composed instructions');
    const as = { instance: 'src', home: src };
    assert.deepEqual(ok(['okf', 'status'], { cwd: src, as }).result, { harvest: 'on', reason: 'default', publish: 'on' });
    const srcSkills = srcRecord.skills.map(s => s.name);
    for (const s of ['okf-consultation', 'okf-instance-knowledge', 'okf-propose', 'knowledge-theory', 'okf-authoring']) {
      assert.ok(srcSkills.includes(s), `source composes ${s}: ${srcSkills}`);
      assert.ok(fs.existsSync(join(src, '.agents/skills', s, 'SKILL.md')), `${s} materialized`);
    }
    assert.ok(fs.existsSync(join(src, '.agents/skills/okf-authoring/scripts/okf-publication.mjs')), 'the proposer has its own copy of the publication helper');

    // --plan through the kernel's in-home dispatch: the clone at the accepted branch, the skeleton, the write surface.
    const plan = ok(['okf', 'propose', '--plan', '--slug', 'retry-budget'], { cwd: src, as }).result;
    assert.ok(real(plan.proposal).startsWith(real(join(src, 'proposals')) + sep), plan.proposal);
    assert.equal(plan.form, 'live');
    const [b] = plan.bases;
    assert.equal(b.alias, 'project'); assert.deepEqual(b.surface, ['knowledge/expert/', 'knowledge/index.md']); assert.deepEqual(b.nodes, ['project/expert']);
    assert.equal(b.accepted, git(kbRemote, ['rev-parse', 'refs/heads/main']));
    assert.ok(b.duplicates.unavailable, 'no gh on this machine: the duplicate list is reported unavailable, never a refusal');
    assert.ok(fs.statSync(join(b.clone, 'knowledge/okf-base.json')).isFile());

    // The instance writes one concept and fills the proposal; --check prints the diff and the digest.
    write(join(src, 'notes/decision.md'), '---\ntype: Decision\ntitle: Retry budget is per request\ndescription: The retry budget is counted per request, not per connection.\ngenerality: soul\n---\n\nPer-connection budgets let one slow request starve the others.\n');
    write(join(b.clone, 'knowledge/expert/retry-budget.md'), '---\ntype: Decision\ntitle: Retry budget is per request\ndescription: The retry budget is counted per request, not per connection.\n---\n\nPer-connection budgets let one slow request starve the others.\n');
    fs.appendFileSync(join(b.clone, 'knowledge/expert/index.md'), '\n* [Retry budget is per request](retry-budget.md) - The retry budget is counted per request, not per connection.\n');
    write(join(plan.proposal, 'proposal.md'), '# OKF proposal: retry budget is per request\n\n## What\nA decision in project/expert.\n\n## Why\nA per-connection budget let one slow request starve the others.\n\n## Evidence\nObserved in the fixture load test.\n\n## Backing notes\n- notes/decision.md\n');
    const check = ok(['okf', 'propose', '--check', '--slug', 'retry-budget'], { cwd: src, as }).result;
    assert.match(check.digest, /^[0-9a-f]{64}$/);
    assert.deepEqual(check.bases[0].changed.sort(), ['A knowledge/expert/retry-budget.md', 'M knowledge/expert/index.md']);
    const parsed = parseProvenance(check.prBody);
    assert.equal(parsed.valid, true, parsed.problems.join('; '));
    assert.equal(parsed.value.source.incarnation, srcRecord.createdAt);
    assert.deepEqual(parsed.value.proposer, { form: 'live', instance: 'src', alias: null }, 'messaging: none, so no alias');
    assert.deepEqual(parsed.value.evidence, [{ note: 'notes/decision.md', sha256: createHash('sha256').update(fs.readFileSync(join(src, 'notes/decision.md'))).digest('hex') }]);
    assert.ok(!check.prBody.includes(src) && !check.prBody.includes(kbRemote), 'no home or clone path in the PR body');
    // An out-of-surface edit is refused by the same dispatch.
    write(join(b.clone, 'knowledge/peer/claim.md'), '---\ntype: Note\n---\nx\n');
    refused(['okf', 'propose', '--check', '--slug', 'retry-budget'], 'E_OWNER', { cwd: src, as });
    fs.rmSync(join(b.clone, 'knowledge/peer/claim.md'));
    assert.equal(git(kbRemote, ['for-each-ref', '--format=%(refname)']), 'refs/heads/main', 'nothing was pushed');
    assert.equal(fs.existsSync(join(dep, 'agents', HARVESTER_DIR)), false, 'no harvester was spawned');
    Object.assign(state, { src, slug: 'retry-budget' });
  });

  await t.test('c) oats spawn oats.okf/knowledge-harvester is refused by the stub\'s spawn hook with the E_REMOVED fix, and keeps no home', () => {
    const { src } = state;
    write(join(src, 'proposals/old-style.md'), `# OKF proposal: x\n\nSource: instance src, home ${src}, soul source\n\n## What\nA claim.\n`);
    const r = run(['spawn', 'oats.okf/knowledge-harvester', '--task-file', 'proposals/old-style.md', '--relation', 'unrelated', '--no-launch'], { cwd: src, as: { instance: 'src', home: src } });
    assert.notEqual(r.status, 0, r.text);
    assert.ok(r.text.replace(/\s+/g, ' ').includes(REMOVED_SPAWN), r.text);
    const instances = join(dep, 'agents', HARVESTER_DIR, 'instances');
    assert.deepEqual(fs.existsSync(instances) ? fs.readdirSync(instances).filter(n => !n.startsWith('.')) : [], [], 'no harvester home is kept');
  });

  await t.test('d) the removed surfaces refuse on the real kernel, naming oats okf propose, and create nothing', () => {
    const { src } = state;
    const before = listing(src);
    const e1 = refused(['okf', 'harvest'], 'E_REMOVED', { cwd: src, as: { instance: 'src', home: src } });
    assert.match(e1.message, /oats okf harvest was removed in oats\.okf 5\.0: run `oats okf propose` from the instance home/);
    // A working home does not compose the stub capability, so the kernel itself
    // refuses its commands there (the stub answers E_REMOVED only where composed).
    refused(['okf-harvest', 'complete', '--source', 'x', '--run', 'y'], 'E_UNKNOWN_COMMAND', { cwd: src, as: { instance: 'src', home: src } });
    const e3 = refused(['okf-maintenance', 'notify-harvester', '--pr', 'https://github.com/fixture/knowledge/pull/1', '--state', 'merged'], 'E_REMOVED');
    assert.match(e3.message, /there is no harvester; the proposer reads the PR/);
    assert.deepEqual(listing(src), before);
  });

  await t.test('e) a retired source: the operator form reads its retirement recovery copy and proposes from it', () => {
    const { src } = state;
    const r = run(['retire', 'src']);
    assert.equal(r.status, 0, r.text);
    assert.equal(fs.existsSync(src), false);
    const recovery = r.out.workRecovery.path;
    assert.ok(fs.existsSync(join(recovery, 'recovery.json')), recovery);
    // The live-home form now has nothing to read.
    refused(['okf', 'propose', '--plan', '--slug', 'gone', '--soul', 'source', '--home', src], 'E_SOURCE');
    const plan = ok(['okf', 'propose', '--plan', '--slug', 'recovered', '--soul', 'source', '--home', recovery]).result;
    assert.equal(plan.form, 'recovery');
    const manifest = json(join(recovery, 'recovery.json'));
    const copy = join(recovery, ...(manifest.afterHooks?.home ? ['after-hooks', 'home'] : ['home']));
    assert.ok(real(plan.proposal).startsWith(real(join(copy, 'proposals')) + sep), plan.proposal);
    const clone = plan.bases[0].clone;
    write(join(clone, 'knowledge/expert/recovered.md'), '---\ntype: Lesson\ntitle: Recovered lesson\ndescription: A lesson proposed from a retired seat.\n---\n\nProposed from the recovery copy.\n');
    fs.appendFileSync(join(clone, 'knowledge/expert/index.md'), '\n* [Recovered lesson](recovered.md) - A lesson proposed from a retired seat.\n');
    write(join(plan.proposal, 'proposal.md'), '# OKF proposal: recovered lesson\n\n## What\nA lesson in project/expert.\n\n## Why\nIt outlives the retired seat.\n\n## Evidence\nThe retired seat\'s decision note.\n\n## Backing notes\n- notes/decision.md\n');
    const check = ok(['okf', 'propose', '--check', '--slug', 'recovered', '--soul', 'source', '--home', recovery]).result;
    const block = parseProvenance(check.prBody).value;
    assert.deepEqual(block.proposer, { form: 'recovery', instance: null, alias: null });
    assert.equal(block.source.instance, 'src');
    assert.ok(block.evidence[0].sha256, 'the recovered note is read and hashed');
    assert.equal(fs.existsSync(asked), false, 'no harness was ever asked to start a model');
  });

  await t.test('f) opted-out souls (harvest: off, publish: off) consult, read status off and are refused by propose; knowledge.propose refuses the spawn', () => {
    for (const [name, home] of [['quiet', 'quiet-1'], ['hushed', 'hushed-1']]) {
      const h = ok(['spawn', name, '--name', home, '--no-launch']).result.home;
      const as = { instance: home, home: h };
      const agents = fs.readFileSync(join(h, 'AGENTS.md'), 'utf8');
      assert.match(agents, /\*\*okf-propose\*\* skill is \*\*compulsory\*\*/);
      assert.match(agents.replace(/\n> /g, ' '), /knowledge: \{ harvest: off \}` \(or `publish: off`\) has no duty to propose/);
      assert.doesNotMatch(fs.readFileSync(join(h, 'TASK.md'), 'utf8'), /harvest|propos|okf-propose/i);
      assert.deepEqual(ok(['okf', 'status'], { cwd: h, as }).result, { harvest: 'off', reason: 'soul-opt-out', publish: 'off' });
      ok(['okf', 'bases'], { cwd: h, as });
      refused(['okf', 'propose', '--plan', '--slug', 'x'], 'E_OPTED_OUT', { cwd: h, as });
      assert.equal(fs.existsSync(join(h, 'proposals')), false, 'nothing cloned');
    }
    const pushy = run(['spawn', 'pushy', '--name', 'pushy-1', '--no-launch']);
    assert.notEqual(pushy.status, 0, pushy.text);
    assert.match(pushy.text, /E_CONFIG: knowledge\.propose is not a setting; instances propose directly in oats\.okf 6; use harvest: off to opt out/);
    assert.equal(fs.existsSync(join(dep, 'agents/pushy/instances/pushy-1/instance.json')), false, 'the refused spawn keeps no home');
    assert.equal(fs.existsSync(asked), false);
  });

  await t.test('g) the knowledge maintainer soul still previews and defaults to background from its soul', () => {
    const preview = ok(['spawn', 'oats.okf/knowledge-maintainer', '--preview']);
    assert.ok(JSON.stringify(preview).includes('oats.okf-maintenance'), JSON.stringify(preview).slice(0, 400));
    const m = ok(['spawn', 'oats.okf/knowledge-maintainer', '--name', 'reviewer', '--no-launch']).result;
    assert.equal(m.launched, false);
    assert.equal(m.background, true, 'the maintainer soul places new maintainers in the background');
    assert.equal(m.backgroundFrom, 'soul');
    assert.ok(fs.existsSync(join(m.home, '.oats-background.json')), 'the maintainer home records background');
    const skills = json(join(m.home, 'instance.json')).skills.map(s => s.name);
    for (const s of ['knowledge-review', 'knowledge-theory', 'okf-authoring', 'okf-trigger-setup']) assert.ok(skills.includes(s), `maintainer composes ${s}: ${skills}`);
    assert.equal(fs.existsSync(asked), false, 'no harness was asked to start a model');
  });

  await t.test('h) the kernel\'s own trigger matcher: proposal-review fires on an okf-proposal PR, harvest-review on an okf-harvest PR, each alone', async () => {
    // The kernel ANDs on.labels (docs/schedules.md: all must be present), so each template carries one label.
    const { instantiateTemplate, eventsFor } = await import(pathToFileURL(join(dirname(dirname(cli)), 'lib', 'triggers.mjs')).href);
    const pr = labels => ({ number: 7, url: 'https://github.com/acme/kb/pull/7', headSha: 'a'.repeat(40), base: 'main', draft: false, labels, createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z' });
    const fires = (template, labels) => eventsFor(instantiateTemplate(json(join(root, 'oats-package/triggers', `${template}.json`)), { repo: 'github.com/acme/kb' }), undefined, pr(labels)).map(e => e.event);
    assert.deepEqual(fires('proposal-review', ['okf-proposal']), ['opened']);
    assert.deepEqual(fires('harvest-review', ['okf-harvest']), ['opened']);
    assert.deepEqual(fires('proposal-review', ['okf-harvest']), []);
    assert.deepEqual(fires('harvest-review', ['okf-proposal']), []);
    assert.deepEqual(fires('proposal-review', []), [], 'an unlabelled PR is not a proposal');
    // A PR carrying both labels fires both (the docs warn never to add both while both are installed).
    assert.deepEqual([fires('proposal-review', ['okf-harvest', 'okf-proposal']), fires('harvest-review', ['okf-harvest', 'okf-proposal'])], [['opened'], ['opened']]);
  });

  await t.test('i) migrating a local harvest-review trigger: show it, add proposal-review with its own values, keep or remove the old one', () => {
    const show = id => { const out = ok(['trigger', 'show', id]); const row = out.result?.trigger; assert.ok(row?.on, JSON.stringify(out).slice(0, 600)); return row; };
    // A 5.x installation with non-default values (the release note's hand steps must keep them).
    ok(['trigger', 'add', '--from', 'oats.okf:harvest-review', '--set', 'repo=github.com/acme/kb', '--set', 'base=accepted', '--set', 'harness=pi', '--set', 'model=custom-model']);
    const old = show('okf-harvest-review');
    const values = { repo: old.on.repo, base: old.on.base, harness: old.spawn.harness, model: old.spawn.model };
    assert.deepEqual(values, { repo: 'github.com/acme/kb', base: 'accepted', harness: 'pi', model: 'custom-model' }, JSON.stringify(old));
    ok(['trigger', 'add', '--from', 'oats.okf:proposal-review', ...Object.entries(values).flatMap(([k, v]) => ['--set', `${k}=${v}`])]);
    const added = show('okf-proposal-review');
    assert.deepEqual([added.on.labels, added.on.repo, added.on.base, added.spawn.harness, added.spawn.model, added.spawn.soul], [['okf-proposal'], 'github.com/acme/kb', 'accepted', 'pi', 'custom-model', 'oats.okf/knowledge-maintainer']);
    assert.deepEqual(show('okf-harvest-review').on.labels, ['okf-harvest'], 'the old trigger keeps serving 5.x okf-harvest PRs');
    ok(['trigger', 'remove', 'okf-harvest-review']);
    ok(['trigger', 'remove', 'okf-proposal-review']);
  });

  await t.test('j) migrating a workspace harvest-review file: the release note\'s copy command and trust line give a second trigger that runs on the review host', async () => {
    const lib = name => import(pathToFileURL(join(dirname(dirname(cli)), 'lib', name)).href);
    const { automationFileText, discoverAutomations, hostOf, placementOf } = await lib('automations.mjs');
    const { triggerKind } = await lib('triggers.mjs');
    // The README's commands, verbatim (the CHANGELOG carries the same).
    const readme = fs.readFileSync(join(root, 'README.md'), 'utf8').replace(/\n\s+/g, ' ');
    const copy = "sed -e 's/oats.okf:harvest-review/oats.okf:proposal-review/' -e 's/^id: okf-harvest-review$/id: okf-proposal-review/' oats-triggers/okf-harvest-review.yaml > oats-triggers/okf-proposal-review.yaml";
    assert.ok(readme.includes(copy), 'the README names this exact copy command');
    assert.ok(readme.includes('`- <member>/okf-proposal-review`'), 'and the trust line');
    // The file `oats trigger add --workspace` writes (explicit id, non-default values), then the copy command run by a shell.
    const member = join(base, 'automation-member'); fs.mkdirSync(join(member, 'oats-triggers'), { recursive: true });
    const old = automationFileText(triggerKind(), { id: 'okf-harvest-review', runsOn: 'review-host', owner: 'github.com/kb-bot', body: { from: 'oats.okf:harvest-review', set: { repo: 'github.com/acme/kb', base: 'accepted', harness: 'pi', model: 'custom-model' } } });
    assert.match(old, /^id: okf-harvest-review$/m, 'the kernel writes an explicit id');
    write(join(member, 'oats-triggers/okf-harvest-review.yaml'), old);
    const sh = spawnSync('sh', ['-c', copy], { cwd: member, encoding: 'utf8' });
    assert.equal(sh.status, 0, sh.stderr);
    // The kernel's own discovery, parsing and template expansion, against this package's templates.
    const files = Object.fromEntries(['okf-harvest-review', 'okf-proposal-review'].map(n => [`oats-triggers/${n}.yaml`, fs.readFileSync(join(member, `oats-triggers/${n}.yaml`))]));
    const pkgTemplates = Object.fromEntries(['harvest-review', 'proposal-review'].map(n => [`oats-package/triggers/${n}.json`, fs.readFileSync(join(root, 'oats-package/triggers', `${n}.json`))]));
    pkgTemplates['oats-package/oats-package.json'] = fs.readFileSync(join(root, 'oats-package/oats-package.json'));
    const all = { ...files, ...pkgTemplates };
    const remote = { listRemoteTree: async () => Object.keys(all).map(path => ({ path, type: 'blob' })), readRemoteFile: async (_r, _c, path) => ({ bytes: Buffer.from(all[path]) }) };
    const lock = { packages: { 'oats.okf': { version: '6.0.0', commit: 'a'.repeat(40), path: 'oats-package', source: 'git:file:///pkg.git', repository: 'file:///pkg.git' } } };
    const found = await discoverAutomations({ members: [{ confirmed: true, commit: 'b'.repeat(40), key: 'github.com/acme/workspace' }] }, { remote, memberName: () => 'workspace', kinds: [triggerKind({ lock, remote })] });
    assert.deepEqual(found.problems, [], JSON.stringify(found.problems));
    const byId = Object.fromEntries(found.byKind.trigger.map(a => [a.id, a]));
    assert.deepEqual(Object.keys(byId).sort(), ['workspace/okf-harvest-review', 'workspace/okf-proposal-review']);
    const fresh = byId['workspace/okf-proposal-review'];
    assert.equal(fresh.invalid, undefined, JSON.stringify(fresh.invalid));
    assert.deepEqual([fresh.definition.on.labels, fresh.definition.on.repo, fresh.definition.on.base, fresh.definition.spawn.harness, fresh.definition.spawn.model, fresh.runsOn, fresh.owner],
      [['okf-proposal'], 'github.com/acme/kb', 'accepted', 'pi', 'custom-model', 'review-host', 'github.com/kb-bot']);
    // Trust: a named list without the new id leaves it untrusted; the documented line makes it run.
    const io = { gh: () => ({ status: 0, stdout: 'kb-bot\n', stderr: '' }) };
    const place = trust => placementOf(fresh, { host: hostOf({ host: { name: 'review-host' }, automations: { trust } }), io });
    assert.equal(place(['workspace/okf-harvest-review']).reason, 'untrusted');
    assert.equal(place(['workspace/okf-harvest-review', 'workspace/okf-proposal-review']).runsHere, true);
    assert.equal(place('*').runsHere, true);
  });
});
