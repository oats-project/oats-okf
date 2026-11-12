// oats.okf 6.1 (#149): the proposer credential file. The token mechanism is
// exercised with the real git binary (`git credential fill`), never a fake:
// what must hold is what git itself asks and accepts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tokenEnv, readToken } from '../oats-package/capabilities/oats-okf/skills/okf-authoring/scripts/okf-publication.mjs';
import { tokenFile, requireTokenBases } from '../oats-package/capabilities/oats-okf/lib/config.mjs';
import { credentialMode, gitCredentialEnv, ghEnv, refuseBadTokenFile } from '../oats-package/capabilities/oats-okf/lib/credential.mjs';

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

test('tokenEnv makes the file the only credential source: git gets it through the helper for github.com alone, gh in its own environment', t => {
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
    assert.equal(e.message, `github-token-file ${f} does not exist: provision the deployment's proposer credential there (README: "The proposer credential"), or remove settings.oats.okf.github-token-file from oats-local.yaml to use this user's own git and gh login; nothing was sent`);
  }
  refuseBadTokenFile({});
});
