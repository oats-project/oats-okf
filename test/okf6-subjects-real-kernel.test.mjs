// oats.okf 6.0, the subject layout on the REAL released kernel (@awebai/oats
// 0.69.2). CI-only: it runs only when OATS_OKF_REAL_CLI names that kernel's
// bin/oats.mjs (the real-kernel-0692 CI job installs it and fails on any skip).
//
// Evidence boundary. Real: the released kernel's sync, spawn (soul resolution,
// module materialization, the oats.okf spawn hook and its brief in TASK.md) and
// in-home command dispatch; this checkout's oats-package pinned by commit from
// a file:// Git remote; a real bridged Git knowledge base (a bare repository on
// disk, base root `knowledge`). Not exercised: no model (harness fakes exit 98,
// every spawn is --no-launch), no messaging, no network, no GitHub.
//
// A version-2 home spawns against the bridged fixture and `oats okf index`
// prints its subjects' generated indexes; a version-1 home against the same
// base prints its node indexes, as on the plain base; a version-2 soul against
// a plain base is refused at spawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { machine } from './fixtures/real-machine.mjs';
import { writePlainBase, bridge } from './fixtures/bridged-base.mjs';

const cli = process.env.OATS_OKF_REAL_CLI;
const KERNEL = '0.69.2';
const root = fileURLToPath(new URL('../', import.meta.url));
const write = (file, text) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

test(`real OATS ${KERNEL}: a version-2 home reads subject indexes from a bridged base; a version-1 home reads its nodes unchanged; a version-2 soul on a plain base is refused`, { skip: !cli }, async t => {
  const base = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'okf6-real-kernel-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const { env, repo, asked } = machine(base);

  fs.cpSync(join(root, 'oats-package'), join(base, 'pkg/oats-package'), { recursive: true, verbatimSymlinks: true });
  const pkg = repo(join(base, 'pkg'), join(base, 'pkg.git'));
  const ws = join(base, 'ws');
  write(join(ws, 'oats-workspace.yaml'), `schemaVersion: 2\nname: okf6-real-kernel\nmembers:\n  - file://${base}/ws.git\npackages:\n  oats.okf: git:file://${base}/pkg.git@${pkg}\ndefaults:\n  capabilities:\n    oats.core: off\n  knowledge: { oats.okf: { from: package } }\n  messaging: none\n  tasks: none\n`);
  write(join(ws, 'oats-membership.yaml'), `schemaVersion: 2\nworkspace: file://${base}/ws.git\n`);
  const souls = {
    reader: { version: 2, subjects: ['system/okf', 'workstream/knowledge'] },
    expert: { version: 1, owner: 'owner-1', owns: ['project/expert'], reads: ['project/peer'] },
  };
  for (const [name, decl] of Object.entries(souls)) {
    write(join(ws, 'souls', name, 'soul.yaml'), `schemaVersion: 2\nname: ${name}\ndescription: Subject-layout fixture.\nwork: directory\n`);
    write(join(ws, 'souls', name, 'AGENTS.md'), `# ${name}\nNo model or production operations in this fixture.\n`);
    write(join(ws, 'souls', name, 'okf.json'), JSON.stringify(decl));
  }
  repo(ws, join(base, 'ws.git'));

  // Two knowledge repositories, base root `knowledge`: one bridged, one plain.
  const kb = plain => {
    const work = join(base, plain ? 'kb-plain' : 'kb-bridged'), dir = join(work, 'knowledge');
    writePlainBase(dir); if (!plain) bridge(dir);
    repo(work, join(base, plain ? 'plain.git' : 'bridged.git'));
    return join(base, plain ? 'plain.git' : 'bridged.git');
  };
  const dep = join(base, 'deployment'), bindingsFile = join(base, 'bindings.json');
  const bind = repository => write(bindingsFile, JSON.stringify({ version: 1, stateDir: join(base, 'state'), bases: { project: { id: 'base-1', kind: 'git', repository, root: 'knowledge', acceptedBranch: 'main', pr: { repository: 'fixture/knowledge' } } } }));
  const bridged = kb(false), plain = kb(true);
  bind(bridged);
  write(join(dep, 'oats-local.yaml'), `schemaVersion: 2\nworkspace: file://${base}/ws.git\nsettings:\n  oats.okf:\n    bindings-file: ${bindingsFile}\n`);

  const run = (args, { cwd = dep, as, json = true } = {}) => {
    const e = as ? { ...env, OATS_INSTANCE: as, OATS_INSTANCE_HOME: cwd, OATS_HOME: cwd } : env;
    const r = spawnSync(process.execPath, [cli, ...args, ...(json ? ['--json'] : [])], { cwd, env: e, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    let out = null; try { out = JSON.parse(r.stdout); } catch { /* text, or asserted by the caller */ }
    return { status: r.status, out, stdout: r.stdout, text: `oats ${args.join(' ')}\nstatus ${r.status}\n${r.stdout}\n${r.stderr}` };
  };
  const ok = (args, opts) => { const r = run(args, opts); assert.equal(r.status, 0, r.text); if (opts?.json !== false) assert.ok(r.out && r.out.ok !== false, r.text); return r; };
  const version = run(['version']);
  assert.equal(version.out?.version, KERNEL, 'this test qualifies the released 0.69.2 kernel, not another one');
  ok(['sync']);

  await t.test('a) a version-2 soul spawns against the bridged base; its brief lists its subjects; `oats okf index` prints their generated indexes', () => {
    const home = ok(['spawn', 'reader', '--name', 'reader-1', '--no-launch']).out.result.home;
    const task = fs.readFileSync(join(home, 'TASK.md'), 'utf8');
    assert.ok(task.includes('- system/okf — The knowledge provider package. (1 decision, 1 insight)\n- workstream/knowledge — How OATS keeps and proposes knowledge. (1 decision, 1 insight)'), task);
    const index = ok(['okf', 'index'], { cwd: home, as: 'reader-1', json: false });
    assert.match(index.stdout, /^## project\/system\/okf \(subject\)\n\n# oats-okf\n/);
    assert.match(index.stdout, /\n## project\/workstream\/knowledge \(subject\)\n\n# Knowledge\n/);
    assert.ok(index.stdout.includes('* [Pin the owner at spawn](/expert/decision.md) - The owner is pinned when the instance spawns.'), index.stdout);
    const claims = ok(['okf', 'claims', '--about', 'system/okf'], { cwd: home, as: 'reader-1' }).out.result.claims;
    assert.deepEqual(claims.map(c => c.path), ['expert/decision.md', 'claims/insights/consult-reads-one-blob.md']);
    // Old paths and old citations still resolve.
    assert.match(ok(['okf', 'cat', '--base', 'project', '/expert/decision.md'], { cwd: home, as: 'reader-1' }).out.result.text, /# Pin the owner at spawn/);
  });

  await t.test('b) a version-1 soul against the same bridged base: `oats okf index` prints its node indexes, as on the plain base', () => {
    const home = ok(['spawn', 'expert', '--name', 'expert-1', '--no-launch']).out.result.home;
    assert.match(fs.readFileSync(join(home, 'TASK.md'), 'utf8'), /`oats okf index` \(owns: project\/expert; reads: project\/peer\)/);
    const onBridged = ok(['okf', 'index'], { cwd: home, as: 'expert-1', json: false }).stdout;
    bind(plain);
    const onPlain = ok(['okf', 'index', '--fresh'], { cwd: home, as: 'expert-1', json: false }).stdout;
    const strip = text => text.replace(/\n— project@.*$/s, '');
    assert.match(onBridged, /^## project\/expert \(owns\)\n\n# expert\n/);
    assert.equal(strip(onBridged), strip(onPlain));
  });

  await t.test('c) a version-2 soul against a plain base is refused at spawn with the remedy', () => {
    const r = run(['spawn', 'reader', '--name', 'reader-2', '--no-launch']);
    assert.notEqual(r.status, 0, r.text);
    assert.match(r.text, /base project has no subject layout; declare owns\/reads \(version 1\) or bridge the base/);
  });

  assert.equal(fs.existsSync(asked), false, 'no model was started');
});
