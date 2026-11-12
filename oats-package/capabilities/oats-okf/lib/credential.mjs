// oats.okf 6.1: the one place the library decides which credential a child
// process gets. With settings.oats.okf.github-token-file (host-only), every
// remote git call and every gh call uses the token in that file and nothing
// ambient; without it, the user's own git and gh login, as before 6.1. The
// mechanism is the publication helper's (`tokenEnv`), shared with the
// maintainer's `--token-file`, so proposer and maintainer cannot drift.
//
// A credential SOURCE is what this module hides: today a file; a brokered
// source arrives as its own setting, exclusive with this one, and changes
// only this module.
import { tokenEnv, readToken } from '../skills/okf-authoring/scripts/okf-publication.mjs';
import { tokenFile, credentialRefusal } from './config.mjs';

/** `file` | `ambient`: which credential this deployment's knowledge calls use. */
export const credentialMode = (env = process.env) => tokenFile(env) === undefined ? 'ambient' : 'file';
/** A git child's environment. Reads no token: git asks the helper when a
 *  remote wants one, so local Git work never depends on the file. */
export function gitCredentialEnv(base, env = process.env) {
  const file = tokenFile(env);
  return file === undefined ? base : tokenEnv(base, file);
}
/** A gh child's environment. A bad token file refuses here (E_CREDENTIAL,
 *  naming the fix) before gh starts. */
export function ghEnv(base, env = process.env) {
  const file = tokenFile(env);
  if (file === undefined) return base;
  try { return tokenEnv(base, file, { gh: true }); }
  catch (e) { if (e?.code === 'E_CREDENTIAL') credentialRefusal(file, e.diagnostic?.reason); throw e; }
}
/** After a remote Git failure: when the token file itself is the cause, say
 *  so with its fix instead of a bare authentication failure. */
export function refuseBadTokenFile(env = process.env) {
  const file = tokenFile(env);
  if (file === undefined) return;
  try { readToken(file); } catch (e) { if (e?.code === 'E_CREDENTIAL') credentialRefusal(file, e.diagnostic?.reason); throw e; }
}
