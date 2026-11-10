import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writePlainBase, bridge, reindex, validate, REJECTED, SUBJECT_COUNTS } from './fixtures/bridged-base.mjs';
import { validateDeclaration, resolveSubjects } from '../oats-package/capabilities/oats-okf/lib/config.mjs';
import { generate, parseView, parseSubjectsIndex, parseVerdictsIndex, readConcepts, titleHash, flowList } from '../oats-package/capabilities/oats-okf/lib/okf-reindex.mjs';
import { verdictLanes } from '../oats-package/capabilities/oats-okf/lib/verdicts.mjs';
// oats.okf 6.0, the subject layout (spec docs/design/2026-11-10-subject-layer-in-oats-okf.md):
// a bridged version-1 base, validator v2, the regenerator, okf.json version 2,
// the spawn brief, the subject verbs and the verdict lanes. The 5.8 fact: the
// bridged fixture passes the UNCHANGED v5.8.0 validator.
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CLI=join(ROOT,'oats-package/capabilities/oats-okf/bin/oats-okf.mjs');
const CAPS=join(ROOT,'oats-package/capabilities');
const GIT_DIR=(process.env.PATH||'').split(delimiter).find(d=>d && fs.existsSync(join(d,'git')));
const write=(file,text)=>{fs.mkdirSync(dirname(file),{recursive:true});fs.writeFileSync(file,text);};
const json=(file,value)=>write(file,JSON.stringify(value,null,2)+'\n');
const tmp=(t,prefix)=>{const d=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),prefix)));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const edit=(file,from,to)=>{const text=fs.readFileSync(file,'utf8');assert.ok(text.includes(from),`${file} lacks ${from}`);fs.writeFileSync(file,text.replace(from,to));};
const gitEnv=user=>({HOME:user,PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'});

function bridged(t) { const dir=join(tmp(t,'okf6-bridged-'),'base'); writePlainBase(dir); bridge(dir); return dir; }

// ------------------------------------------------------------- validator v2
test('validator v2 accepts the bridged fixture with --strict: 0 errors, 0 warnings, subject layout',t=>{
  const dir=bridged(t),r=validate(dir,{env:{OKF_STRICT_EXIT:'1'}});
  assert.equal(r.status,0,r.text);
  assert.deepEqual([r.out.errors,r.out.warnings,r.out.layout],[[],[],'subjects']);
});

test('the 5.8 fact: the bridged fixture passes the UNCHANGED v5.8.0 validator with 0 errors and 0 warnings',t=>{
  const dir=bridged(t),old=join(dirname(dir),'okf-validate-5.8.0.mjs');
  const shown=spawnSync('git',['-C',ROOT,'show','v5.8.0:oats-package/capabilities/oats-okf/lib/okf-validate.mjs'],{encoding:'utf8'});
  assert.equal(shown.status,0,`the v5.8.0 tag is needed (CI checks out with fetch-depth 0): ${shown.stderr}`);
  fs.writeFileSync(old,shown.stdout);
  const r=validate(dir,{validator:old,env:{OKF_STRICT_EXIT:'1'}});
  assert.equal(r.status,0,r.text);
  assert.equal(r.out.concepts,6,'3 claims, 2 subjects, 1 verdict');
  assert.deepEqual([r.out.errors,r.out.warnings],[[],[]]);
});

const ERRORS=[
  ['about missing',d=>edit(join(d,'peer/lesson.md'),'about: ["workstream/knowledge"]\n',''),/peer\/lesson\.md: 'about' must list one or more subjects/],
  ['about empty',d=>edit(join(d,'peer/lesson.md'),'about: ["workstream/knowledge"]','about: []'),/peer\/lesson\.md: 'about' must list/],
  ['about a scalar',d=>edit(join(d,'peer/lesson.md'),'about: ["workstream/knowledge"]','about: workstream/knowledge'),/peer\/lesson\.md: 'about' must list/],
  ['about an unknown subject',d=>edit(join(d,'peer/lesson.md'),'about: ["workstream/knowledge"]','about: [workstream/knowledge, system/nope]'),/about names "system\/nope", which has no subject file subjects\/system\/nope\.md/],
  ['a subject with the wrong type',d=>edit(join(d,'subjects/system/okf.md'),'type: System','type: Workstream'),/subjects\/system\/okf\.md: a subject in subjects\/system\/ has type System, not "Workstream"/],
  ['a subject outside a kind directory',d=>write(join(d,'subjects/team/okf.md'),'---\ntype: System\ntitle: x\ndescription: x\n---\n'),/subjects\/team\/okf\.md: not a subject file/],
  ['a Verdict outside verdicts/',d=>edit(join(d,'claims/insights/consult-reads-one-blob.md'),'type: Insight','type: Verdict'),/consult-reads-one-blob\.md: a Verdict lives only under verdicts\//],
  ['a claim under claims/ without id',d=>edit(join(d,'claims/insights/consult-reads-one-blob.md'),'id: ins-000000000003\n',''),/consult-reads-one-blob\.md: missing 'id'/],
  ['a malformed flow list',d=>edit(join(d,'peer/lesson.md'),'about: ["workstream/knowledge"]','about: [workstream/knowledge, [nested]]'),/peer\/lesson\.md: malformed flow list in 'about'/],
  ['a duplicate id',d=>edit(join(d,'peer/lesson.md'),'id: ins-000000000002','id: dec-000000000001'),/id dec-000000000001 is also/],
  ['a verdict whose title-hash is not derived',d=>edit(join(d,`verdicts/${REJECTED.id}.md`),`title-hash: ${titleHash(REJECTED.type,REJECTED.title)}`,'title-hash: 0000000000000000'),/title-hash must be/],
];
for(const [name,mutate,error] of ERRORS) test(`validator v2 refuses ${name} (an error, with and without --strict)`,t=>{
  const dir=bridged(t);mutate(dir);
  for(const strict of [false,true]) {
    const r=validate(dir,{strict});
    assert.equal(r.status,1,r.text);
    assert.ok(r.out.errors.some(e=>error.test(e)),`${strict?'--strict':'plain'}: ${JSON.stringify(r.out.errors)}`);
  }
});

test('validator v2: an old-node claim without id is a --strict warning only, until the bridge PR stamps it',t=>{
  const dir=bridged(t);edit(join(dir,'peer/lesson.md'),'id: ins-000000000002\n','');
  const plain=validate(dir,{strict:false});
  assert.equal(plain.status,0,plain.text);assert.deepEqual([plain.out.errors,plain.out.warnings],[[],[]]);
  const strict=validate(dir);
  assert.equal(strict.status,0,strict.text);assert.deepEqual(strict.out.errors,[]);
  assert.deepEqual(strict.out.warnings,["peer/lesson.md: missing 'id' (stamped by the maintainer at acceptance)"]);
});

test('validator v2: a stale generated index is a --strict warning, an error exit only with OKF_STRICT_EXIT',t=>{
  const dir=bridged(t);edit(join(dir,'peer/lesson.md'),'description: A fake','description: Any fake');
  assert.deepEqual(validate(dir,{strict:false}).out.warnings,[],'not without --strict');
  const strict=validate(dir);
  assert.equal(strict.status,0,strict.text);
  assert.deepEqual(strict.out.warnings,['subjects/workstream/knowledge/index.md: generated index is stale; run okf-reindex.mjs']);
  assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,1);
  // A hand-edited root Subjects section is stale too.
  reindex(dir);edit(join(dir,'index.md'),'## Subjects\n\n* [Subjects]','## Subjects\n\n* [Our subjects]');
  assert.deepEqual(validate(dir).out.warnings,['index.md: generated index is stale; run okf-reindex.mjs']);
});

test('validator v2 on a plain version-1 base: unchanged (same findings as v5.8.0, list-looking values are not checked)',t=>{
  const dir=writePlainBase(join(tmp(t,'okf6-plain-'),'base'));
  edit(join(dir,'peer/lesson.md'),'description: A fake','tags: [a, [b]]\nabout: [system/nope]\ndescription: A fake');
  write(join(dir,'expert/orphan.md'),'---\ntype: Decision\n---\n\nSee [missing](missing.md).\n');
  write(join(dir,'expert/untyped.md'),'---\ntitle: No type\n---\n');
  const old=join(dirname(dir),'old.mjs');
  fs.writeFileSync(old,spawnSync('git',['-C',ROOT,'show','v5.8.0:oats-package/capabilities/oats-okf/lib/okf-validate.mjs'],{encoding:'utf8'}).stdout);
  for(const strict of [false,true]) {
    const now=validate(dir,{strict}),then=validate(dir,{strict,validator:old});
    assert.equal(now.out.layout,'plain');
    assert.deepEqual([now.status,now.out.errors,now.out.warnings],[then.status,then.out.errors,then.out.warnings]);
  }
});

test('a base with only some reserved nodes, or a non-sentinel owner, is a plain base',t=>{
  const dir=bridged(t),file=join(dir,'okf-base.json'),meta=JSON.parse(fs.readFileSync(file,'utf8'));
  meta.nodes.verdicts.owner='owner-1';fs.writeFileSync(file,JSON.stringify(meta));
  edit(join(dir,'peer/lesson.md'),'about: ["workstream/knowledge"]\n','');
  const r=validate(dir);
  assert.equal(r.out.layout,'plain');assert.deepEqual(r.out.errors,[]);
});

test('the flow-list parser: bare and JSON-quoted items, empty, and malformed or nested lists refused',()=>{
  assert.deepEqual(flowList('[a, b]'),['a','b']);
  assert.deepEqual(flowList('["a, b", "c\\"d", e f]'),['a, b','c"d','e f']);
  assert.deepEqual(flowList('[]'),[]);
  for(const bad of ['[a, [b]]','[a,,b]','[a, ]','["a]','[a "b"]']) assert.equal(flowList(bad),null,bad);
});

// ------------------------------------------------------------- regenerator
test('the regenerator is deterministic and --check catches a stale or orphaned index',t=>{
  const a=bridged(t),b=bridged(t);
  const files=d=>Object.fromEntries(['index.md','subjects/index.md','subjects/system/okf/index.md','subjects/workstream/knowledge/index.md','verdicts/index.md'].map(p=>[p,fs.readFileSync(join(d,p),'utf8')]));
  assert.deepEqual(files(a),files(b),'two fresh bases regenerate byte-identically');
  const before=files(a);reindex(a);
  assert.deepEqual(files(a),before,'regenerating a clean base changes nothing');
  assert.equal(reindex(a,'--check').status,0);
  // A new claim makes its subjects' views stale.
  write(join(a,'claims/insights/second.md'),'---\ntype: Insight\ntitle: Second\ndescription: Two.\nabout: [system/okf]\nid: ins-000000000004\n---\n\n# Second\n');
  const stale=reindex(a,'--check','--json');
  assert.equal(stale.status,1,stale.stdout);
  assert.deepEqual(JSON.parse(stale.stdout).changed,[{path:'subjects/system/okf/index.md',status:'stale'}]);
  reindex(a);assert.equal(reindex(a,'--check').status,0);
  // A removed subject leaves an orphan view, removed on regeneration.
  fs.rmSync(join(a,'subjects/system/okf.md'));
  for(const f of ['expert/decision.md','claims/insights/consult-reads-one-blob.md','claims/insights/second.md']) edit(join(a,f),/about: \[[^\]]*\]/.exec(fs.readFileSync(join(a,f),'utf8'))[0],'about: [workstream/knowledge]');
  edit(join(a,'subjects/workstream/knowledge.md'),'legacy-nodes: [peer]','legacy-nodes: [peer, expert]');
  const orphan=JSON.parse(reindex(a,'--check','--json').stdout).changed;
  assert.ok(orphan.some(c=>c.path==='subjects/system/okf/index.md' && c.status==='orphan'),JSON.stringify(orphan));
  reindex(a);
  assert.equal(fs.existsSync(join(a,'subjects/system/okf')),false);
  assert.equal(validate(a,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
});

test('the regenerator refuses a plain base (exit 2) and its views parse back to the frontmatter',t=>{
  const plain=writePlainBase(join(tmp(t,'okf6-plain-'),'base'));
  assert.equal(reindex(plain,'--check').status,2);
  const dir=bridged(t);
  const view=parseView(fs.readFileSync(join(dir,'subjects/workstream/knowledge/index.md'),'utf8'));
  assert.equal(view.title,'Knowledge');assert.equal(view.description,'How OATS keeps and proposes knowledge.');
  assert.deepEqual(view.members.map(m=>m.path),['subjects/system/okf.md']);
  assert.deepEqual(view.sections.map(s=>[s.type,s.kind,s.entries.map(e=>e.path)]),[['Decision',null,['expert/decision.md']],['Lesson','lesson',['peer/lesson.md']]]);
  assert.deepEqual(parseSubjectsIndex(fs.readFileSync(join(dir,'subjects/index.md'),'utf8')).map(s=>s.ref),['system/okf','workstream/knowledge']);
  assert.deepEqual(parseVerdictsIndex(fs.readFileSync(join(dir,'verdicts/index.md'),'utf8')),[{id:REJECTED.id,path:`verdicts/${REJECTED.id}.md`,title:REJECTED.title,verdict:'rejected',claimType:'Decision',titleHash:titleHash(REJECTED.type,REJECTED.title),description:REJECTED.description}]);
  // generate() is the same function the validator compares against.
  const expected=generate(readConcepts(dir),fs.readFileSync(join(dir,'index.md'),'utf8'));
  for(const [p,text] of expected) assert.equal(fs.readFileSync(join(dir,p),'utf8'),text,p);
});

test('the shipped copies of the validator and the regenerator are byte-identical',()=>{
  for(const name of ['okf-validate.mjs','okf-reindex.mjs']) {
    const lib=fs.readFileSync(join(CAPS,'oats-okf/lib',name));
    for(const dir of fs.readdirSync(CAPS).map(c=>join(CAPS,c,'skills/okf-authoring/scripts')).filter(d=>fs.existsSync(d))) assert.deepEqual(fs.readFileSync(join(dir,name)),lib,`${dir}/${name}`);
  }
});

// ------------------------------------------------------------- declarations
test('okf.json version 2: subjects only, normalized with empty owns/reads; resolution against bases with the layout',()=>{
  assert.deepEqual(validateDeclaration({version:2,subjects:['system/okf','workstream/knowledge']}),{version:2,subjects:['system/okf','workstream/knowledge'],owns:[],reads:[]});
  for(const bad of [{version:2,subjects:['system/okf'],owns:[]},{version:2,subjects:[]},{version:2,subjects:['okf']},{version:2,subjects:['team/x']},{version:2,subjects:['system/a','system/a']},{version:3}])
    assert.throws(()=>validateDeclaration(bad),e=>e.code==='E_CONFIG',JSON.stringify(bad));
  const bindings={bases:{project:{},other:{}}},decl=validateDeclaration({version:2,subjects:['system/okf']});
  assert.doesNotThrow(()=>resolveSubjects(decl,bindings,{project:{subjects:['system/okf']},other:{subjects:null}}));
  assert.throws(()=>resolveSubjects(validateDeclaration({version:2,subjects:['system/nope']}),bindings,{project:{subjects:['system/okf']},other:{subjects:null}}),/^Error: unresolved subject: system\/nope$/);
  assert.throws(()=>resolveSubjects(decl,{bases:{project:{}}},{project:{subjects:null}}),/base project has no subject layout; declare owns\/reads \(version 1\) or bridge the base/);
  assert.doesNotThrow(()=>resolveSubjects(decl,bindings,{other:{subjects:null}}),'a base not judged yet (not primed) is skipped');
  assert.throws(()=>resolveSubjects(decl,bindings,{project:{subjects:['system/okf']},other:{subjects:['system/okf']}}),/resolves in several bases/);
  assert.doesNotThrow(()=>resolveSubjects(validateDeclaration({version:1,owner:'o',owns:[],reads:[]}),bindings,{}),'v1: nothing to resolve');
});

// ------------------------------------------------------------- the CLI on a Git base
/** A deployment whose Git base `project` is the bridged fixture (or a plain one). */
function deployment(t,{plain=false,decl={version:2,subjects:['system/okf','workstream/knowledge']}}={}) {
  const dir=tmp(t,'okf6-subjects-'),f={dir,repo:join(dir,'repo'),bindingsFile:join(dir,'deployment','okf-bindings.json'),stateDir:join(dir,'state'),soul:join(dir,'soul'),home:join(dir,'home'),user:join(dir,'user')};
  fs.mkdirSync(f.user,{recursive:true});
  writePlainBase(f.repo);if(!plain) bridge(f.repo);
  const git=(...args)=>{const r=spawnSync('git',['-C',f.repo,'-c','user.name=t','-c','user.email=t@example.invalid',...args],{env:gitEnv(f.user),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  spawnSync('git',['init','-q','-b','main',f.repo],{env:gitEnv(f.user)});git('add','-A');git('commit','-q','-m','accepted');
  f.git=git;
  json(f.bindingsFile,{version:1,stateDir:f.stateDir,bases:{project:{id:'base-1',kind:'git',repository:f.repo,root:'.',acceptedBranch:'main',pr:{repository:'example/knowledge'}}}});
  write(join(f.soul,'soul.yaml'),'schemaVersion: 2\nname: worker\n');
  json(join(f.soul,'okf.json'),decl);
  json(join(f.home,'instance.json'),{name:'worker-1',kind:'agent'});
  return f;
}
function run(f,args,{extra={},cwd=f.home}={}) {
  const env={HOME:f.user,PATH:[dirname(process.execPath),GIT_DIR].filter(Boolean).join(delimiter),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',
    OATS_SOUL:f.soul,OATS_INSTANCE_HOME:f.home,OATS_HOME:f.home,OATS_SETTINGS:JSON.stringify({'bindings-file':f.bindingsFile}),...extra};
  const r=spawnSync(process.execPath,[CLI,...args],{cwd,env,encoding:'utf8',timeout:60000});
  let out=null;try{out=JSON.parse(r.stdout);}catch{}
  return {status:r.status,stdout:r.stdout,stderr:r.stderr,out,text:`${args.join(' ')}: ${r.status}\n${r.stdout}${r.stderr}`};
}
const hook=(f,event)=>run(f,[event],{extra:{OATS_EVENT:event}});

test('spawn: a version-2 soul\'s brief lists one line per subject with counts from its generated index',t=>{
  const f=deployment(t),r=hook(f,'spawn');
  assert.equal(r.status,0,r.text);
  assert.equal(r.out.warning,undefined,r.text);
  assert.ok(r.out.brief.includes('`oats okf index` for your subjects:\n- system/okf — The knowledge provider package. (1 decision, 1 insight)\n- workstream/knowledge — How OATS keeps and proposes knowledge. (1 decision, 1 lesson)\nthen `oats okf subject KIND/SLUG`, `oats okf claims --about KIND/SLUG`'),r.out.brief);
  assert.doesNotMatch(r.out.brief,/owns:|reads:/);
});

test('spawn: a version-2 soul is refused on a plain base and for a subject with no file',t=>{
  const plain=hook(deployment(t,{plain:true}),'spawn');
  assert.notEqual(plain.status,0);
  assert.equal(plain.out.warning,'oats-okf E_CONFIG: base project has no subject layout; declare owns/reads (version 1) or bridge the base (release note §7.2)');
  const missing=hook(deployment(t,{decl:{version:2,subjects:['system/okf','system/nope']}}),'spawn');
  assert.notEqual(missing.status,0);
  assert.equal(missing.out.warning,'oats-okf E_CONFIG: unresolved subject: system/nope');
});

test('a version-1 soul on the bridged base: spawn brief and `index` unchanged from the plain base',t=>{
  const decl={version:1,owner:'owner-1',owns:['project/expert'],reads:['project/peer']};
  const plain=deployment(t,{plain:true,decl}),bridgedBase=deployment(t,{decl});
  const strip=text=>text.replace(/— project@[0-9a-f]{12} \(fetched [^)]*\)/,'');
  assert.equal(hook(bridgedBase,'spawn').out.brief,hook(plain,'spawn').out.brief);
  const a=run(plain,['index']),b=run(bridgedBase,['index']);
  assert.equal(b.status,0,b.text);
  assert.equal(strip(b.stdout),strip(a.stdout));
  assert.match(b.stdout,/^## project\/expert \(owns\)/);
  // The subject verbs serve it too; a subject ref reads that subject's index.
  const view=run(bridgedBase,['index','workstream/knowledge']);
  assert.equal(view.status,0,view.text);
  assert.match(view.stdout,/^## project\/workstream\/knowledge\n\n# Knowledge\n/);
});

test('`oats okf index` for a version-2 soul prints its subjects\' generated indexes; with a ref, that one',t=>{
  const f=deployment(t),head=f.git('rev-parse','HEAD');
  const all=run(f,['index','--json']);
  assert.equal(all.status,0,all.text);
  assert.deepEqual(all.out.result.indexes.map(x=>[x.subject,x.relation,x.path,x.receipt.commit]),[['system/okf','subject','subjects/system/okf/index.md',head],['workstream/knowledge','subject','subjects/workstream/knowledge/index.md',head]]);
  assert.equal(all.out.result.indexes[0].text,fs.readFileSync(join(f.repo,'subjects/system/okf/index.md'),'utf8'));
  const text=run(f,['index']);
  assert.match(text.stdout,/^## project\/system\/okf \(subject\)\n\n# oats-okf\n/);
  assert.match(text.stdout,new RegExp(`— project@${head.slice(0,12)} \\(fetched`));
  const root=run(f,['index','--base','project','--json']);
  assert.equal(root.out.result.indexes[0].path,'index.md','--base still reads the base root index');
});

test('`oats okf subjects` and `subject` read subjects/index.md and the subject\'s file and index',t=>{
  const f=deployment(t);
  const all=run(f,['subjects','--json']);
  assert.equal(all.status,0,all.text);
  assert.deepEqual(all.out.result.subjects.map(s=>[s.ref,s.title,s.declared]),[['system/okf','oats-okf',true],['workstream/knowledge','Knowledge',true]]);
  assert.equal(run(f,['subjects','--kind','workstream']).stdout.split('\n')[0],'workstream/knowledge — Knowledge: How OATS keeps and proposes knowledge.');
  assert.equal(run(f,['subjects','--kind','team','--json']).out.error.code,'E_USAGE');
  const ws=run(f,['subject','workstream/knowledge','--json']).out.result;
  assert.deepEqual([ws.legacyNodes,ws.members,ws.counts,ws.index],[['peer'],['system/okf'],SUBJECT_COUNTS['workstream/knowledge'],'subjects/workstream/knowledge/index.md']);
  const sys=run(f,['subject','system/okf']);
  assert.equal(sys.status,0,sys.text);
  assert.ok(sys.stdout.includes('\nlegacy nodes: expert\nin workstreams: workstream/knowledge\nclaims: 1 decision, 1 insight (/subjects/system/okf/index.md; `oats okf claims --about system/okf`)\n'),sys.stdout);
  assert.equal(run(f,['subject','system/nope','--json']).out.error.code,'E_NOT_FOUND');
  assert.equal(run(f,['subject','nope','--json']).out.error.code,'E_USAGE');
});

test('`oats okf claims --about` lists the subject\'s index entries, filtered by --type and --kind',t=>{
  const f=deployment(t);
  const all=run(f,['claims','--about','workstream/knowledge','--json']);
  assert.equal(all.status,0,all.text);
  assert.deepEqual(all.out.result.claims.map(c=>[c.type,c.kind,c.path]),[['Decision',null,'expert/decision.md'],['Lesson','lesson','peer/lesson.md']]);
  assert.deepEqual(run(f,['claims','--about','workstream/knowledge','--type','lesson','--json']).out.result.claims.map(c=>c.path),['peer/lesson.md']);
  assert.deepEqual(run(f,['claims','--about','system/okf','--kind','finding','--json']).out.result.claims.map(c=>c.path),['claims/insights/consult-reads-one-blob.md']);
  assert.equal(run(f,['claims','--about','system/okf']).stdout.split('\n')[0],'/expert/decision.md  [Decision] Pin the owner at spawn — The owner is pinned when the instance spawns.');
  assert.equal(run(f,['claims','--json']).out.error.code,'E_USAGE');
});

test('on a plain version-1 base every subject verb answers E_USAGE: base project has no subject layout',t=>{
  const f=deployment(t,{plain:true,decl:{version:1,owner:'owner-1',owns:['project/expert'],reads:['project/peer']}});
  const claim=join(f.dir,'claim.md');write(claim,'---\ntype: Decision\ntitle: x\n---\n');
  for(const args of [['subjects'],['subject','system/okf'],['claims','--about','system/okf'],['index','system/okf'],['verdicts','--check',claim]]) {
    const r=run(f,[...args,'--json']);
    assert.equal(r.out?.error?.code,'E_USAGE',r.text);
    assert.equal(r.out.error.message,'base project has no subject layout');
  }
});

test('`oats okf verdicts --check`: identity refuses a rejected id without reconsiders (E_VERDICT, the reason); the exact title hash lists candidates',t=>{
  const f=deployment(t),claim=join(f.dir,'claim.md');
  write(claim,`---\ntype: Decision\ntitle: Something new\ndescription: x\nabout: [system/okf]\nid: ${REJECTED.id}\n---\n`);
  const refused=run(f,['verdicts','--check',claim,'--json']);
  assert.equal(refused.status,1);
  assert.equal(refused.out.error.code,'E_VERDICT');
  assert.equal(refused.out.error.message,`claim id ${REJECTED.id} was rejected on 2026-11-10 (https://github.com/fixture/knowledge/pull/7): ${REJECTED.reason}; propose it again only with new evidence and a \`reconsiders: ${REJECTED.id}\` line`);
  write(claim,`---\ntype: Decision\ntitle: Something new\ndescription: x\nabout: [system/okf]\nreconsiders: ${REJECTED.id}\n---\n`);
  const reconsidered=run(f,['verdicts','--check',claim,'--json']);
  assert.equal(reconsidered.status,0,reconsidered.text);
  assert.deepEqual([reconsidered.out.result.identity.id,reconsidered.out.result.identity.reconsidered,reconsidered.out.result.candidates],[REJECTED.id,true,[]]);
  // A whitespace/case-only retry of the rejected title: a candidate, not a refusal.
  write(claim,'---\ntype: Decision\ntitle: "  keep a   HARVESTER per proposal "\ndescription: x\nabout: [system/okf]\n---\n');
  const hash=run(f,['verdicts','--check',claim,'--json']);
  assert.equal(hash.status,0,hash.text);
  assert.equal(hash.out.result.identity,null);
  assert.deepEqual(hash.out.result.candidates.map(c=>[c.id,c.verdict,c.lane]),[[REJECTED.id,'rejected','title-hash']]);
  assert.match(run(f,['verdicts','--check',claim]).stdout,/title hash [0-9a-f]{16}: 1 candidate\(s\) for the PR body:\n {2}dec-0000000000aa rejected \[Decision\] Keep a harvester per proposal/);
  // A different type is a different key; a paraphrase is not found by this lane.
  write(claim,'---\ntype: Insight\ntitle: Keep a harvester per proposal\n---\n');
  assert.deepEqual(run(f,['verdicts','--check',claim,'--json']).out.result.candidates,[]);
  assert.equal(run(f,['verdicts','--json']).out.error.code,'E_USAGE');
});

test('verdictLanes is pure: no index means no identity and no candidates',()=>{
  const r=verdictLanes({type:'Decision',title:'x',id:'dec-1'},'',()=>null);
  assert.deepEqual([r.identity,r.candidates,r.refusal],[null,[],null]);
});

test('bases and inspect report the subject layout',t=>{
  const f=deployment(t);
  const bases=run(f,['bases','--json']).out.result.bases[0];
  assert.deepEqual([bases.layout,bases.subjects],['subjects',2]);
  assert.match(run(f,['bases']).stdout,/valid OKF base, subject layout \(2 subjects\)/);
  const inspect=run(f,['inspect','--json']).out.result;
  assert.deepEqual(inspect.subjects,['system/okf','workstream/knowledge']);
  assert.match(inspect.summary,/^OKF: subjects system\/okf, workstream\/knowledge;/);
});
