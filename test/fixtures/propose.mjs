// oats.okf 6.0 test fixture (moved from test/okf6-propose.test.mjs, unchanged):
// a deployment with one Git base `kb` in a local bare remote, the soul `source`
// owning kb/expert and reading kb/peer, its live home `src`, and gh as an
// argv-checked local adapter (no GitHub).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initBase } from '../../oats-package/capabilities/oats-okf/lib/migration.mjs';
import { loadBindings } from '../../oats-package/capabilities/oats-okf/lib/config.mjs';
import { isolatedGit } from './isolated-git.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CLI = join(ROOT, 'oats-package/capabilities/oats-okf/bin/oats-okf.mjs');
export const write = (file, text) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
export const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const SECRET = `ghp_${'A'.repeat(36)}`;
export const CREATED = '2026-11-10T08:00:00.000Z';

export const FAKE_GH = String.raw`const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const a = process.argv.slice(2), state = process.env.FIXTURE_GH_STATE;
const s = fs.existsSync(state) ? JSON.parse(fs.readFileSync(state, 'utf8')) : { prs: [] };
const input = a.includes('--body-file') && a[a.indexOf('--body-file') + 1] === '-' ? fs.readFileSync(0, 'utf8') : null;
fs.appendFileSync(process.env.FIXTURE_GH_LOG, JSON.stringify({ argv: a, input }) + '\n');
const save = () => fs.writeFileSync(state, JSON.stringify(s));
if (process.env.FIXTURE_GH_FAIL === a.slice(0, 2).join(' ')) { console.error('fixture gh failure'); process.exit(9); }
if (a[0] === 'pr' && a[1] === 'list') { console.log(JSON.stringify(s.open || [])); process.exit(0); }
if (a[0] === 'api' && process.env.FIXTURE_GH_PREFLIGHT_FAIL_AT
  && fs.readFileSync(process.env.FIXTURE_GH_LOG, 'utf8').trim().split('\n').filter(l => JSON.parse(l).argv[0] === 'api').length === Number(process.env.FIXTURE_GH_PREFLIGHT_FAIL_AT)) { console.error('fixture gh failure'); process.exit(9); }
if (a[0] === 'api') { console.log(process.env.FIXTURE_GH_PUSH ?? 'true'); process.exit(0); }
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
export function fixture(t, { policy = { version: 1, harvest: 'on', reason: 'default' }, soulYaml = 'schemaVersion: 2\nname: source\nknowledge: oats.okf\n', record = {}, settings = {}, root = '.' } = {}) {
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
export const ok = r => { assert.equal(r.status, 0, JSON.stringify(r.out)); assert.equal(r.out.ok, true); return r.out.result; };
export const refused = (r, code, pattern) => {
  assert.equal(r.status, 1, JSON.stringify(r.out)); assert.equal(r.out.ok, false);
  assert.equal(r.out.error.code, code, JSON.stringify(r.out.error)); if (pattern) assert.match(r.out.error.message, pattern);
  return r.out.error;
};
export const PROPOSAL = (notes = ['notes/retry.md']) => `# OKF proposal: retry budget is per request\n\n## What\nA decision in kb/expert: retries are budgeted per request.\n\n## Why\nA future instance would otherwise size budgets per connection.\n\n## Evidence\nObserved in the load test of the retry work.\n\n## Backing notes\n${notes.map(n => `- ${n}`).join('\n')}\n`;
/** Write one concept into the clone, reachable from the node index, and fill proposal.md. */
export function edit(f, plan, { concept = 'Retry budget is per request, not per connection.\n', path = 'expert/retry-budget.md', proposal = PROPOSAL(), root = '.' } = {}) {
  const clone = root === '.' ? plan.bases[0].clone : join(plan.bases[0].clone, root);
  write(join(clone, path), `---\ntype: Decision\ntitle: Retry budget is per request\ndescription: Retries are budgeted per request.\n---\n\n${concept}`);
  if (path.startsWith('expert/')) fs.appendFileSync(join(clone, 'expert', 'index.md'), `\n* [Retry budget is per request](${path.slice('expert/'.length)}) - Retries are budgeted per request.\n`);
  fs.writeFileSync(join(plan.proposal, 'proposal.md'), proposal);
  return clone;
}
export const remoteRefs = f => f.git(f.dir, '--git-dir', f.origin, 'for-each-ref', '--format=%(refname)').split('\n').filter(Boolean);
