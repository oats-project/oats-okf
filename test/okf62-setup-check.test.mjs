// oats.okf 6.2 (#150): `oats okf setup --check`. Real Git and a local bare
// remote; what GitHub answers (whether the credential can publish, its role,
// the branch rule, the label) is a replaced probe or a fake gh, so these tests
// prove the table of findings and fixes, NOT what GitHub reports for a given
// token, and not that GitHub enforces the rule the check reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initBase } from '../oats-package/capabilities/oats-okf/lib/migration.mjs';
import { loadBindings } from '../oats-package/capabilities/oats-okf/lib/config.mjs';
import { setupCheck, renderSetupCheck, probes, hostRoutes, AMBIENT_MEANING } from '../oats-package/capabilities/oats-okf/lib/setup-check.mjs';

const CLI = join(fileURLToPath(new URL('../', import.meta.url)), 'oats-package/capabilities/oats-okf/bin/oats-okf.mjs');
const json = (file, value) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
function fixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'okf62-setup-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const seed = join(dir, 'seed'), origin = join(dir, 'origin.git'), soul = join(dir, 'soul'), stateDir = join(dir, 'state'), bindingsFile = join(dir, 'okf-bindings.json');
  json(join(dir, 'nodes.json'), { expert: { path: 'expert', owner: 'source' } });
  json(join(dir, 'seed-bindings.json'), { version: 1, stateDir: join(dir, 'seed-state'), bases: { kb: { id: 'kb-1', kind: 'directory', path: seed } } });
  initBase(loadBindings(join(dir, 'seed-bindings.json')), 'kb', join(dir, 'nodes.json'), undefined, { confirm: true });
  const env = { HOME: dir, PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], { cwd, env, encoding: 'utf8' });
  git(seed, 'init', '-q', '-b', 'main'); git(seed, 'add', '-A'); git(seed, 'commit', '-qm', 'accepted'); git(dir, 'clone', '-q', '--bare', seed, origin);
  json(bindingsFile, { version: 1, stateDir, bases: { kb: { id: 'kb-1', kind: 'git', repository: origin, root: '.', acceptedBranch: 'main', pr: { repository: 'acme/kb' } } } });
  fs.mkdirSync(stateDir); json(join(soul, 'okf.json'), { version: 1, owner: 'source', owns: ['kb/expert'], reads: [] });
  return { dir, soul, stateDir, bindingsFile, settings: { 'bindings-file': bindingsFile, 'state-dir': stateDir } };
}
/** Run setupCheck in process with this fixture's settings and replaced probes. */
function check(t, f, { settings = f.settings, origins, gh, protection = 'enforced', has = () => true, publish = () => {}, hostRoutes: routes = () => ({ routes: [], unread: [] }) } = {}) {
  const saved = { env: { ...process.env }, probes: { ...probes } };
  t.after(() => { for (const k of Object.keys(process.env)) delete process.env[k]; Object.assign(process.env, saved.env); Object.assign(probes, saved.probes); });
  Object.assign(process.env, { OATS_SETTINGS: JSON.stringify(settings), OATS_SOUL: f.soul, HOME: f.dir, GIT_CONFIG_NOSYSTEM: '1' });
  if (origins) process.env.OATS_SETTINGS_ORIGINS = JSON.stringify(origins); else delete process.env.OATS_SETTINGS_ORIGINS;
  for (const k of ['OATS_INSTANCE_HOME', 'OATS_HOME', 'OATS_BINDING_FILE']) delete process.env[k];
  Object.assign(probes, { has, publish, hostRoutes: routes, protection: () => protection, gh: gh ?? (args => args[0] === 'api' ? JSON.stringify(ROLE.write) : JSON.stringify([{ name: 'okf-proposal' }])) });
  return setupCheck({ soul: f.soul, home: f.dir });
}
const by = (r, id) => r.checks.find(c => c.id === id);
const gh = (permissions, labels = [{ name: 'okf-proposal' }]) => args => args[0] === 'api' ? JSON.stringify(permissions) : JSON.stringify(labels);
const ROLE = { write: { admin: false, maintain: false, push: true }, admin: { admin: true, maintain: true, push: true }, maintain: { admin: false, maintain: true, push: true }, read: { admin: false, maintain: false, push: false } };

test('ambient mode: a provisioned deployment is ready, and is told what its own login means', t => {
  const r = check(t, fixture(t));
  assert.equal(r.ok, true, renderSetupCheck(r)); assert.equal(r.mode, 'ambient');
  for (const id of ['settings', 'bindings', 'state', 'git', 'gh', 'base:kb', 'declaration', 'credential:kb', 'protection:kb', 'label:kb']) assert.equal(by(r, id)?.status, 'ok', `${id}: ${by(r, id)?.detail}`);
  assert.deepEqual(by(r, 'credential-mode'), { id: 'credential-mode', status: 'warning', detail: AMBIENT_MEANING, fix: by(r, 'credential-mode').fix });
  assert.match(renderSetupCheck(r), /^ready: nothing is missing \(read the warnings\)$/m);
});

test('ambient mode tells and does not break: an admin login, no branch rule and a missing label are warnings with their fix', t => {
  for (const [permissions, protection] of [[ROLE.admin, 'none'], [ROLE.maintain, 'unknown']]) {
    const r = check(t, fixture(t), { gh: gh(permissions, []), protection });
    assert.equal(r.ok, true, renderSetupCheck(r));
    assert.equal(by(r, 'credential:kb').status, 'warning'); assert.match(by(r, 'credential:kb').fix, /write role only on acme\/kb \(no maintain, no admin\)/);
    assert.equal(by(r, 'protection:kb').status, 'warning'); assert.match(by(r, 'protection:kb').fix, /an administrator, from outside the agents' trust group, adds the branch ruleset/);
    assert.equal(by(r, 'label:kb').status, 'warning'); assert.match(by(r, 'label:kb').fix, /gh label create okf-proposal --repo acme\/kb/);
  }
});

test('in either mode a credential that cannot write, an unreadable repository, a missing gh and an unusable state directory are problems', t => {
  // The write test is the one publish predicate: its refusal is the problem, its fix line the fix.
  const asked = [], refuse = reason => (alias, base) => { asked.push([alias, base.pr.repository]); throw Object.assign(new Error(`base kb (acme/kb): the predicate's own fix for ${reason}`), { code: 'E_GH_UNAVAILABLE', fix: `the predicate's own fix for ${reason}`, result: { reason } }); };
  for (const reason of ['no-write-permission', 'gh-failed', 'installation-cannot-push', 'installation-check-failed']) {
    const r = check(t, fixture(t), { publish: refuse(reason), gh: () => assert.fail('the role is not read for a credential that cannot publish') });
    assert.equal(r.ok, false);
    assert.deepEqual(by(r, 'credential:kb'), { id: 'credential:kb', status: 'problem', detail: `the credential (ambient) cannot publish to acme/kb (${reason}): proposals cannot push a branch or open a pull request`, fix: `the predicate's own fix for ${reason}` });
    assert.equal(by(r, 'protection:kb'), undefined);
  }
  assert.deepEqual(asked[0], ['kb', 'acme/kb']);
  // The predicate refused on the host: said once, pointing at host-git, and nothing else is read for that base.
  const routed = check(t, fixture(t), { publish: () => { throw Object.assign(new Error('Git on this host may not use the token in github-token-file: x: remove it'), { code: 'E_HOST_CREDENTIAL', fix: 'remove it' }); }, gh: () => assert.fail('nothing is read') });
  assert.deepEqual(by(routed, 'credential:kb'), { id: 'credential:kb', status: 'problem', detail: "the credential (ambient) was not judged for acme/kb, nor were its role, the branch's protection and the label read: the host-git problem above stops the publish check", fix: 'fix the host-git problem, then run oats okf setup --check again' });
  const bad = check(t, fixture(t), { publish: () => { throw Object.assign(new Error('github-token-file /x does not exist: provision it; nothing was sent'), { code: 'E_CREDENTIAL', fix: 'provision it' }); } });
  assert.equal(by(bad, 'credential:kb').status, 'problem'); assert.match(by(bad, 'credential:kb').detail, /^E_CREDENTIAL: github-token-file \/x does not exist/); assert.equal(by(bad, 'credential:kb').fix, 'provision it');
  const odd = check(t, fixture(t), { publish: () => { throw Object.assign(new Error('the publication helper refused before anything was pushed (base kb)'), { code: 'E_PUBLICATION' }); } });
  assert.equal(by(odd, 'credential:kb').status, 'problem'); assert.match(by(odd, 'credential:kb').fix, /run oats okf setup --check again/);
  // A credential that can publish and whose role GitHub does not state (an App installation token; a failed read) is told, not passed as write-only.
  for (const answer of [() => { throw new Error('gh api failed: secret-looking output'); }, gh({ admin: false, maintain: false, push: false }), gh(null)]) {
    const r = check(t, fixture(t), { gh: args => args[0] === 'api' ? answer(args) : JSON.stringify([{ name: 'okf-proposal' }]) });
    assert.equal(r.ok, true, renderSetupCheck(r)); assert.equal(by(r, 'credential:kb').status, 'warning');
    assert.match(by(r, 'credential:kb').detail, /can publish to acme\/kb, but GitHub states no role for it/); assert.match(by(r, 'credential:kb').fix, /nothing that administers the repository/);
    assert.ok(!JSON.stringify(r).includes('secret-looking'), 'gh\'s own output is never forwarded');
  }
  const nogh = check(t, fixture(t), { has: bin => bin !== 'gh' });
  assert.equal(nogh.ok, false); assert.equal(by(nogh, 'gh').status, 'problem'); assert.equal(by(nogh, 'credential:kb'), undefined, 'nothing is asked of a gh that is not there');
  const f = fixture(t); fs.rmSync(f.stateDir, { recursive: true });
  const nostate = check(t, f);
  assert.equal(by(nostate, 'state').status, 'problem'); assert.match(renderSetupCheck(nostate), /^not ready: \d+ problem\(s\); each names its fix$/m);
});

test('a soul without a declaration, or one the base does not agree with, is a problem that names the fix', t => {
  const f = fixture(t); fs.rmSync(join(f.soul, 'okf.json'));
  assert.equal(by(check(t, f), 'declaration').status, 'problem');
  // Refusals that end in their own fix carry it: no soul named, and a soul in the middle of a cutover.
  const c = fixture(t); fs.writeFileSync(join(c.soul, '.okf-cutover.json'), '{}');
  assert.deepEqual(by(check(t, c), 'declaration'), { id: 'declaration', status: 'problem', detail: 'E_MIGRATION: incomplete explicit migration cutover: rerun its recorded migrate --cutover command', fix: 'rerun its recorded migrate --cutover command' });
  const n = fixture(t), saved = { ...probes }; t.after(() => Object.assign(probes, saved)); check(t, n);
  delete process.env.OATS_SOUL;
  assert.deepEqual(by(setupCheck({ soul: undefined, home: n.dir }), 'declaration'), { id: 'declaration', status: 'problem', detail: 'E_USAGE: no soul: run it as oats okf setup --check --soul <soul> from the deployment', fix: 'run it as oats okf setup --check --soul <soul> from the deployment' });
  const g = fixture(t); json(join(g.soul, 'okf.json'), { version: 1, owner: 'someone-else', owns: ['kb/expert'], reads: [] });
  const r = check(t, g);
  assert.equal(r.ok, false); assert.equal(by(r, 'declaration').status, 'problem'); assert.match(by(r, 'declaration').fix, /so they agree/);
  // A refusal that carries no fix of its own keeps the step's fix, never a fragment of its message.
  const h = fixture(t); json(join(h.soul, 'okf.json'), { version: 1, owner: 'source', owns: ['kb/missing'], reads: [] });
  const unresolved = by(check(t, h), 'declaration');
  assert.equal(unresolved.status, 'problem'); assert.match(unresolved.detail, /unresolved node: kb\/missing/); assert.match(unresolved.fix, /^correct the soul's okf\.json, or the base's okf-base\.json .* so they agree$/);
  const b = fixture(t), doc = JSON.parse(fs.readFileSync(b.bindingsFile, 'utf8')); doc.bases.kb.pr.repository = 'not a repository'; json(b.bindingsFile, doc);
  const bound = by(check(t, b), 'bindings');
  assert.equal(bound.status, 'problem'); assert.match(bound.detail, /^E_CONFIG: /); assert.match(bound.fix, /^write the bindings file and point settings\.oats\.okf\.bindings-file at it/);
});

test('file mode: the token serves https://github.com/ only, so a base bound any other way is the first problem', t => {
  const f = fixture(t), token = join(f.dir, 'token'); fs.writeFileSync(token, 'synthetic-token\n');
  const r = check(t, f, { settings: { ...f.settings, 'github-token-file': token }, origins: { '/github-token-file': { kind: 'host', at: 'oats-local.yaml' } } });
  assert.equal(r.ok, false); assert.equal(r.mode, 'file');
  assert.equal(by(r, 'bindings').status, 'problem'); assert.match(by(r, 'bindings').detail, /E_CREDENTIAL: git base "kb" is not bound by an https:\/\/github\.com\/ URL/);
  assert.match(by(r, 'bindings').fix, /^bind it by its HTTPS URL .* or remove settings\.oats\.okf\.github-token-file from oats-local\.yaml to use this user's own git and gh login$/, 'the refusal\'s own fix, not the generic one');
  // A committed value is refused before anything else is looked at.
  const committed = check(t, f, { settings: { ...f.settings, 'github-token-file': token }, origins: { '/github-token-file': { kind: 'soul', at: 'soul.yaml' } } });
  assert.equal(committed.ok, false); assert.match(by(committed, 'settings').detail, /E_CONFIG: github-token-file from soul \(soul\.yaml\) is not valid: it is host-only/);
  assert.equal(by(committed, 'settings').fix, 'set it in this deployment\'s oats-local.yaml under settings.oats.okf, and remove it there');
});

test('file mode is strict: an admin or maintain identity, a missing or unreadable branch rule are problems, never warnings; write-only behind a rule is ready', t => {
  const strict = (permissions, protection, more = {}) => {
    const f = fixture(t), token = join(f.dir, 'token'); fs.writeFileSync(token, 'synthetic-token\n');
    const doc = JSON.parse(fs.readFileSync(f.bindingsFile, 'utf8')); doc.bases.kb.repository = 'https://github.com/acme/kb.git'; json(f.bindingsFile, doc);
    const saved = { reach: probes.reach, resolve: probes.resolve };
    t.after(() => Object.assign(probes, saved));
    // The base itself is not fetched here: only the credential table is under test.
    Object.assign(probes, { reach: () => ({ stale: false, validated: { ok: true }, repository: 'https://github.com/acme/kb.git', acceptedBranch: 'main' }), resolve: () => {} });
    const r = check(t, f, { settings: { ...f.settings, 'github-token-file': token }, origins: { '/github-token-file': { kind: 'host', at: 'oats-local.yaml' } }, gh: gh(permissions), protection, ...more });
    return r;
  };
  const ready = strict(ROLE.write, 'enforced');
  assert.equal(ready.ok, true, renderSetupCheck(ready)); assert.equal(ready.mode, 'file');
  assert.equal(by(ready, 'credential-mode'), undefined, 'no ambient warning'); assert.ok(ready.checks.every(c => c.status === 'ok'), renderSetupCheck(ready));
  for (const permissions of [ROLE.admin, ROLE.maintain]) {
    const r = strict(permissions, 'enforced');
    assert.equal(r.ok, false); assert.equal(by(r, 'credential:kb').status, 'problem'); assert.match(by(r, 'credential:kb').detail, /could merge its own proposal/); assert.match(by(r, 'credential:kb').fix, /write role only/);
  }
  for (const protection of ['none', 'unknown']) {
    const r = strict(ROLE.write, protection);
    assert.equal(r.ok, false); assert.equal(by(r, 'protection:kb').status, 'problem'); assert.match(by(r, 'protection:kb').fix, /adds the branch ruleset/);
  }
  // What on the host answers GitHub before the token's helper is a problem in this mode; ambient mode does not look.
  assert.equal(by(ready, 'host-git').status, 'ok');
  const routed = strict(ROLE.write, 'enforced', { hostRoutes: () => ({ routes: ['a netrc entry that answers for github.com (.netrc in this user\'s home)', 'an authorization header (http.extraHeader) in the system Git configuration'], unread: [] }) });
  assert.equal(routed.ok, false); assert.equal(by(routed, 'host-git').status, 'problem');
  assert.match(by(routed, 'host-git').detail, /may not use the token in github-token-file: a netrc entry .*; an authorization header/); assert.match(by(routed, 'host-git').fix, /^remove each of them from the agents' container/); assert.doesNotMatch(by(routed, 'host-git').fix, /repair/);
  const blind = strict(ROLE.write, 'enforced', { hostRoutes: () => ({ routes: [], unread: ['the user Git configuration'] }) });
  assert.equal(blind.ok, false); assert.match(by(blind, 'host-git').detail, /the user Git configuration could not be read$/); assert.match(by(blind, 'host-git').fix, /^repair what could not be read, or make it readable by this user/);
  assert.equal(by(check(t, fixture(t), { hostRoutes: () => assert.fail('ambient mode does not look') }), 'host-git'), undefined);
});

test('hostRoutes reads the user\'s netrc and Git configuration with real git: kinds and scopes, never a value', t => {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'okf62-routes-'))); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = { HOME: home, PATH: process.env.PATH, GIT_CONFIG_SYSTEM: '/dev/null', XDG_CONFIG_HOME: join(home, 'none') };
  assert.deepEqual(hostRoutes(env), { routes: [], unread: [] });
  // Nothing about github.com: other hosts' entries are the host's own business.
  fs.writeFileSync(join(home, '.netrc'), 'machine example.com login a password SECRET-VALUE\n');
  fs.writeFileSync(join(home, '.gitconfig'), '[url "ssh://git@example.com/"]\n\tinsteadOf = https://example.com/\n[http "https://example.com/"]\n\textraheader = "Authorization: Basic SECRET-VALUE"\n[http]\n\textraheader = "X-Trace: SECRET-VALUE"\n');
  assert.deepEqual(hostRoutes(env).routes, []);
  fs.writeFileSync(join(home, '.netrc'), 'machine example.com login a password b\nmachine github.com login x password SECRET-VALUE\n');
  fs.writeFileSync(join(home, '.gitconfig'), '[url "https://SECRET-VALUE@mirror.example.com/"]\n\tinsteadOf = https://github.com/\n[url "ssh://git@github.com/"]\n\tpushInsteadOf = https://github.com/acme/\n[http "https://github.com/"]\n\textraheader = "AUTHORIZATION: Basic SECRET-VALUE"\n');
  const found = hostRoutes(env).routes;
  assert.deepEqual(found, ['a netrc entry that answers for github.com (.netrc in this user\'s home)', 'a rewrite of https://github.com/ URLs (url.<base>.insteadOf or pushInsteadOf) in the user Git configuration', 'an authorization header (http.extraHeader) in the user Git configuration']);
  assert.ok(!JSON.stringify(found).includes('SECRET-VALUE'));
  fs.writeFileSync(join(home, '.netrc'), 'default login x password SECRET-VALUE\n'); fs.writeFileSync(join(home, '.gitconfig'), '[http]\n\textraheader = "authorization: bearer SECRET-VALUE"\n');
  assert.deepEqual(hostRoutes(env).routes, ['a netrc entry that answers for github.com (.netrc in this user\'s home)', 'an authorization header (http.extraHeader) in the user Git configuration']);
  // curl matches a netrc host without regard to case.
  fs.writeFileSync(join(home, '.netrc'), 'machine GitHub.COM login x password SECRET-VALUE\n'); fs.writeFileSync(join(home, '.gitconfig'), '');
  assert.deepEqual(hostRoutes(env).routes, ['a netrc entry that answers for github.com (.netrc in this user\'s home)']);
  // An included file is Git's configuration too; a conditional include cannot be evaluated here and is said so.
  fs.rmSync(join(home, '.netrc'));
  fs.writeFileSync(join(home, 'gh.inc'), '[http "https://github.com/"]\n\textraheader = "Authorization: Basic SECRET-VALUE"\n[url "https://mirror.example.com/"]\n\tinsteadOf = https://github.com/\n');
  fs.writeFileSync(join(home, '.gitconfig'), '[include]\n\tpath = gh.inc\n');
  assert.deepEqual(hostRoutes(env).routes, ['an authorization header (http.extraHeader) in the user Git configuration', 'a rewrite of https://github.com/ URLs (url.<base>.insteadOf or pushInsteadOf) in the user Git configuration']);
  fs.writeFileSync(join(home, '.gitconfig'), '[includeIf "hasconfig:remote.*.url:https://github.com/**"]\n\tpath = gh.inc\n');
  // A conditional include: its condition is taken as true, and what the file holds decides.
  assert.deepEqual(hostRoutes(env), { routes: ['an authorization header (http.extraHeader) in the user Git configuration', 'a rewrite of https://github.com/ URLs (url.<base>.insteadOf or pushInsteadOf) in the user Git configuration'], unread: [] });
  fs.writeFileSync(join(home, 'work.inc'), '[user]\n\temail = someone@example.invalid\n');
  fs.writeFileSync(join(home, '.gitconfig'), '[includeIf "gitdir:~/work/"]\n\tpath = ~/work.inc\n[includeIf "gitdir:~/gone/"]\n\tpath = absent.inc\n');
  assert.deepEqual(hostRoutes(env), { routes: [], unread: [] }, 'an include that sets nothing about github.com is the host\'s own business');
  fs.writeFileSync(join(home, 'work.inc'), '[includeIf "gitdir:~/deeper/"]\n\tpath = gh.inc\n');
  assert.equal(hostRoutes(env).routes.length, 2, 'a nested conditional include is read too');
  fs.writeFileSync(join(home, 'work.inc'), '[broken\n');
  assert.deepEqual(hostRoutes(env), { routes: [], unread: ['a file the user Git configuration conditionally includes'] });
  // Git lets * stand for a host label; curl accepts a quoted netrc host.
  fs.writeFileSync(join(home, '.gitconfig'), '[http "https://*.com/"]\n\textraheader = "Authorization: Basic SECRET-VALUE"\n'); fs.writeFileSync(join(home, '.netrc'), 'machine "github.com" login x password SECRET-VALUE\n');
  assert.deepEqual(hostRoutes(env).routes, ['a netrc entry that answers for github.com (.netrc in this user\'s home)', 'an authorization header (http.extraHeader) in the user Git configuration']);
  // A netrc this user cannot read is no route: Git's curl cannot read it either.
  if (process.getuid?.() !== 0) { fs.chmodSync(join(home, '.netrc'), 0o000); fs.writeFileSync(join(home, '.gitconfig'), ''); assert.deepEqual(hostRoutes(env), { routes: [], unread: [] }); fs.chmodSync(join(home, '.netrc'), 0o600); }
  fs.writeFileSync(join(home, '.gitconfig'), '[broken\n'); fs.rmSync(join(home, '.netrc'));
  assert.deepEqual(hostRoutes(env), { routes: [], unread: ['the system Git configuration', 'the user Git configuration'] }, 'git reads no scope while one is broken');
});

test('setup --check reads the preflight answer with its canonical repository (#123): a moved repository that reads back is publishable', t => {
  const f = fixture(t), ghbin = join(f.dir, 'ghbin'); fs.mkdirSync(ghbin);
  fs.writeFileSync(join(ghbin, 'gh'), `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === '--version') process.exit(0);\nif (a.join(' ') === 'api --hostname github.com repos/acme/kb --jq .permissions.push, .full_name, .node_id') { console.log('true\\nnew-org/kb\\nR_kb'); process.exit(0); }\nif (a.join(' ') === 'api --hostname github.com repos/new-org/kb --jq .full_name, .node_id') { console.log('new-org/kb\\nR_kb'); process.exit(0); }\nif (a[0] === 'label') { console.log('[]'); process.exit(0); }\nprocess.exit(1);\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [CLI, 'setup', '--check'], { cwd: f.dir, encoding: 'utf8', timeout: 120000,
    env: { HOME: f.dir, PATH: `${ghbin}:${process.env.PATH}`, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', OATS_SOUL: f.soul, OATS_SETTINGS: JSON.stringify(f.settings) } });
  assert.doesNotMatch(r.stdout, /PROBLEM credential:kb/, r.stdout + r.stderr);
  assert.match(r.stdout, /credential:kb: the credential \(ambient\) can publish to acme\/kb/, 'the publish check passed and setup --check went on to the role');
});

test('the command: text by default, one JSON document with --json, exit 1 when not ready', t => {
  const f = fixture(t), ghbin = join(f.dir, 'ghbin'); fs.mkdirSync(ghbin);
  fs.writeFileSync(join(ghbin, 'gh'), `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === '--version') process.exit(0);\nif (a.join(' ') === 'api --hostname github.com repos/acme/kb --jq .permissions.push, .full_name, .node_id') { console.log('false\\nacme/kb\\nR_kb'); process.exit(0); }\nif (a[0] === 'label') { console.log('[]'); process.exit(0); }\nprocess.exit(1);\n`, { mode: 0o755 });
  const run = (...args) => spawnSync(process.execPath, [CLI, 'setup', '--check', ...args], { cwd: f.dir, encoding: 'utf8', timeout: 120000,
    env: { HOME: f.dir, PATH: `${ghbin}:${process.env.PATH}`, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', OATS_SOUL: f.soul, OATS_SETTINGS: JSON.stringify(f.settings) } });
  const text = run();
  assert.equal(text.status, 1, text.stdout + text.stderr);
  assert.match(text.stdout, /^PROBLEM credential:kb: the credential \(ambient\) cannot publish to acme\/kb \(no-write-permission\)/m); assert.match(text.stdout, /^        fix: gh's account has less than write permission on the repository .*: use an account with write$/m);
  assert.match(text.stdout, /^not ready: 1 problem\(s\); each names its fix$/m);
  const j = run('--json'), doc = JSON.parse(j.stdout);
  assert.equal(j.status, 1); assert.equal(doc.ok, true); assert.equal(doc.result.ok, false); assert.equal(doc.result.mode, 'ambient');
  assert.equal(spawnSync(process.execPath, [CLI, 'setup', '--json'], { cwd: f.dir, encoding: 'utf8', env: { PATH: process.env.PATH, OATS_SETTINGS: '{}' } }).status, 1);
});
