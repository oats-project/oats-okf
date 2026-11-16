// oats.okf 6.2 (#149): the proposer credential file. The token mechanism is
// exercised with the real git binary (`git credential fill`), never a fake:
// what must hold is what git itself asks and accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { tokenEnv, readToken } from '../oats-package/capabilities/oats-okf/skills/okf-authoring/scripts/okf-publication.mjs';
import { tokenFile, requireTokenBases } from '../oats-package/capabilities/oats-okf/lib/config.mjs';
import { credentialMode, gitCredentialEnv, ghEnv, refuseBadTokenFile, hostProbe } from '../oats-package/capabilities/oats-okf/lib/credential.mjs';
import { deliverMigration } from '../oats-package/capabilities/oats-okf/lib/migration.mjs';
import { hash } from '../oats-package/capabilities/oats-okf/lib/io.mjs';
import { staleReason } from '../oats-package/capabilities/oats-okf/lib/consult.mjs';
import { unavailable } from '../oats-package/capabilities/oats-okf/lib/stores.mjs';

const TOKEN = 'synthetic-token-0123456789';
function scratch(t) { const d = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'okf61-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }
const tokenAt = (d, text = `${TOKEN}\n`) => { const f = join(d, 'token'); fs.writeFileSync(f, text, { mode: 0o600 }); return f; };
const settingsEnv = (file, kind = 'host') => ({ OATS_SETTINGS: JSON.stringify({ 'github-token-file': file }), OATS_SETTINGS_ORIGINS: JSON.stringify(kind ? { '/github-token-file': { kind, at: 'somewhere' } } : {}) });
const code = fn => { try { fn(); } catch (e) { return e; } assert.fail('expected a refusal'); };
const fill = (host, env) => spawnSync('git', ['credential', 'fill'], { env, input: `protocol=https\nhost=${host}\n\n`, encoding: 'utf8', timeout: 20000 });

test('readToken reads one printable token, following a link as a mounted secret is one, and names only a reason', t => {
  const d = scratch(t), f = tokenAt(d);
  assert.equal(readToken(f), TOKEN);
  fs.symlinkSync(f, join(d, 'link')); assert.equal(readToken(join(d, 'link')), TOKEN);
  for (const [text, reason] of [['', 'empty'], ['\n', 'empty'], ['two words\n', 'malformed'], ['a\nb\n', 'malformed'], ['x'.repeat(5000), 'malformed'], ['café\n', 'malformed']]) {
    const e = code(() => readToken(tokenAt(d, text)));
    assert.equal(e.code, 'E_CREDENTIAL'); assert.equal(e.diagnostic.reason, reason); assert.equal(e.message, 'E_CREDENTIAL');
  }
  assert.equal(code(() => readToken(join(d, 'absent'))).diagnostic.reason, 'missing');
  assert.equal(code(() => readToken(d)).diagnostic.reason, 'not-a-file');
  assert.equal(code(() => readToken('relative')).diagnostic.reason, 'path');
});

test('tokenEnv makes the file the only credential helper (a host netrc or Git configuration is not isolated, and not tested): git gets it through the helper for github.com alone, gh in its own environment', t => {
  const d = scratch(t), f = tokenAt(d), base = { PATH: process.env.PATH, HOME: d, GIT_TERMINAL_PROMPT: '0', GH_TOKEN: 'inherited', GITHUB_TOKEN: 'inherited', GH_HOST: 'elsewhere', GIT_ASKPASS: '/bin/true', GIT_SSH_COMMAND: 'ssh -i key' };
  assert.equal(tokenEnv(base, undefined), base, 'no file: the environment is untouched');
  // An ambient helper that would answer for any host: cleared.
  fs.writeFileSync(join(d, '.gitconfig'), '[credential]\n\thelper = "!f() { echo username=ambient; echo password=ambient; }; f"\n');
  const env = tokenEnv(base, f);
  for (const k of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GIT_ASKPASS', 'GIT_SSH_COMMAND']) assert.equal(Object.hasOwn(env, k), false, k);
  assert.ok(!JSON.stringify(env).includes(TOKEN), 'a git child never holds the token in its environment');
  const hub = fill('github.com', env);
  assert.equal(hub.status, 0, hub.stderr); assert.match(hub.stdout, /^username=x-access-token$/m); assert.match(hub.stdout, new RegExp(`^password=${TOKEN}$`, 'm'));
  const other = fill('example.com', env);
  assert.notEqual(other.status, 0, 'no credential for another host, not even the ambient one'); assert.ok(!other.stdout.includes('ambient') && !other.stdout.includes(TOKEN));
  assert.equal(fill('example.com', { ...base }).status, 0, 'the fixture: without the token file the ambient helper answers');
  // The token is read at each use: a rotated file needs no restart.
  fs.writeFileSync(f, 'rotated-token\n'); assert.match(fill('github.com', env).stdout, /^password=rotated-token$/m);
  // A bad file is an authentication failure for git, and a refusal before gh starts.
  fs.rmSync(f); assert.notEqual(fill('github.com', env).status, 0);
  // Even where the host's Git configuration names an askpass: Git must not turn to it for another credential.
  const ask = join(d, 'askpass'); fs.writeFileSync(ask, '#!/bin/sh\necho ambient-askpass\n', { mode: 0o755 });
  fs.appendFileSync(join(d, '.gitconfig'), `[core]\n\taskPass = ${ask}\n`);
  assert.match(fill('github.com', { ...base, GIT_ASKPASS: undefined, GH_TOKEN: undefined }).stdout, /ambient/, 'the fixture: without the token file an ambient source answers');
  for (const text of [null, '', 'two words\n']) {
    if (text === null) fs.rmSync(f, { force: true }); else fs.writeFileSync(f, text);
    const r = fill('github.com', env);
    assert.notEqual(r.status, 0, JSON.stringify(text)); assert.ok(!r.stdout.includes('ambient'), 'no ambient credential stands in for an unusable file');
  }
  fs.rmSync(f, { force: true });
  assert.equal(code(() => tokenEnv(base, f, { gh: true })).diagnostic.reason, 'missing');
  const g = tokenEnv(base, tokenAt(d), { gh: true });
  assert.equal(g.GH_TOKEN, TOKEN); assert.equal(Object.hasOwn(g, 'GITHUB_TOKEN'), false);
  // Only HTTPS: an SSH key cannot stand in.
  const ssh = spawnSync('git', ['ls-remote', 'git@github.invalid:o/r.git'], { env, encoding: 'utf8', timeout: 20000 });
  assert.notEqual(ssh.status, 0); assert.match(ssh.stderr, /transport 'ssh' not allowed/);
});

test('github-token-file is host-only: a committed or spawn value refuses with the move, and an unknown origin too', () => {
  assert.equal(tokenFile({}), undefined);
  assert.equal(tokenFile(settingsEnv('/etc/okf/token')), '/etc/okf/token');
  assert.equal(tokenFile({ OATS_SETTINGS: JSON.stringify({ 'github-token-file': '/etc/okf/token' }) }), '/etc/okf/token', 'a kernel that reports no origins at all: the manifest hostOnly rule is the kernel\'s');
  for (const kind of ['soul', 'workspace', 'spawn']) {
    const e = code(() => tokenFile(settingsEnv('/etc/okf/token', kind)));
    assert.equal(e.code, 'E_CONFIG'); assert.match(e.message, new RegExp(`github-token-file from ${kind} \\(somewhere\\) is not valid: it is host-only`)); assert.match(e.message, /oats-local\.yaml under settings\.oats\.okf, and remove it there/);
  }
  assert.match(code(() => tokenFile(settingsEnv('/etc/okf/token', null))).message, /from an unknown origin/);
  for (const bad of ['relative', '/a/../b', 7, "/a/it's"]) assert.equal(code(() => tokenFile(settingsEnv(bad))).code, 'E_CONFIG', String(bad));
});

test('with the token file every Git base is bound by its https://github.com/ URL; without it nothing is asked', () => {
  const bases = repository => ({ bases: { kb: { kind: 'git', repository }, notes: { kind: 'directory', path: '/x' } } });
  for (const r of ['git@github.com:o/r.git', 'ssh://git@github.com/o/r.git', 'https://example.com/o/r.git', '/local/repo']) {
    requireTokenBases(bases(r), {});
    const e = code(() => requireTokenBases(bases(r), settingsEnv('/etc/okf/token')));
    assert.equal(e.code, 'E_CREDENTIAL'); assert.match(e.message, /git base "kb" is not bound by an https:\/\/github\.com\/ URL/); assert.match(e.message, /bind it by its HTTPS URL .* or remove settings\.oats\.okf\.github-token-file/);
  }
  requireTokenBases(bases('https://github.com/o/r.git'), settingsEnv('/etc/okf/token'));
});

test('the library\'s one seam: mode, a git environment that reads no token, a gh refusal that names the whole fix', t => {
  const d = scratch(t), f = tokenAt(d), on = settingsEnv(f), base = { PATH: process.env.PATH };
  assert.equal(credentialMode({}), 'ambient'); assert.equal(credentialMode(on), 'file');
  assert.equal(gitCredentialEnv(base, {}), base); assert.equal(ghEnv(base, {}), base);
  assert.equal(ghEnv(base, on).GH_TOKEN, TOKEN);
  fs.rmSync(f);
  assert.equal(gitCredentialEnv(base, on).OKF_GITHUB_TOKEN_FILE, f, 'local Git work never depends on the file');
  for (const fn of [() => ghEnv(base, on), () => refuseBadTokenFile(on)]) {
    const e = code(fn);
    assert.equal(e.code, 'E_CREDENTIAL');
    assert.equal(e.message, `github-token-file ${f} does not exist: provision the deployment's proposer credential there (README: "The proposer credential"), or remove settings.oats.okf.github-token-file from oats-local.yaml to use this user's own git and gh login`, 'never "nothing was sent": a gh call can follow a push');
  }
  refuseBadTokenFile({});
});

test('after a fetch that failed on authentication, an unusable token file refuses E_CREDENTIAL and staleReason accepts it as a failed fetch (the read itself: okf5-consult)', t => {
  const d = scratch(t), f = join(d, 'absent'), saved = { ...process.env }, base = { repository: 'https://github.com/o/r.git' };
  t.after(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); });
  const failed = () => code(() => unavailable(base, 'kb', 'fetch', new Error("fatal: could not read Username for 'https://github.com': terminal prompts disabled")));
  delete process.env.OATS_SETTINGS; delete process.env.OATS_SETTINGS_ORIGINS;
  const ambient = failed();
  assert.equal(ambient.code, 'E_BASE_UNAVAILABLE'); assert.match(staleReason(ambient, 'T'), /^fetch of the accepted branch failed at T \(reason: auth\); serving the last fetched accepted commit$/);
  Object.assign(process.env, settingsEnv(f));
  const file = failed();
  assert.equal(file.code, 'E_CREDENTIAL');
  assert.match(staleReason(file, 'T'), new RegExp(`^fetch of the accepted branch failed at T \\(reason: credential; github-token-file ${f} does not exist: provision .*\\); serving the last fetched accepted commit$`));
  // Anything else is not a failed fetch and is not served over.
  assert.equal(staleReason(Object.assign(new Error('x'), { code: 'E_CONFIG' }), 'T'), null); assert.equal(staleReason(new Error('x'), 'T'), null);
});

// What Git sends, seen by a local server. tokenEnv refuses plain HTTP, so the
// test alone re-allows it for 127.0.0.1; everything else is tokenEnv's.
test('tokenEnv resets http.extraHeader: an unscoped header in the host configuration is not sent; the same reset is set for the https://github.com/ scope, which is not asked here (a more specific scope is not reset: the gate refuses on it)', async t => {
  const d = scratch(t), f = tokenAt(d), seen = join(d, 'seen.jsonl');
  const server = spawn(process.execPath, ['-e', `
const http = require('node:http'), fs = require('node:fs');
const s = http.createServer((q, r) => { fs.appendFileSync(${JSON.stringify(seen)}, JSON.stringify(q.headers) + '\\n'); r.writeHead(404); r.end(); });
s.listen(0, '127.0.0.1', () => console.log(s.address().port));`], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => server.kill());
  const port = await new Promise(done => server.stdout.once('data', x => done(String(x).trim())));
  fs.writeFileSync(join(d, '.gitconfig'), '[http]\n\textraHeader = "X-Ambient: unscoped"\n');
  const base = { PATH: process.env.PATH, HOME: d, GIT_CONFIG_NOSYSTEM: '1' };
  const allowHttp = env => { const n = Number(env.GIT_CONFIG_COUNT ?? 0); return { ...env, GIT_CONFIG_COUNT: String(n + 1), [`GIT_CONFIG_KEY_${n}`]: 'protocol.http.allow', [`GIT_CONFIG_VALUE_${n}`]: 'always' }; };
  const ask = env => { fs.rmSync(seen, { force: true }); spawnSync('git', ['ls-remote', `http://127.0.0.1:${port}/x.git`], { env: allowHttp(env), encoding: 'utf8', timeout: 20000 }); return fs.readFileSync(seen, 'utf8').trim().split('\n').map(row => JSON.parse(row)); };
  assert.ok(ask(base).every(h => h['x-ambient'] === 'unscoped'), 'the fixture: without the token file the host header is sent');
  const file = ask(tokenEnv(base, f));
  assert.ok(file.length > 0); assert.ok(file.every(h => !('x-ambient' in h)), 'reset at command scope');
  // The reset tokenEnv sets for https://github.com/ is of the same kind; that scope cannot be asked without the network.
  const env = tokenEnv(base, f), keys = Array.from({ length: Number(env.GIT_CONFIG_COUNT) }, (_, i) => [env[`GIT_CONFIG_KEY_${i}`], env[`GIT_CONFIG_VALUE_${i}`]]);
  assert.ok(keys.some(([k, v]) => k === 'http.extraHeader' && v === '')); assert.ok(keys.some(([k, v]) => k === 'http.https://github.com/.extraHeader' && v === ''));
});

test('with github-token-file, migrate --deliver to a Git base refuses E_HOST_CREDENTIAL before anything of the delivery starts: no git, no gh, the record untouched; without the setting the host is not looked at', t => {
  const d = scratch(t), f = tokenAt(d), bin = join(d, 'bin'), calls = join(d, 'calls.log'), saved = { env: { ...process.env }, scan: hostProbe.scan };
  t.after(() => { hostProbe.scan = saved.scan; for (const k of Object.keys(process.env)) if (!(k in saved.env)) delete process.env[k]; Object.assign(process.env, saved.env); });
  fs.mkdirSync(bin);
  for (const tool of ['git', 'gh']) fs.writeFileSync(join(bin, tool), `#!/bin/sh\necho ${tool} "$@" >> '${calls}'\nexit 1\n`, { mode: 0o755 });
  const proposal = { run: 'r1', before: {}, after: {} }, proposalFile = join(d, 'proposal.json'), record = join(d, 'migration.json');
  fs.writeFileSync(proposalFile, JSON.stringify(proposal));
  const migration = { proposal: proposalFile, proposalHash: hash(proposal), base: { id: 'kb-1', kind: 'git', repository: 'https://github.com/o/r.git', root: '.', acceptedBranch: 'main', pr: { repository: 'o/r' } }, stage: { checkout: join(d, 'stage'), head: 'a'.repeat(40) }, receipt: { status: 'staged' } };
  fs.writeFileSync(record, JSON.stringify(migration));
  const before = fs.readFileSync(record, 'utf8');
  Object.assign(process.env, settingsEnv(f), { PATH: bin, HOME: d });
  let scans = 0; hostProbe.scan = () => { scans += 1; return { routes: ['a rewrite of https://github.com/ URLs (url.<base>.insteadOf or pushInsteadOf) in the user Git configuration'], unread: [] }; };
  const e = code(() => deliverMigration(record));
  assert.equal(e.code, 'E_HOST_CREDENTIAL'); assert.match(e.message, /^Git on this host may not use the token in github-token-file: a rewrite of https:\/\/github\.com\/ URLs .*: remove each of them /); assert.equal(typeof e.fix, 'string');
  assert.equal(scans, 1); assert.equal(fs.existsSync(calls), false, 'neither git nor gh was started: nothing was fetched, pushed or opened'); assert.equal(fs.readFileSync(record, 'utf8'), before, 'no push intent was recorded');
  // The real scan, on a home with a netrc entry for github.com (git itself is not needed to find it).
  hostProbe.scan = saved.scan; fs.writeFileSync(join(d, '.netrc'), 'machine github.com login x password SECRET-VALUE\n');
  const real = code(() => deliverMigration(record));
  assert.equal(real.code, 'E_HOST_CREDENTIAL'); assert.match(real.message, /a netrc entry that answers for github\.com/); assert.ok(!real.message.includes('SECRET-VALUE')); assert.equal(fs.readFileSync(record, 'utf8'), before);
  fs.rmSync(calls, { force: true });   // the scan itself asked the stand-in git for its configuration
  // Without the setting the host is not looked at: the delivery goes on to its own checks, which refuse this stand-in record for their own reasons.
  delete process.env.OATS_SETTINGS; delete process.env.OATS_SETTINGS_ORIGINS; hostProbe.scan = () => assert.fail('the host is the caller\'s own business');
  assert.notEqual(code(() => deliverMigration(record)).code, 'E_HOST_CREDENTIAL');
});
