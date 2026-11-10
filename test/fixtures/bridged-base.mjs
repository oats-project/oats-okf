// okf 6.0 test fixture: a small version-1 base (nodes expert and peer), and the
// same base bridged to the subject layout: the reserved nodes claims, subjects
// and verdicts (owner the sentinel), two subjects, three claims with `about`,
// one verdict, and the generated indexes written by the shipped regenerator.
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { titleHash, SENTINEL } from '../../oats-package/capabilities/oats-okf/lib/okf-reindex.mjs';

export const REINDEX = fileURLToPath(new URL('../../oats-package/capabilities/oats-okf/lib/okf-reindex.mjs', import.meta.url));
export const VALIDATE = fileURLToPath(new URL('../../oats-package/capabilities/oats-okf/lib/okf-validate.mjs', import.meta.url));
const write = (file, text) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const fm = (fields, body) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`).join('\n')}\n---\n\n${body}\n`;

/** A plain version-1 base at dir (id base-1). */
export function writePlainBase(dir, { id = 'base-1', owners = { expert: 'owner-1', peer: 'owner-2' } } = {}) {
  write(join(dir, 'okf-base.json'), JSON.stringify({ version: 1, id, nodes: { expert: { path: 'expert', owner: owners.expert }, peer: { path: 'peer', owner: owners.peer } } }, null, 2) + '\n');
  write(join(dir, 'index.md'), '# Project knowledge\n\n* [expert](expert/index.md) - The expert node.\n* [peer](peer/index.md) - The peer node.\n');
  write(join(dir, 'log.md'), '# Log\n');
  write(join(dir, 'expert', 'index.md'), '# expert\n\n* [Pin the owner at spawn](decision.md) - The owner is pinned when the instance spawns.\n');
  write(join(dir, 'expert', 'log.md'), '# expert log\n');
  write(join(dir, 'peer', 'index.md'), '# peer\n\n* [Fakes hide refusals](lesson.md) - A fake that accepts what the real tool refuses hides a broken hook.\n');
  write(join(dir, 'peer', 'log.md'), '# peer log\n');
  write(join(dir, 'expert', 'decision.md'), fm({ type: 'Decision', title: 'Pin the owner at spawn', description: 'The owner is pinned when the instance spawns.', tags: '[okf]' }, '# Pin the owner at spawn\n\nWe pin the owner at spawn.'));
  write(join(dir, 'peer', 'lesson.md'), fm({ type: 'Lesson', title: 'Fakes hide refusals', description: 'A fake that accepts what the real tool refuses hides a broken hook.' }, '# Fakes hide refusals\n\nModel the refusals.'));
  return dir;
}

export const REJECTED = { id: 'dec-0000000000aa', type: 'Decision', title: 'Keep a harvester per proposal', description: 'A harvester judges every proposal.', reason: 'No harvester runs on any base; the proposer publishes and the maintainer gates.' };
export const SUBJECT_COUNTS = { 'system/okf': { Decision: 1, Insight: 1 }, 'workstream/knowledge': { Decision: 1, Lesson: 1 } };

/** The bridged layout added to a plain base at dir, then regenerated. */
export function bridge(dir) {
  const meta = JSON.parse(fs.readFileSync(join(dir, 'okf-base.json'), 'utf8'));
  for (const n of ['claims', 'subjects', 'verdicts']) meta.nodes[n] = { path: n, owner: SENTINEL };
  write(join(dir, 'okf-base.json'), JSON.stringify(meta, null, 2) + '\n');
  write(join(dir, 'index.md'), fs.readFileSync(join(dir, 'index.md'), 'utf8') + '* [claims](claims/index.md) - Claims proposed under the subject layout.\n* [verdicts](verdicts/index.md) - The maintainer\'s verdicts.\n');
  write(join(dir, 'claims', 'index.md'), '# claims\n\nClaims proposed under the subject layout live here; each subject\'s generated index lists them.\n');
  for (const n of ['claims', 'subjects', 'verdicts']) write(join(dir, n, 'log.md'), `# ${n} log\n`);
  write(join(dir, 'subjects', 'system', 'okf.md'), fm({ type: 'System', title: 'oats-okf', description: 'The knowledge provider package.', repo: 'github.com/awebai/oats-okf', 'in-workstreams': ['workstream/knowledge'], status: 'active', 'legacy-nodes': ['expert'] }, '# oats-okf\n\nThe package.'));
  write(join(dir, 'subjects', 'workstream', 'knowledge.md'), fm({ type: 'Workstream', title: 'Knowledge', description: 'How OATS keeps and proposes knowledge.', status: 'active', 'legacy-nodes': ['peer'] }, '# Knowledge\n\nThe workstream.'));
  // about, kind and id inserted after description, nothing else touched.
  const stamp = (file, extra) => {
    const text = fs.readFileSync(join(dir, file), 'utf8');
    write(join(dir, file), text.replace(/^(description: .*)$/m, `$1\n${extra}`));
  };
  stamp('expert/decision.md', 'about: [system/okf, workstream/knowledge]\nid: dec-000000000001');
  stamp('peer/lesson.md', 'about: ["workstream/knowledge"]\nkind: lesson\nid: ins-000000000002');
  write(join(dir, 'claims', 'insights', 'consult-reads-one-blob.md'), fm({ type: 'Insight', title: 'Consult reads one committed index', description: 'A subject verb reads one generated index blob.', about: ['system/okf'], kind: 'finding', id: 'ins-000000000003' }, '# Consult reads one committed index\n\nOne blob per subject.'));
  write(join(dir, 'verdicts', `${REJECTED.id}.md`), fm({ type: 'Verdict', title: `Verdict: ${REJECTED.title}`, description: 'Rejected.', 'claim-type': REJECTED.type, verdict: 'rejected', 'claim-title': REJECTED.title, 'claim-description': REJECTED.description, 'title-hash': titleHash(REJECTED.type, REJECTED.title), reason: REJECTED.reason, pr: 'https://github.com/fixture/knowledge/pull/7', 'decided-by': 'maintainer', 'decided-on': '2026-11-10' }, '# Verdict\n\nRejected.'));
  reindex(dir);
  return dir;
}
export function reindex(dir, ...args) {
  const r = spawnSync(process.execPath, [REINDEX, dir, ...args], { encoding: 'utf8' });
  if (!args.includes('--check') && r.status !== 0) throw new Error(`okf-reindex failed: ${r.stdout}${r.stderr}`);
  return r;
}
export function validate(dir, { strict = true, env = {}, validator = VALIDATE } = {}) {
  const r = spawnSync(process.execPath, [validator, dir, ...(strict ? ['--strict'] : []), '--json'], { encoding: 'utf8', env: { ...process.env, ...env } });
  let out = null; try { out = JSON.parse(r.stdout); } catch { /* asserted by the caller */ }
  return { status: r.status, out, text: r.stdout + r.stderr };
}
