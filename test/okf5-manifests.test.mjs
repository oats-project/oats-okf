import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// oats.okf package shape (6.0: no harvester): versions, kernel floor, the
// slot's settings and hooks, the shipped skills (shared copies identical), the
// maintainer soul and both trigger templates.
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const PKG=join(ROOT,'oats-package');
const CAPS=['oats-okf','oats-okf-maintenance'];
// oats.okf 6.0: the removed harvester's stub (until 7.0): no skills, one refusing hook.
const STUB_CAP='oats-okf-harvest',STUB_SOUL='knowledge-harvester';
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const cap=name=>readJson(join(PKG,'capabilities',name,'oats.json'));
/** relative path → bytes, for every file under dir. */
function files(dir,prefix='') {
  const out={};
  for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=join(dir,e.name),rel=prefix+e.name;
    if(e.isDirectory()) Object.assign(out,files(p,rel+'/')); else out[rel]=fs.readFileSync(p).toString('base64');
  }
  return out;
}

test('validate-manifests passes',()=>{
  const r=spawnSync(process.execPath,[join(ROOT,'scripts','validate-manifests.mjs')],{cwd:ROOT,encoding:'utf8',timeout:60000});
  assert.equal(r.status,0,r.stdout+r.stderr);
});

test('every manifest is version 5.8.0 with the >=0.69.2 kernel floor',()=>{
  assert.equal(readJson(join(ROOT,'package.json')).version,'5.8.0');
  const pkg=readJson(join(PKG,'oats-package.json'));
  assert.equal(pkg.version,'5.8.0');
  assert.deepEqual(pkg.compatibility,{oats:'>=0.69.2'});
  for(const name of CAPS) {
    assert.equal(cap(name).version,'5.8.0',name);
    assert.deepEqual(cap(name).compatibility,{oats:'>=0.69.2'},name);
  }
});

test('oats.okf declares exactly bindings-file, state-dir, git-timeout, consult-max-age and screen-terms-file',()=>{
  assert.deepEqual(Object.keys(cap('oats-okf').settings).sort(),['bindings-file','consult-max-age','git-timeout','screen-terms-file','state-dir']);
  assert.equal(cap('oats-okf').commands.propose,'bin/oats-okf.mjs propose');
});

test('the vendored manifest schema is oats v0.27.1 plus the OATS v0.68.1 upgrade hook, byte for byte',()=>{
  const sha=createHash('sha256').update(fs.readFileSync(join(ROOT,'schemas/capability-manifest.schema.json'))).digest('hex');
  assert.equal(sha,'ada5b3bbb61e6543338f278251902dfcd87fdf2931f9895c15046f7f6df636b9');
});

test('oats.okf hooks are exactly soul-scaffold, a required spawn with no inputs and a non-required upgrade',()=>{
  const hooks=cap('oats-okf').hooks;
  assert.deepEqual(Object.keys(hooks).sort(),['soul-scaffold','spawn','upgrade']);
  // okf #106: never required (a plain command).
  assert.equal(hooks.upgrade,'bin/oats-okf.mjs upgrade');
  assert.equal(hooks['soul-scaffold'],'bin/oats-okf.mjs soul-scaffold');
  assert.deepEqual(hooks.spawn,{command:'bin/oats-okf.mjs spawn',required:true});
});

test('oats.okf ships consultation, capture, compulsory proposing and theory skills plus its status command',()=>{
  assert.deepEqual(fs.readdirSync(join(PKG,'capabilities','oats-okf','skills')).sort(),['knowledge-theory','okf-authoring','okf-consultation','okf-instance-knowledge','okf-propose']);
  assert.equal(cap('oats-okf').commands.status,'bin/oats-okf.mjs status');
});

test('the package enumerates the slot, the maintainer, the harvester stub (until 7.0), two souls and both trigger templates',()=>{
  const pkg=readJson(join(PKG,'oats-package.json'));
  assert.deepEqual(pkg.capabilities,['capabilities/oats-okf','capabilities/oats-okf-harvest','capabilities/oats-okf-maintenance']);
  assert.deepEqual(pkg.souls,['souls/knowledge-harvester','souls/knowledge-maintainer']);
  assert.match(pkg.description,/until 7\.0, the removed knowledge harvester's stub soul and capability, whose spawn always refuses with E_REMOVED/);
  assert.deepEqual(pkg.triggers,[{id:'proposal-review',file:'triggers/proposal-review.json'},{id:'harvest-review',file:'triggers/harvest-review.json'}]);
  assert.deepEqual(fs.readdirSync(join(PKG,'capabilities')).sort(),[...CAPS,STUB_CAP].sort());
  assert.deepEqual(fs.readdirSync(join(PKG,'souls')).sort(),[STUB_SOUL,'knowledge-maintainer']);
});

// Spec §4 and acceptance condition 2: a bare unknown-soul error is not enough.
const REMOVED_SPAWN='E_REMOVED: oats.okf 6.0 removed the knowledge harvester. The instance proposes its knowledge itself: run `oats okf propose --plan` from its home (or `oats okf propose --home <retirement recovery> --soul <soul>` from the deployment for a retired source). Delete any souls.launch key for oats.okf/knowledge-harvester and any --provider oats.okf harvest=... spawn flag; rename the trigger template oats.okf:harvest-review to oats.okf:proposal-review. See the 6.0 release note.';
test('the harvester stub: no skills or instructions, a required spawn hook that always refuses with the spec\'s E_REMOVED text and writes nothing',()=>{
  const m=cap(STUB_CAP);
  assert.deepEqual(m.hooks,{spawn:{command:'bin/okf-harvest.mjs spawn',required:true}});
  assert.deepEqual(Object.keys(m.commands).sort(),['complete','harvest-status']);
  for(const k of ['skills','inject','settings']) assert.equal(Object.hasOwn(m,k),false,k);
  assert.deepEqual(files(join(PKG,'capabilities',STUB_CAP)),{'oats.json':files(join(PKG,'capabilities',STUB_CAP))['oats.json'],'bin/okf-harvest.mjs':files(join(PKG,'capabilities',STUB_CAP))['bin/okf-harvest.mjs']},'no skills, scripts or inject');
  const soul=fs.readFileSync(join(PKG,'souls',STUB_SOUL,'soul.yaml'),'utf8');
  assert.match(soul,/^knowledge: none$/m);assert.ok(soul.includes(`  oats.okf-harvest: { from: here }`));
  const bin=join(PKG,'capabilities',STUB_CAP,'bin/okf-harvest.mjs');
  for(const proposal of ['# OKF proposal: x\n\nSource: instance src, home /d/agents/s/instances/src, soul s\n','anything']) {
    const cwd=fs.mkdtempSync(join(ROOT,'.stub-')),home=fs.mkdtempSync(join(ROOT,'.stub-home-'));
    try {
      const r=spawnSync(process.execPath,[bin,'spawn'],{cwd,env:{PATH:process.env.PATH,OATS_EVENT:'spawn',OATS_INSTANCE_HOME:home,OATS_TASK:proposal},encoding:'utf8'});
      assert.equal(r.status,1);assert.deepEqual(JSON.parse(r.stdout),{warning:`oats-okf-harvest ${REMOVED_SPAWN}`},'no meta, the exact text');
      assert.deepEqual(fs.readdirSync(home),[]);assert.deepEqual(fs.readdirSync(cwd),[]);
    } finally {fs.rmSync(cwd,{recursive:true,force:true});fs.rmSync(home,{recursive:true,force:true});}
  }
  for(const command of ['complete','harvest-status']) {
    const r=spawnSync(process.execPath,[bin,command,'--json'],{encoding:'utf8'});
    assert.equal(r.status,1);const e=JSON.parse(r.stdout).error;assert.equal(e.code,'E_REMOVED');assert.match(e.message,/oats okf propose/);
  }
  // The release note and the README carry the same fix, with the hand steps.
  for(const doc of ['README.md','CHANGELOG.md']) {
    const text=prose(doc);
    assert.ok(text.includes(REMOVED_SPAWN),`${doc} quotes the refusal`);
    for(const step of ['grep -n "knowledge-harvester" oats-local.yaml','oats trigger remove okf-harvest-review','oats trigger add --from oats.okf:proposal-review --set repo=github.com/<owner>/<kb-repo>',
      "sed -i 's/oats.okf:harvest-review/oats.okf:proposal-review/' oats-triggers/okf-harvest-review.yaml",'oats okf propose --plan --slug <slug>','oats okf propose --home <retirement recovery directory> --soul <soul> --plan --slug <slug>']) assert.ok(text.includes(step),`${doc}: ${step}`);
  }
});

// Acceptance condition 3: every instance's knowledge instructions change in
// 6.0, and the shipped capabilities name a harvester only in a migration
// section (Markdown) or in the legacy code that reads 5.x/4.x PRs.
test('every shipped knowledge instruction changed since v5.8.0',()=>{
  for(const p of ['oats-package/capabilities/oats-okf/injects/okf.md','oats-package/capabilities/oats-okf/skills/okf-propose/SKILL.md',
    'oats-package/capabilities/oats-okf/skills/okf-instance-knowledge/SKILL.md','oats-package/capabilities/oats-okf/skills/knowledge-theory/SKILL.md',
    'oats-package/souls/knowledge-maintainer/AGENTS.md','oats-package/capabilities/oats-okf-maintenance/skills/knowledge-review/SKILL.md',
    'oats-package/capabilities/oats-okf-maintenance/injects/maintainer.md','README.md']) {
    const old=spawnSync('git',['show',`v5.8.0:${p}`],{cwd:ROOT,encoding:'utf8'});
    assert.equal(old.status,0,`${p} existed in v5.8.0`);
    assert.notEqual(fs.readFileSync(join(ROOT,p),'utf8'),old.stdout,`${p} changed in this release`);
  }
});

const LEGACY_CODE={
  'oats-okf-maintenance/lib/provenance.mjs':'parses version 2 blocks, whose key is `harvester`',
  'oats-okf-maintenance/bin/okf-maintenance.mjs':'review-context for version 2 PRs; notify-harvester answering E_REMOVED',
  'oats-okf-maintenance/oats.json':'the removed command notify-harvester stays declared so it answers E_REMOVED',
};
test('the shipped capabilities say "harvester" only in a migration section or in legacy 5.x/4.x code',()=>{
  const found=[];
  const walk=(dir,rel='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})) {const r=rel?`${rel}/${e.name}`:e.name;if(e.isDirectory()) walk(join(dir,e.name),r);else found.push(r);}};
  for(const c of CAPS) walk(join(PKG,'capabilities',c),c);
  walk(join(PKG,'souls','knowledge-maintainer'),'souls/knowledge-maintainer');
  const offenders=[];
  for(const rel of found) {
    const text=fs.readFileSync(join(PKG,rel.startsWith('souls/')?'':'capabilities',rel),'utf8');
    if(!/harvester/i.test(text)) continue;
    if(!rel.endsWith('.md')) {if(!Object.hasOwn(LEGACY_CODE,rel)) offenders.push(`${rel} (code)`);continue;}
    let section='';
    text.split('\n').forEach((line,i)=>{
      const h=/^#{1,6}\s+(.*)$/.exec(line);if(h) section=h[1];
      if(/harvester/i.test(line) && !/^Migration\b/.test(section)) offenders.push(`${rel}:${i+1}`);
    });
  }
  assert.deepEqual(offenders,[],'a harvester may be named only under a "Migration…" heading, or in the listed legacy code');
  // And no instruction says a harvester decides what is promoted, or that an agent waits for one.
  for(const rel of found.filter(r=>r.endsWith('.md'))) assert.doesNotMatch(fs.readFileSync(join(PKG,rel.startsWith('souls/')?'':'capabilities',rel),'utf8'),/harvester (?:promotes|decides|judges)|wait (?:on|for) (?:the|a|its) harvester/i,rel);
});

test('proposal-review fires on okf-proposal and okf-harvest; harvest-review is its byte-identical alias',()=>{
  const t=readJson(join(PKG,'triggers','proposal-review.json'));
  assert.equal(t.definition.id,'okf-proposal-review');
  assert.deepEqual(t.definition.on.labels,['okf-proposal','okf-harvest']);
  assert.equal(t.definition.spawn.soul,'oats.okf/knowledge-maintainer');
  assert.match(t.definition.spawn.task,/Load the knowledge-review skill first/);
  assert.deepEqual(fs.readFileSync(join(PKG,'triggers','harvest-review.json')),fs.readFileSync(join(PKG,'triggers','proposal-review.json')));
});

test('the two knowledge-theory copies are byte-identical',()=>{
  const [first,...rest]=CAPS.map(name=>files(join(PKG,'capabilities',name,'skills','knowledge-theory')));
  assert.ok(Object.keys(first).length);
  for(const copy of rest) assert.deepEqual(copy,first);
});

test('every okf-authoring copy is byte-identical (the proposer\'s in oats.okf, the maintainer\'s)',()=>{
  const [a,...rest]=CAPS.map(name=>files(join(PKG,'capabilities',name,'skills','okf-authoring')));
  assert.ok(Object.keys(a).length);
  for(const b of rest) assert.deepEqual(b,a);
});

for (const [name, capability] of [['knowledge-maintainer', 'oats.okf-maintenance']]) {
  test(`the ${name} soul keeps no knowledge and defaults to background`,()=>{
    const soul=fs.readFileSync(join(PKG,'souls',name,'soul.yaml'),'utf8');
    assert.match(soul,/^knowledge: none$/m);
    assert.match(soul,/^background: true(?:\s+#.*)?$/m);
    assert.ok(soul.includes(`  ${capability}: { from: here }`));
  });
}

// oats.okf 5.0.2 (#64): personal data is excluded by ONE sentence, the same
// wherever an agent is told what to leave out. An instruction, never a check.
const PERSONAL_DATA='Never include personal data about people outside the team (clients, correspondents, any other third party): a name, a contact detail, or anything else that identifies a person, including detail derived from correspondence. Keep the lesson and leave the person out. Naming the author of a published source you cite is fine.';
const NAMES='That covers the names you choose as well: a note\'s file name, a task ref and an instance\'s name are published as provenance when knowledge is proposed.';
// Markdown quoting, emphasis and line wrapping removed, so a sentence matches across lines.
const prose=p=>fs.readFileSync(join(ROOT,p),'utf8').replace(/^> ?/gm,'').replace(/\*\*/g,'').replace(/\s+/g,' ');
const count=(text,s)=>text.split(s).length-1;
const CAPDIR='oats-package/capabilities/';

test('okf-trigger-setup hands host timer installation to the operator',()=>{
  const text=fs.readFileSync(join(ROOT,CAPDIR,'oats-okf-maintenance/skills/okf-trigger-setup/SKILL.md'),'utf8');
  const install='oats schedule host install';
  const blocks=[...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].filter(block=>block[1].includes(install));
  assert.ok(blocks.length>0,'keep the install command visible for the operator to copy');
  for(const block of blocks) {
    const lines=block[1].split('\n').map(line=>line.replace(/#.*$/,'').trim()).filter(Boolean);
    assert.ok(lines.every(line=>/^oats schedule host install(?:\s+--[\w-]+(?:\s+[\w-]+)?)*$/.test(line)),
      'the operator block contains install lines alone, with no agent commands');
    assert.ok(lines.every(line=>!/--print\b/.test(line)),'no agent-shell preview is offered');
    const before=text.slice(0,block.index).trimEnd().split(/\n[ \t]*\n/).pop().replace(/\s+/g,' ');
    for(const required of [/operator's step/,/never yours/,/their own terminal/,/deployment directory/,/outside every instance home/]) {
      assert.match(before,required,'the immediately preceding paragraph hands installation to the operator');
    }
    assert.match(text.slice(0,block.index),/^oats schedule host status\s*(?:#.*)?$/m,'check status before offering installation');
  }
  const normalized=text.replace(/\*\*/g,'').replace(/\s+/g,' ');
  assert.match(normalized,/If this host has none yet/,'installation is conditional on a missing timer');
  assert.match(normalized,/Do not run it yourself, with or without flags\./);
  assert.match(normalized,/On OATS 0\.52\.0 and later, do not offer its `--print` from your shell as a preview/);
  assert.match(normalized,/After the operator has run it, check the result yourself with `oats schedule host status`/);
  assert.match(normalized,/With no operator at the machine, the timer stays as it is until they run the command: say what is waiting, and do not run it in their place/);
  assert.doesNotMatch(normalized,/Run it for this review trigger only/,'remove the contradictory installation imperative');
});

test('the personal-data exclusion is one sentence, the same at every place an agent is told what to exclude',()=>{
  const places={
    'oats-okf/skills/okf-instance-knowledge/SKILL.md':1,'oats-okf/injects/okf.md':1,'oats-okf/skills/okf-propose/SKILL.md':1,
    'oats-okf-maintenance/skills/knowledge-review/SKILL.md':1,
    ...Object.fromEntries(CAPS.map(name=>[`${name}/skills/knowledge-theory/SKILL.md`,1]))
  };
  for(const [file,times] of Object.entries(places)) {
    const text=prose(CAPDIR+file);
    assert.equal(count(text,PERSONAL_DATA),times,file);
    assert.equal(count(text,'personal data about people outside the team'),times,`${file}: no second wording`);
  }
  assert.equal(count(prose('README.md'),PERSONAL_DATA),1,'README quotes the sentence');
});

test('the names a working instance chooses are covered: capture skill, inject and proposing skill',()=>{
  for(const file of ['oats-okf/skills/okf-instance-knowledge/SKILL.md','oats-okf/injects/okf.md','oats-okf/skills/okf-propose/SKILL.md']) assert.equal(count(prose(CAPDIR+file),NAMES),1,file);
});

test('the proposer and the reviewer apply it to what is published, provenance names included',()=>{
  const propose=prose(CAPDIR+'oats-okf/skills/okf-propose/SKILL.md');
  for(const s of ['Read the printed diff once, in full, as a reviewer would','against the personal-data sentence above (note file names, task refs and your instance name included)',
    'runs the content screen over everything that would leave this host']) assert.ok(propose.includes(s),s);
  const review=prose(CAPDIR+'oats-okf-maintenance/skills/knowledge-review/SKILL.md');
  for(const s of ['the names in the provenance block (note file names, task refs, instance names)',
    'Your review comes after the push: rewriting can remove branch-only content from the PR branch\'s reachable history, but cannot undo the initial exposure.',
    'Your main job is knowledge theory:','verify each claim against the source it cites','second reader','You gate every merge']) assert.ok(review.includes(s),s);
});

// oats.okf 5.7.0 (awebai/oats-okf#118): a supersession of a human-accepted
// decision is settled at review, never parked for a human.
test('every place that teaches a human-accepted supersession settles it at review and parks nothing',()=>{
  const theory=prose(CAPDIR+'oats-okf/skills/knowledge-theory/SKILL.md'),review=prose(CAPDIR+'oats-okf-maintenance/skills/knowledge-review/SKILL.md');
  for(const [name,text] of [['knowledge-theory',theory],['knowledge-review',review]]) {
    for(const s of ['verified at <link>','source-reported (who, when, where)','source-reported (relay at <link>)','is trusted without a check','an agent alone does not overturn a human\'s decision','the new concept names the old one, the old concept says it is superseded and links the new one, and the node log names the supersession'])
      assert.ok(text.toLowerCase().includes(s.toLowerCase()),`${name}: ${s}`);
  }
  // Verified shows the account and the record, never that a human typed it; a relay is the source's report.
  const VERIFIED='Verified proves the record, not that a human typed it: agents may post under their human\'s account.';
  for(const [name,text] of [['knowledge-theory',theory],['knowledge-review',review],['CHANGELOG',prose('CHANGELOG.md')]]) {
    assert.ok(text.includes(VERIFIED),`${name}: what verified proves`);
    assert.match(text,/under the account the citation names, and says? the cited thing/,`${name}: the account the citation names`);
    // A relay on GitHub is opened and checked too (awebai/oats-okf#119): confirmed, it is source-reported (relay at <link>).
    assert.match(text,/a relay on GitHub\)? \(a record that presents itself as an agent reporting the human's words\)/i,`${name}: a relay on GitHub`);
    assert.ok(text.includes('say that the relaying agent reported the human\'s acceptance of this change'),`${name}: what a relay must say`);
    assert.doesNotMatch(text,/a relay's link too|or (?:is )?a relay\)? \(/,`${name}: a relay is not trusted unchecked`);
    assert.doesNotMatch(text,/the named human's own account/,`${name}: no claim about whose hands`);
  }
  assert.ok(theory.includes('one whose GitHub record or relay does not confirm it'),'knowledge-theory: an unconfirmed relay is closed');
  assert.ok(review.includes('the record is a relay on GitHub (a record that presents itself as an agent reporting the human\'s words): it is the source\'s report, not the human\'s own record, but you check it as in step 2.'),'knowledge-review: a GitHub relay is opened');
  assert.ok(review.includes('record the acceptance as source-reported (relay at <link>), never as verified. Not confirmed (missing, it cannot be opened, or it says something else): close with that reason.'),'knowledge-review: an unconfirmed relay is closed');
  assert.ok(prose('CHANGELOG.md').includes('not confirmed or not openable, it closes the PR with the reason'),'CHANGELOG: an unconfirmed relay is closed');
  assert.match(review,/The author login must be the account the citation names\./);
  assert.ok(review.includes('right before merging: stop if settled node'),'the merge pre-check stops only if settled and calls the gate');
  assert.match(review,/scripts\/okf-publication\.mjs' merge/,'merge uses the exact-byte gate');
  assert.doesNotMatch(review,/"verdict": "needs-human"|--add-label okf-needs-human|stop if blocked/);
  // The label survives only as the note that an old one stops nothing.
  const mentions=[];
  (function walk(dir){for(const e of fs.readdirSync(join(ROOT,dir),{withFileTypes:true})) {const p=`${dir}/${e.name}`;if(e.isDirectory()) walk(p);else if(fs.readFileSync(join(ROOT,p),'utf8').includes('okf-needs-human')) mentions.push(p);}})('oats-package');
  assert.deepEqual(mentions.sort(),[CAPDIR+'oats-okf-maintenance/skills/knowledge-review/SKILL.md',CAPDIR+'oats-okf-maintenance/skills/okf-trigger-setup/SKILL.md']);
  for(const p of [CAPDIR+'oats-okf-maintenance/injects/maintainer.md','oats-package/souls/knowledge-maintainer/AGENTS.md']) assert.match(prose(p),/without citing the human's acceptance is closed; check a citation on GitHub before you merge; never park a PR\./,p);
  assert.doesNotMatch(prose('README.md'),/hard stop/);
});

// The harvest-review trigger polls, so a parked PR is re-reviewed only by a close a poll saw, then a reopen.
test('the parked-PR re-review step closes, waits for a poll, then reopens, the same in the CHANGELOG and okf-trigger-setup',()=>{
  for(const file of ['CHANGELOG.md',CAPDIR+'oats-okf-maintenance/skills/okf-trigger-setup/SKILL.md']) {
    const text=prose(file);
    for(const s of ['The trigger polls: a close it never saw is no reopen.','`oats trigger test` does not count: it records nothing.','Never clear the trigger\'s dedup state.',
      'Retire the knowledge-maintainer instances left from older reviews, running or stopped','keeps the old behaviour',
      // Only a good, complete poll records a close (a failed one advances lastPoll; 100 fetched may be truncated).
      'shows a `lastPoll` after the closes with `ok: true` and `prs` under 100','Only such a poll records a close: a failed poll records none (keep waiting)',
      'stop and report the poll cap; do not reopen',
      // The text status shows counts only; the per-PR events are in its JSON.
      '`oats trigger status <id> --json` lists a `pending` or `fired` entry with `event: "reopened"` for each PR\'s number']) assert.ok(text.includes(s),`${file}: ${s}`);
    const wait=text.indexOf('shows a `lastPoll` after the closes');
    assert.ok(text.indexOf('then close it')<wait&&wait<text.indexOf('Reopen each PR'),`${file}: close, wait for a complete poll, reopen, in that order`);
    assert.doesNotMatch(text,/close and reopen each|closing and reopening the PR/,`${file}: no back-to-back close and reopen`);
  }
});

test('the README says what is an instruction and what is enforced, with the opt-out\'s two limits',()=>{
  const readme=prose('README.md');
  for(const s of ['Personal data is excluded by instruction and a bounded publication screen; neither is a universal privacy guarantee.',
    'The propose command copies evidence hashes but does not judge content.','not the initial exposure or GitHub\'s retained pull refs/caches/clones.',
    'The soul\'s opt-out is enforced in code.','It is per soul. No instance, note, host or spawn setting opts out.',
    'It covers that soul\'s own proposals. The command checks the home it is given. What an instance of that soul writes to other seats in messages is theirs to capture and propose.',
    // oats.okf 6.0 (spec §7): the five steps, the operator form, the gate, protection and the upgrade.
    'oats okf propose --plan --slug <slug>','oats okf propose --check --slug <slug>','oats okf propose --apply --slug <slug> --digest <digest>',
    'The operator form.','gates every merge','Protect the accepted branch.','protection: enforced | none | unknown',
    'Harvesters already running keep their 5.x modules and finish, or a person retires them; a retained one is retired and its claims re-proposed by the source with `oats okf propose`, or by the operator form on its retirement recovery.',
    '`oats.okf:harvest-review` is its old name','screen-terms-file']) assert.ok(readme.includes(s),s);
  for(const code of ['E_USAGE','E_SOURCE','E_OPTED_OUT','E_PROPOSAL_EXISTS','E_SCOPE','E_OWNER','E_DIGEST','E_CONTENT_REFUSED','E_CONTENT_INPUT','E_PROPOSAL_FORMAT','E_NOTE','E_BASE_MOVED','E_PUSH_UNCERTAIN','E_GH','E_PR_UNCERTAIN']) assert.ok(readme.includes(`\`${code}\``),code);
});
