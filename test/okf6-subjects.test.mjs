import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writePlainBase, bridge, reindex, validate, REJECTED, SUBJECT_COUNTS, REINDEX, VALIDATE } from './fixtures/bridged-base.mjs';
import { validateDeclaration, resolveSubjects } from '../oats-package/capabilities/oats-okf/lib/config.mjs';
import { generate, parseView, parseSubjectsIndex, parseVerdictsIndex, readConcepts, titleHash, flowList, parseFrontmatter, scalarValue, keyValue, textKey, GENERATED_NOTE, counts, withSubjectsSection } from '../oats-package/capabilities/oats-okf/lib/okf-reindex.mjs';
import { verdictLanes } from '../oats-package/capabilities/oats-okf/lib/verdicts.mjs';
import { resolveBasePath } from '../oats-package/capabilities/oats-okf/lib/consult.mjs';
import { validateBase } from '../oats-package/capabilities/oats-okf/lib/stores.mjs';
import { acceptedReader } from '../oats-package/capabilities/oats-okf/lib/propose.mjs';
import { migrate, deliverMigration, cutoverMigration } from '../oats-package/capabilities/oats-okf/lib/migration.mjs';
import { handleBindingRequest } from '../oats-package/capabilities/oats-okf/lib/binding-wire.mjs';
import { normalizeKnowledgeDeclaration } from '../oats-package/capabilities/oats-okf/lib/portable-binding.mjs';
import { prepareSubjectProposal, checkWriteSurface, proposalFindings, proposalVerdicts, verdictSection, legacyMap } from '../oats-package/capabilities/oats-okf/lib/write-surface.mjs';
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
  ['a duplicate verdict whose canonical is not one scalar id',d=>edit(join(d,`verdicts/${REJECTED.id}.md`),'verdict: rejected','verdict: duplicate\ncanonical: []'),/a duplicate verdict names the canonical claim id \(one scalar id\)/],
  ['a superseded verdict whose canonical is a list',d=>edit(join(d,`verdicts/${REJECTED.id}.md`),'verdict: rejected','verdict: superseded\ncanonical: [dec-000000000001]'),/a superseded verdict names the canonical claim id \(one scalar id\)/],
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
  edit(join(dir,'peer/lesson.md'),'description: A fake','tags: [a, [b]]\nkeywords: [unclosed\nabout: [system/nope]\ndescription: A fake');
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

test('flow lists through the frontmatter parser: an unclosed list is malformed, a quoted \' #\' survives, a bracketed scalar stays a scalar',t=>{
  const fm=parseFrontmatter('---\ntags: [broken\nkeys: ["C # compiler", tool] # a comment\ntitle: [WIP] a draft\nnote: plain # comment\nnested: [a, [b] junk\nquoted: ["]", x\nextra: [a,b]]\ntrailing: [a, b],\nlater: [WIP] x [y]\n---\n');
  assert.deepEqual(fm.listErrors,['tags','nested','quoted','extra','trailing']);
  assert.equal(fm.meta.later,'[WIP] x [y]');
  assert.deepEqual([fm.meta.keys,fm.meta.title,fm.meta.note],[['C # compiler','tool'],'[WIP] a draft','plain']);
  const dir=bridged(t);edit(join(dir,'peer/lesson.md'),'kind: lesson','kind: lesson\ntags: [broken');
  assert.ok(validate(dir).out.errors.includes("peer/lesson.md: malformed flow list in 'tags' (flat [a, \"b\"] items only)"));
  edit(join(dir,'peer/lesson.md'),'tags: [broken','tags: ["C # compiler", tool]');
  assert.deepEqual(validate(dir).out.errors,[]);
});

test('legacy types map to claim types in the views, counts and filters (Lesson, Conclusion, Limitation → Insight; Roadmap → Decision), the files untouched',t=>{
  const dir=bridged(t);
  const add=(name,type,kind)=>write(join(dir,`claims/insights/${name}.md`),`---\ntype: ${type}\ntitle: ${name}\ndescription: ${name}.\nabout: [system/okf]\n${kind?`kind: ${kind}\n`:''}id: x-${name}\n---\n`);
  add('conclusion','Conclusion','finding');add('limitation','Limitation','constraint');add('roadmap','Roadmap','direction');add('unkinded','Lesson');
  reindex(dir);
  const view=parseView(fs.readFileSync(join(dir,'subjects/system/okf/index.md'),'utf8'));
  assert.deepEqual(view.sections.map(s=>[s.type,s.kind,s.entries.map(e=>e.title)]),[
    ['Decision',null,['Pin the owner at spawn']],['Decision','direction',['roadmap']],
    ['Insight','constraint',['limitation']],['Insight','finding',['conclusion','Consult reads one committed index']],['Insight','lesson',['unkinded']]]);
  assert.match(fs.readFileSync(join(dir,'claims/insights/roadmap.md'),'utf8'),/^type: Roadmap$/m,'the file keeps its type');
  assert.equal(titleHash('Lesson','A title'),titleHash('Insight','A title'),'the title hash keys on the mapped type');
  assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
});

test('validator v2 on a bridged base: type must be a non-empty scalar; title and description lists are --strict warnings',t=>{
  const dir=bridged(t);edit(join(dir,'peer/lesson.md'),'type: Lesson','type: []');reindex(dir);
  assert.ok(validate(dir).out.errors.includes("peer/lesson.md: missing or empty required field 'type'"));
  edit(join(dir,'peer/lesson.md'),'type: []','type: [Lesson]');reindex(dir);
  assert.ok(validate(dir).out.errors.includes("peer/lesson.md: 'type' must be a non-empty scalar, not a list"));
  edit(join(dir,'peer/lesson.md'),'type: [Lesson]','type: Lesson');edit(join(dir,'peer/lesson.md'),'title: Fakes hide refusals','title: [Fakes, refusals]');reindex(dir);
  assert.ok(validate(dir).out.warnings.includes("peer/lesson.md: 'title' must be a scalar, not a list"));
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
  assert.deepEqual(view.sections.map(s=>[s.type,s.kind,s.entries.map(e=>e.path)]),[['Decision',null,['expert/decision.md']],['Insight','lesson',['peer/lesson.md']]]);
  assert.deepEqual(parseSubjectsIndex(fs.readFileSync(join(dir,'subjects/index.md'),'utf8')).map(s=>s.ref),['system/okf','workstream/knowledge']);
  assert.deepEqual(parseVerdictsIndex(fs.readFileSync(join(dir,'verdicts/index.md'),'utf8')),[{id:REJECTED.id,path:`verdicts/${REJECTED.id}.md`,title:REJECTED.title,verdict:'rejected',claimType:'Decision',titleHash:titleHash(REJECTED.type,REJECTED.title),description:REJECTED.description}]);
  // generate() is the same function the validator compares against.
  const expected=generate(readConcepts(dir),fs.readFileSync(join(dir,'index.md'),'utf8'));
  for(const [p,text] of expected) assert.equal(fs.readFileSync(join(dir,p),'utf8'),text,p);
});

const LINKS=[
  ['a symlinked generated index',(dir,outside)=>{fs.rmSync(join(dir,'subjects/system/okf/index.md'));fs.symlinkSync(join(outside,'target.md'),join(dir,'subjects/system/okf/index.md'));}],
  ['a symlinked directory above it',(dir,outside)=>{fs.rmSync(join(dir,'subjects/system/okf'),{recursive:true});fs.mkdirSync(join(outside,'dir'));fs.symlinkSync(join(outside,'dir'),join(dir,'subjects/system/okf'));}],
  ['a hardlinked generated index',(dir,outside)=>{fs.rmSync(join(dir,'subjects/index.md'));fs.linkSync(join(outside,'target.md'),join(dir,'subjects/index.md'));}],
  ['a symlinked okf-base.json',(dir,outside)=>{fs.renameSync(join(dir,'okf-base.json'),join(outside,'okf-base.json'));fs.symlinkSync(join(outside,'okf-base.json'),join(dir,'okf-base.json'));}],
  ['okf-base.json linked to a FIFO',(dir,outside)=>{fs.rmSync(join(dir,'okf-base.json'));spawnSync('mkfifo',[join(outside,'fifo')]);fs.symlinkSync(join(outside,'fifo'),join(dir,'okf-base.json'));}],
];
for(const [name,link] of LINKS) test(`the regenerator and propose refuse ${name} (E_PATH) and write nothing outside the base`,t=>{
  for(const via of ['cli','propose']) {
    const dir=bridged(t),outside=join(dirname(dir),'outside');
    fs.mkdirSync(outside);fs.writeFileSync(join(outside,'target.md'),'outside bytes\n');
    // A claim that makes the views stale, so a regeneration would write.
    write(join(dir,'claims/insights/new.md'),'---\ntype: Insight\ntitle: New\ndescription: New.\nabout: [system/okf]\nid: ins-000000000009\n---\n');
    link(dir,outside);
    const snapshot=()=>fs.readdirSync(outside,{recursive:true}).map(n=>[n,fs.statSync(join(outside,n)).isFile()?fs.readFileSync(join(outside,n),'utf8'):'other']);
    const before=snapshot();
    if(via==='cli') for(const args of [[],['--check']]) {
      const r=spawnSync(process.execPath,[REINDEX,dir,...args],{encoding:'utf8',timeout:20000});
      assert.equal(r.status,2,r.stdout+r.stderr);assert.match(r.stderr,/E_PATH/);
    }
    else assert.throws(()=>prepareSubjectProposal({root:dir,decl:V2,ownedNodes:{},changes:[{path:'claims/insights/new.md',status:'A'}]}),e=>e.code==='E_PATH');
    assert.deepEqual(snapshot(),before,`${via}: the outside files are unchanged`);
  }
});

test('every generated link reads back its own file; a path a reader would resolve elsewhere (?, #, %) is never linked',t=>{
  const dir=bridged(t);
  for(const p of ['subjects/index.md','subjects/system/okf/index.md','subjects/workstream/knowledge/index.md','verdicts/index.md'])
    for(const line of fs.readFileSync(join(dir,p),'utf8').split('\n')) { const m=/\]\(\/([^)]+)\)/.exec(line); if(m) { assert.equal(resolveBasePath('/'+m[1]),m[1],line); assert.ok(fs.existsSync(join(dir,m[1])),line); } }
  for(const name of ['consult-reads-one-blob.md?different.md','x#y.md','x%2e.md']) {
    const d=bridged(t);
    write(join(d,'claims/insights',name),'---\ntype: Decision\ntitle: Different\ndescription: Another claim.\nabout: [system/okf]\nid: dec-different\n---\n');
    const r=spawnSync(process.execPath,[REINDEX,d],{encoding:'utf8'});
    assert.equal(r.status,2,name);assert.match(r.stderr,/E_PATH: .*cannot be linked from a generated index/);
    assert.ok(validate(d).out.errors.some(e=>/cannot be linked from a generated index/.test(e)),name);
  }
});

test('okf-base.json is classified the same by every reader: padding cannot hide the layout; a linked one is refused, not read as plain',t=>{
  const dir=bridged(t);
  edit(join(dir,'claims/insights/consult-reads-one-blob.md'),'about: [system/okf]\n','');
  fs.appendFileSync(join(dir,'okf-base.json'),' '.repeat(2*1024*1024));
  const r=validate(dir);
  assert.equal(r.out.layout,'subjects');
  assert.ok(r.out.errors.some(e=>/consult-reads-one-blob\.md: 'about' must list/.test(e)),JSON.stringify(r.out.errors));
  assert.throws(()=>validateBase(dir,{id:'base-1',kind:'directory',path:dir}),e=>e.code==='E_VALIDATION' && /'about' must list/.test(e.message));
  const linked=bridged(t),outside=join(dirname(linked),'meta.json');
  fs.renameSync(join(linked,'okf-base.json'),outside);fs.symlinkSync(outside,join(linked,'okf-base.json'));
  const v=validate(linked);
  assert.equal(v.status,1);assert.ok(v.out.errors.includes('okf-base.json: a symlink; the base metadata must be a regular single-link file'),JSON.stringify(v.out.errors));
});

test('okf-base.json above the shared metadata limit is refused by the validator, the regenerator and consult alike, never read as plain',t=>{
  const f=deployment(t);
  fs.appendFileSync(join(f.repo,'okf-base.json'),' '.repeat(17*1024*1024));
  const v=validate(f.repo);
  assert.equal(v.status,1);assert.ok(v.out.errors.some(e=>/^okf-base\.json is larger than 16777216 bytes/.test(e)),JSON.stringify(v.out.errors).slice(0,300));
  const r=spawnSync(process.execPath,[REINDEX,f.repo,'--check'],{encoding:'utf8'});
  assert.equal(r.status,2);assert.match(r.stderr,/E_TOO_LARGE/);
  f.git('add','-A');f.git('commit','-q','-m','padded');
  const s=run(f,['subjects','--base','project','--fresh','--json']);
  assert.equal(s.out.error.code,'E_TOO_LARGE',s.text.slice(0,500));
});

test('a plain base keeps 5.8\'s behaviour with an okf-base.json above the subject layout\'s metadata limit: it validates, spawns and is read as plain',t=>{
  const f=deployment(t,{plain:true,decl:{version:1,owner:'owner-1',owns:['project/expert'],reads:['project/peer']}});
  fs.appendFileSync(join(f.repo,'okf-base.json'),' '.repeat(17*1024*1024));
  assert.ok(fs.statSync(join(f.repo,'okf-base.json')).size>16*1024*1024);
  const old=join(f.dir,'okf-validate-5.8.0.mjs');
  fs.writeFileSync(old,spawnSync('git',['-C',ROOT,'show','v5.8.0:oats-package/capabilities/oats-okf/lib/okf-validate.mjs'],{encoding:'utf8'}).stdout);
  const now=validate(f.repo,{env:{OKF_STRICT_EXIT:'1'}}),then=validate(f.repo,{validator:old,env:{OKF_STRICT_EXIT:'1'}});
  assert.equal(now.status,0,now.text.slice(0,500));assert.equal(now.out.layout,'plain');
  assert.deepEqual([now.status,now.out.errors,now.out.warnings],[then.status,then.out.errors,then.out.warnings],'the same findings as v5.8.0');
  assert.equal(validateBase(f.repo,{id:'base-1',kind:'git',root:'.'}).subjects,null,'a writer validates it as plain');
  const r=spawnSync(process.execPath,[REINDEX,f.repo,'--check'],{encoding:'utf8'});
  assert.equal(r.status,2);assert.match(r.stderr,/has no subject layout/);assert.doesNotMatch(r.stderr,/E_TOO_LARGE/);
  assert.deepEqual(prepareSubjectProposal({root:f.repo,decl:validateDeclaration({version:1,owner:'owner-1',owns:['project/expert'],reads:[]}),ownedNodes:{expert:'expert'},changes:[]}),{about:[],regenerated:[]});
  f.git('add','-A');f.git('commit','-q','-m','padded');
  const spawned=hook(f,'spawn');
  assert.equal(spawned.status,0,spawned.text.slice(0,500));
  const bases=run(f,['bases','--json']);
  assert.equal(bases.status,0,bases.text.slice(0,500));
  assert.deepEqual([bases.out.result.bases[0].validated,bases.out.result.bases[0].layout],[{ok:true},'plain']);
  const index=run(f,['index','expert','--json']);
  assert.equal(index.status,0,index.text.slice(0,500));
  for(const args of [['subjects'],['subjects','--base','project','--fresh']]) {
    const s=run(f,[...args,'--json']);
    assert.equal(s.out.error.code,'E_USAGE',s.text.slice(0,500));assert.match(s.out.error.message,/base project has no subject layout/);
  }
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

test('readers tolerate stale generated indexes (an older view format, a missing old-node id): spawn warns W_INDEX_STALE in the brief, the verbs answer and warn; --strict and propose --check still refuse',t=>{
  const f=deployment(t);
  // views rendered by an older format: a legacy type heading, as before the type map
  for(const ref of ['system/okf','workstream/knowledge']) edit(join(f.repo,`subjects/${ref}/index.md`),'## Insight','## Lesson');
  edit(join(f.repo,'peer/lesson.md'),'id: ins-000000000002\n','');
  f.git('add','-A');f.git('commit','-q','-m','older views');
  const strict=validate(f.repo,{env:{OKF_STRICT_EXIT:'1'}});
  assert.equal(strict.status,1);
  assert.deepEqual(strict.out.warnings.filter(w=>/generated index is stale/.test(w)).sort(),['subjects/system/okf/index.md: generated index is stale; run okf-reindex.mjs','subjects/workstream/knowledge/index.md: generated index is stale; run okf-reindex.mjs']);
  assert.ok(strict.out.warnings.includes("peer/lesson.md: missing 'id' (stamped by the maintainer at acceptance)"));
  assert.equal(spawnSync(process.execPath,[REINDEX,f.repo,'--check'],{encoding:'utf8'}).status,1,'okf-reindex --check still reports them');
  const at=f.git('rev-parse','HEAD').slice(0,12);
  const spawned=hook(f,'spawn');
  assert.equal(spawned.status,0,spawned.text);
  assert.match(spawned.out.brief,new RegExp(`\\nW_INDEX_STALE: 2 generated files stale at project@${at}[0-9a-f]*; the maintainer regenerates \\(okf-reindex\\.mjs\\)$`),spawned.out.brief);
  assert.match(spawned.out.brief,/- system\/okf — The knowledge provider package\. \(1 decision, 1 lesson\)/,'the committed index, as it is');
  for(const args of [['subjects'],['subject','system/okf'],['claims','--about','system/okf'],['index'],['index','system/okf']]) {
    const r=run(f,[...args,'--json']);
    assert.equal(r.status,0,r.text);assert.equal(r.out.result.warnings.length,1,args.join(' '));
    assert.match(r.out.result.warnings[0],/^W_INDEX_STALE: 2 generated files stale at project@/);assert.match(r.stderr,/^W_INDEX_STALE: /m);
  }
  const claim=join(f.dir,'claim.md');write(claim,'---\ntype: Decision\ntitle: New\ndescription: x\nabout: [system/okf]\n---\n');
  assert.equal(run(f,['verdicts','--check',claim,'--json']).out.result.warnings.length,1);
  const bases=run(f,['bases','--json']);assert.equal(bases.status,0);assert.equal(bases.out.result.bases?.[0]?.validated?.ok ?? bases.out.result[0]?.validated?.ok,true,bases.text);
  assert.throws(()=>validateBase(f.repo,{id:'base-1',kind:'git',root:'.'}),e=>e.code==='E_VALIDATION' && /generated index is stale/.test(e.message));
  assert.equal(validateBase(f.repo,{id:'base-1',kind:'git',root:'.'},{reader:true}).stale,2);
});

/** The two subject views rendered by an older format (stale), committed: the accepted branch moves. */
function staleCommit(f) {
  for(const ref of ['system/okf','workstream/knowledge']) edit(join(f.repo,`subjects/${ref}/index.md`),'## Insight','## Lesson');
  f.git('add','-A');f.git('commit','-q','-m','older views');
  return f.git('rev-parse','HEAD').slice(0,12);
}
test('W_INDEX_STALE on a moved commit: the first read of a commit no spawn or `bases` validated validates it and warns (after --fresh, and after a due fetch)',t=>{
  const claim=f=>{const file=join(f.dir,'claim.md');write(file,'---\ntype: Decision\ntitle: New\ndescription: x\nabout: [system/okf]\n---\n');return file;};
  const verbs=[()=>['subjects'],()=>['subject','system/okf'],()=>['claims','--about','system/okf'],()=>['index'],()=>['index','system/okf'],f=>['verdicts','--check',claim(f)]];
  for(const make of verbs) {
    for(const how of ['--fresh','due']) {
      const f=deployment(t),verb=make(f),extra=how==='due'?{OATS_SETTINGS:JSON.stringify({'bindings-file':f.bindingsFile,'consult-max-age':0})}:{},args=verb;
      const first=run(f,[...verb,'--json'],{extra});
      assert.equal(first.status,0,first.text);assert.equal(first.out.result.warnings,undefined,`${args[0]} ${how}: the clean commit warns nothing`);
      const at=staleCommit(f);
      const moved=run(f,[...verb,...(how==='--fresh'?['--fresh']:[]),'--json'],{extra});
      assert.equal(moved.status,0,moved.text);
      assert.deepEqual(moved.out.result.warnings,[`W_INDEX_STALE: 2 generated files stale at project@${at}; the maintainer regenerates (okf-reindex.mjs)`],`${args[0]} ${how}: ${moved.text}`);
      assert.match(moved.stderr,/^W_INDEX_STALE: 2 generated files stale at /m);
      const again=run(f,[...verb,'--json']);
      assert.equal(again.out.result.warnings?.length,1,`${args[0]} ${how}: the cached validation warns again`);
    }
  }
});

// okf 6.0.2 (#138): a claims/ concept merged without the maintainer's id stamp
// (the PR merged directly on an unprotected branch). Readers read and warn
// W_ID_MISSING; `bases` agrees with them; the strict surfaces still report it.
const UNSTAMPED='claims/insights/merged-unstamped.md';
function unstampedCommit(f) {
  write(join(f.repo,UNSTAMPED),"---\ntype: Insight\ntitle: Merged without its id\ndescription: A proposal merged without the maintainer's stamp.\nabout: [system/okf]\nkind: finding\n---\n\n# Merged without its id\n\nOne click on an unprotected branch.\n");
  reindex(f.repo);
  f.git('add','-A');f.git('commit','-q','-m','merged without the maintainer');
  return f.git('rev-parse','HEAD').slice(0,12);
}
const idWarning=at=>`W_ID_MISSING: 1 claim lacks an id at project@${at}; the maintainer stamps it (knowledge-review)`;
const claimFile=f=>{const file=join(f.dir,'claim.md');write(file,'---\ntype: Decision\ntitle: New\ndescription: x\nabout: [system/okf]\n---\n');return file;};
const VERBS=[()=>['subjects'],()=>['subject','system/okf'],()=>['claims','--about','system/okf'],()=>['index'],f=>['verdicts','--check',claimFile(f)]];
const MISSING_ID=`${UNSTAMPED}: missing 'id' (stamped by the maintainer at acceptance)`;

test('readers tolerate a claims/ concept merged without id: spawn succeeds and warns W_ID_MISSING, the five subject verbs answer with one warning each, `bases` says valid with the warning; okf-validate --strict still reports it',t=>{
  const f=deployment(t),at=unstampedCommit(f),w=idWarning(at);
  const strict=validate(f.repo);
  assert.equal(strict.status,1,strict.text);
  assert.deepEqual(strict.out.errors,[MISSING_ID],'okf-validate --strict reports it, as an error');
  assert.equal(reindex(f.repo,'--check').status,0,'okf-reindex --check: the generated indexes are current');
  assert.throws(()=>validateBase(f.repo,{id:'base-1',kind:'git',root:'.'}),e=>e.code==='E_VALIDATION' && e.message===MISSING_ID,'writers stay strict');
  const reader=validateBase(f.repo,{id:'base-1',kind:'git',root:'.'},{reader:true});
  assert.deepEqual([reader.unstamped,reader.stale],[1,0]);
  const spawned=hook(f,'spawn');
  assert.equal(spawned.status,0,spawned.text);
  assert.ok(spawned.out.brief.endsWith(`\n${w}`),spawned.out.brief);
  assert.equal(spawned.out.warning,`oats-okf: ${w}`);
  assert.match(spawned.out.brief,/- system\/okf — The knowledge provider package\. \(1 decision, 2 insights\)/,'the unstamped claim is read');
  for(const make of VERBS) {
    const args=make(f),r=run(f,[...args,'--json']);
    assert.equal(r.status,0,r.text);
    assert.deepEqual(r.out.result.warnings,[w],args.join(' '));
    assert.equal(r.stderr,`${w}\n`,args.join(' '));
  }
  assert.ok(run(f,['claims','--about','system/okf','--json']).out.result.claims.some(c=>c.path===UNSTAMPED),'claims lists it');
  const text=run(f,['claims','--about','system/okf']);
  assert.equal(text.status,0,text.text);assert.equal(text.stderr,`${w}\n`);assert.doesNotMatch(text.stdout,/W_ID_MISSING/);
  const bases=run(f,['bases','--json']);
  assert.equal(bases.status,0,bases.text);
  const [row]=bases.out.result.bases;
  assert.deepEqual([row.validated,row.layout,row.warnings,bases.out.result.warnings],[{ok:true},'subjects',[w],[w]]);
  const shown=run(f,['bases']);
  assert.equal(shown.status,0,shown.text);
  assert.ok(shown.stdout.includes(`; valid OKF base, subject layout (2 subjects), with warnings:\n  ${w}\n  owns: -; reads: -`),shown.stdout);
  assert.doesNotMatch(shown.stdout,/INVALID/);
});

test('W_ID_MISSING: a validation cached by 6.0.0/6.0.1 (version 3, invalid) is judged again; spawn, the verbs and `bases` agree on one commit',t=>{
  const f=deployment(t),at=unstampedCommit(f),w=idWarning(at);
  assert.equal(run(f,['bases','--json']).status,0);
  const dir=fs.readdirSync(join(f.stateDir,'cache')).map(n=>join(f.stateDir,'cache',n,'okf-validation')).find(d=>fs.existsSync(d));
  const [file]=fs.readdirSync(dir),cached=JSON.parse(fs.readFileSync(join(dir,file),'utf8'));
  assert.deepEqual([cached.version,cached.ok,cached.unstamped],[4,true,1]);
  // What 6.0.1 cached for this commit: invalid, version 3.
  json(join(dir,file),{version:3,ok:false,error:{code:'E_VALIDATION',message:MISSING_ID},commit:cached.commit,root:cached.root,at:cached.at});
  const spawned=hook(f,'spawn');
  assert.equal(spawned.status,0,spawned.text);
  const seen=[spawned.out.brief.split('\n').at(-1),run(f,['bases','--json']).out.result.bases[0].warnings?.[0],...VERBS.map(make=>run(f,[...make(f),'--json']).out.result.warnings?.[0])];
  assert.deepEqual(seen,Array(seen.length).fill(w),'the three surfaces agree');
});

test('both tolerated kinds on one base: every reader warns W_INDEX_STALE then W_ID_MISSING, `bases` included; any other error still refuses spawn and reads INVALID in `bases`',t=>{
  const f=deployment(t);
  unstampedCommit(f);
  for(const ref of ['system/okf','workstream/knowledge']) edit(join(f.repo,`subjects/${ref}/index.md`),'## Decision','## Roadmap');
  f.git('add','-A');f.git('commit','-q','-m','older views');
  const head=f.git('rev-parse','HEAD').slice(0,12),both=[`W_INDEX_STALE: 2 generated files stale at project@${head}; the maintainer regenerates (okf-reindex.mjs)`,idWarning(head)];
  const spawned=hook(f,'spawn');
  assert.equal(spawned.status,0,spawned.text);
  assert.ok(spawned.out.brief.endsWith(`\n${both.join('\n')}`),spawned.out.brief);
  assert.equal(spawned.out.warning,`oats-okf: ${both.join('; ')}`);
  for(const make of VERBS) assert.deepEqual(run(f,[...make(f),'--json']).out.result.warnings,both,make(f).join(' '));
  const bases=run(f,['bases','--json']);
  assert.deepEqual([bases.out.result.bases[0].validated,bases.out.result.bases[0].warnings,bases.out.result.warnings],[{ok:true},both,both]);
  // Another error beside the tolerated ones: a claim about a subject with no file.
  write(join(f.repo,'claims/insights/stray.md'),'---\ntype: Insight\ntitle: Stray\ndescription: x\nabout: [system/nope]\nid: ins-0000000000ff\n---\n');
  f.git('add','-A');f.git('commit','-q','-m','a stray claim');
  // `bases --fresh` fetches the new commit; spawn then reads it from the host cache.
  const invalid=run(f,['bases','--fresh','--json']);
  assert.deepEqual([invalid.out.result.bases[0].validated.ok,invalid.out.result.bases[0].warnings,invalid.out.result.warnings],[false,undefined,undefined]);
  assert.match(run(f,['bases']).stdout,/INVALID: .*stray\.md: about names/);
  const refusedSpawn=hook(f,'spawn');
  assert.notEqual(refusedSpawn.status,0,refusedSpawn.text);
  assert.match(refusedSpawn.out.warning,/^oats-okf E_VALIDATION: base "project" at project@[0-9a-f]{12}: claims\/insights\/stray\.md: about names "system\/nope"/);
  assert.doesNotMatch(refusedSpawn.out.warning,/missing 'id'|generated index is stale/,'only the findings that refuse are named');
});

test('W_ID_MISSING on a directory base: the reader counts claims/ concepts without id; an old-node concept without id is not counted',t=>{
  const dir=bridged(t);
  write(join(dir,UNSTAMPED),'---\ntype: Insight\ntitle: One\ndescription: x\nabout: [system/okf]\n---\n');
  write(join(dir,'claims/decisions/two.md'),'---\ntype: Decision\ntitle: Two\ndescription: x\nabout: [system/okf]\n---\n');
  edit(join(dir,'peer/lesson.md'),'id: ins-000000000002\n','');reindex(dir);
  const v=validateBase(dir,{id:'base-1',kind:'directory'},{reader:true});
  assert.deepEqual([v.unstamped,v.stale],[2,0]);
  assert.throws(()=>validateBase(dir,{id:'base-1',kind:'directory'}),e=>e.code==='E_VALIDATION');
});

test('writers stay strict: a migration that would leave a subject index stale is refused before the accepted base is touched',t=>{
  const dir=tmp(t,'okf6-migrate-'),basePath=join(dir,'base');writePlainBase(basePath);bridge(basePath);
  fs.rmSync(join(basePath,'expert/decision.md'));fs.writeFileSync(join(basePath,'expert/index.md'),'# expert\n');reindex(basePath);
  assert.equal(validate(basePath,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
  const legacy=join(dir,'legacy');
  write(join(legacy,'index.md'),'# Migrated knowledge\n\n* [Migrated decision](migrated.md) - A migrated decision.\n');
  write(join(legacy,'migrated.md'),'---\ntype: Decision\ntitle: Migrated decision\ndescription: A migrated decision.\nabout: [system/okf]\nid: dec-00000000000f\n---\n\n# Migrated decision\n');
  const before=fs.readFileSync(join(basePath,'subjects/system/okf/index.md'),'utf8');
  assert.throws(()=>migrate({bases:{kb:{id:'base-1',kind:'directory',path:basePath}},stateDir:join(dir,'state')},{legacy,alias:'kb',node:'expert',output:join(dir,'stage')}),
    e=>e.code==='E_VALIDATION' && /subjects\/system\/okf\/index\.md: generated index is stale/.test(e.message));
  assert.equal(fs.existsSync(join(basePath,'expert/migrated.md')),false,'nothing accepted');
  assert.equal(fs.readFileSync(join(basePath,'subjects/system/okf/index.md'),'utf8'),before);
});

test('migrate --cutover names the version for a version-2 soul (E_MIGRATION, nothing changed); a version-1 owner mismatch is still E_OWNER',t=>{
  const dir=tmp(t,'okf6-cutover-'),basePath=join(dir,'base');writePlainBase(basePath);
  fs.rmSync(join(basePath,'expert/decision.md'));fs.writeFileSync(join(basePath,'expert/index.md'),'# expert\n');
  const soul=join(dir,'soul'),legacy=join(soul,'knowledge');
  write(join(legacy,'index.md'),'# Migrated knowledge\n\n* [Migrated decision](migrated.md) - A migrated decision.\n');
  write(join(legacy,'migrated.md'),'---\ntype: Decision\ntitle: Migrated decision\ndescription: A migrated decision.\n---\n\n# Migrated decision\n');
  const staged=migrate({bases:{kb:{id:'base-1',kind:'directory',path:basePath}},stateDir:join(dir,'state')},{legacy,alias:'kb',node:'expert',output:join(dir,'stage')});
  assert.equal(deliverMigration(staged.migration).status,'accepted');
  const decl=join(soul,'okf.json'),v2=JSON.stringify({version:2,subjects:['system/okf']})+'\n';
  fs.writeFileSync(decl,v2);
  assert.throws(()=>cutoverMigration(staged.migration,soul),e=>e.code==='E_MIGRATION' && e.message===`${decl} is version 2 (subjects): a version-2 soul has no owner, owns or reads, so the cutover has nowhere to add kb/expert. Nothing was changed. To finish the cutover, replace it with a version-1 declaration ({"version":1,"owner":"owner-1","owns":[],"reads":[]}) and rerun this command, then put the version-2 declaration back (a version-2 soul reads its subjects, not the node)`,'names the version, not E_OWNER');
  assert.equal(fs.readFileSync(decl,'utf8'),v2);assert.ok(fs.existsSync(join(legacy,'migrated.md')),'the legacy bundle stays');
  assert.equal(fs.existsSync(join(soul,'.okf-cutover.json')),false);assert.equal(JSON.parse(fs.readFileSync(staged.migration,'utf8')).cutover,undefined);
  fs.writeFileSync(decl,JSON.stringify({version:1,owner:'someone-else',owns:[],reads:[]}));
  assert.throws(()=>cutoverMigration(staged.migration,soul),e=>e.code==='E_OWNER' && e.message==='existing soul declaration owner differs');
});

test('spawn: a version-2 soul\'s brief lists one line per subject with counts from its generated index',t=>{
  const f=deployment(t),r=hook(f,'spawn');
  assert.equal(r.status,0,r.text);
  assert.equal(r.out.warning,undefined,r.text);
  assert.ok(r.out.brief.includes('`oats okf index` for your subjects:\n- system/okf — The knowledge provider package. (1 decision, 1 insight)\n- workstream/knowledge — How OATS keeps and proposes knowledge. (1 decision, 1 insight)\nthen `oats okf subject KIND/SLUG`, `oats okf claims --about KIND/SLUG`'),r.out.brief);
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

test('spawn: a host that cached the plain base spawns a version-2 soul once the base is bridged upstream (the due cache is refreshed)',t=>{
  const f=deployment(t,{plain:true,decl:{version:1,owner:'owner-1',owns:['project/expert'],reads:['project/peer']}});
  assert.equal(hook(f,'spawn').status,0,'the plain base is cached');
  bridge(f.repo);f.git('add','-A');f.git('commit','-q','-m','bridge');
  json(join(f.soul,'okf.json'),{version:2,subjects:['system/okf']});
  const r=run(f,['spawn'],{extra:{OATS_EVENT:'spawn',OATS_SETTINGS:JSON.stringify({'bindings-file':f.bindingsFile,'consult-max-age':0})}});
  assert.equal(r.status,0,r.text);
  assert.match(r.out.brief,/- system\/okf — The knowledge provider package\. \(1 decision, 1 insight\)/);
});

/** A second bridged base whose subjects are system/other and workstream/other. */
function otherBase(b,id) {
  writePlainBase(b,{id});bridge(b);
  for(const n of fs.readdirSync(b,{recursive:true}).filter(n=>n.endsWith('.md'))) fs.writeFileSync(join(b,n),fs.readFileSync(join(b,n),'utf8').replaceAll('system/okf','system/other').replaceAll('workstream/knowledge','workstream/other'));
  fs.renameSync(join(b,'subjects/system/okf.md'),join(b,'subjects/system/other.md'));fs.renameSync(join(b,'subjects/workstream/knowledge.md'),join(b,'subjects/workstream/other.md'));
  fs.rmSync(join(b,'subjects/system/okf'),{recursive:true});fs.rmSync(join(b,'subjects/workstream/knowledge'),{recursive:true});
  reindex(b);assert.equal(validate(b,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
  return b;
}
test('a version-2 soul whose subjects live in two bridged bases: spawn, the default index, subject and claims read each from its own base',t=>{
  const dir=tmp(t,'okf6-two-bases-'),a=join(dir,'a'),b=join(dir,'b'),bindingsFile=join(dir,'deployment','okf-bindings.json'),soul=join(dir,'soul'),home=join(dir,'home'),user=join(dir,'user');
  writePlainBase(a,{id:'base-a'});bridge(a);otherBase(b,'base-b');
  json(bindingsFile,{version:1,stateDir:join(dir,'state'),bases:{a:{id:'base-a',kind:'directory',path:a},b:{id:'base-b',kind:'directory',path:b}}});
  json(join(soul,'okf.json'),{version:2,subjects:['system/okf','workstream/other']});
  json(join(home,'instance.json'),{name:'worker-1',kind:'agent'});fs.mkdirSync(user);
  const f={dir,soul,home,user,bindingsFile};
  const spawned=hook(f,'spawn');
  assert.equal(spawned.status,0,spawned.text);
  assert.match(spawned.out.brief,/- system\/okf — The knowledge provider package\. \(1 decision, 1 insight\)\n- workstream\/other — How OATS keeps and proposes knowledge\. \(1 decision, 1 insight\)/);
  const index=run(f,['index','--json']);
  assert.equal(index.status,0,index.text);
  assert.deepEqual(index.out.result.indexes.map(x=>[x.base,x.subject]),[['a','system/okf'],['b','workstream/other']]);
  assert.equal(run(f,['subject','workstream/other','--json']).out.result.base,'b');
  assert.deepEqual(run(f,['claims','--about','system/okf','--json']).out.result.claims.map(c=>c.path),['expert/decision.md','claims/insights/consult-reads-one-blob.md']);
  // The same ref in two bases is ambiguous; --base names one; a base-wide verb needs --base.
  json(join(soul,'okf.json'),{version:2,subjects:['system/okf']});
  assert.equal(run(f,['subject','system/okf','--base','a','--json']).out.result.base,'a');
  write(join(b,'subjects/system/okf.md'),fs.readFileSync(join(a,'subjects/system/okf.md'),'utf8'));
  assert.match(run(f,['subject','system/okf','--json']).out.error.message,/^subject system\/okf is in several bases \(a, b\); pass --base ALIAS$/);
  assert.match(run(f,['subjects','--json']).out.error.message,/several bases have the subject layout \(a, b\); pass --base ALIAS/);
});

test('spawn: a version-2 soul resolving across two cached Git bases fetches neither, even with every cache due',t=>{
  const f=deployment(t),b=otherBase(join(f.dir,'repo-b'),'base-b');
  spawnSync('git',['init','-q','-b','main',b],{env:gitEnv(f.user)});
  for(const args of [['add','-A'],['commit','-q','-m','accepted']]) spawnSync('git',['-C',b,'-c','user.name=t','-c','user.email=t@example.invalid',...args],{env:gitEnv(f.user)});
  const doc=JSON.parse(fs.readFileSync(f.bindingsFile,'utf8'));
  doc.bases.other={id:'base-b',kind:'git',repository:b,root:'.',acceptedBranch:'main',pr:{repository:'example/other'}};json(f.bindingsFile,doc);
  json(join(f.soul,'okf.json'),{version:2,subjects:['system/okf','workstream/other']});
  assert.equal(hook(f,'spawn').status,0,'both caches are cloned and validated');
  const stamps=()=>['base-1','base-b'].map(id=>JSON.parse(fs.readFileSync(join(f.stateDir,'cache',`${id}.git`,'okf-consult.json'),'utf8')).fetchedAt);
  const before=stamps();
  const r=run(f,['spawn'],{extra:{OATS_EVENT:'spawn',OATS_SETTINGS:JSON.stringify({'bindings-file':f.bindingsFile,'consult-max-age':0})}});
  assert.equal(r.status,0,r.text);
  assert.match(r.out.brief,/- system\/okf — .*\n- workstream\/other — /);
  assert.deepEqual(stamps(),before,'a declaration that resolves against the cached commits refreshes nothing');
});

test('a malformed flow list cannot stall validation (linear parser and scalar fallback), on a plain base as on a bridged one',t=>{
  for(const line of ['tags: ["foo #bar",'+' '.repeat(200000)+'""x]','tags: [a,'+' '.repeat(200000)+'""x]','tags: ['+' '.repeat(200000)]) for(const plain of [true,false]) {
    const dir=join(tmp(t,'okf6-slow-'),'base');writePlainBase(dir);if(!plain) bridge(dir);
    edit(join(dir,'peer/lesson.md'),'description: A fake',`${line}\ndescription: A fake`);
    const started=Date.now(),r=spawnSync(process.execPath,[VALIDATE,dir,'--strict','--json'],{encoding:'utf8',timeout:20000});
    assert.equal(r.error,undefined,`${plain?'plain':'bridged'}: ${r.error}`);
    assert.ok(Date.now()-started<10000,`${plain?'plain':'bridged'} took ${Date.now()-started} ms`);
    const out=JSON.parse(r.stdout);
    if(plain) assert.deepEqual(out.errors,[]); else assert.ok(out.errors.includes("peer/lesson.md: malformed flow list in 'tags' (flat [a, \"b\"] items only)"));
  }
});

test('the linear key/value reader matches exactly what 5.8\'s key regex matched, and a long whitespace run before a line terminator cannot stall the regenerator, the validator or verdicts --check',t=>{
  const old=/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/,same=l=>{const a=l.match(old),b=keyValue(l);return (!a&&!b)||(!!a&&!!b&&a[1]===b[1]&&a[2]===b[2]);};
  for(const l of ['tags: x','tags:x','tags:','tags:   ','tags: \r','tags: x\r','tags:\u2028 x','tags: x\u2028y','tags: \u00a0x','9k: x','a b: x','_k-1: [a, b] # c','tags: \t\u2029','tags: x \u2029']) assert.ok(same(l),JSON.stringify(l));
  const evil='tags: '+' '.repeat(200000)+'x\u2028y';
  let started=Date.now();assert.equal(keyValue(evil),null);parseFrontmatter(`---\n${evil}\n---\n`);assert.ok(Date.now()-started<1000,`parse took ${Date.now()-started} ms`);
  const f=deployment(t);
  edit(join(f.repo,'claims/insights/consult-reads-one-blob.md'),'about: [system/okf]\n',`about: [system/okf]\n${evil}\n`);
  for(const args of [[REINDEX,f.repo,'--check'],[VALIDATE,f.repo,'--strict','--json']]) {
    started=Date.now();const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20000});
    assert.equal(r.error,undefined,String(r.error));assert.ok(Date.now()-started<10000,`${args[0]} took ${Date.now()-started} ms`);
  }
  const claim=join(f.dir,'claim.md');write(claim,`---\ntype: Decision\ntitle: Something new\n${evil}\ndescription: x\nabout: [system/okf]\n---\n`);
  started=Date.now();const v=run(f,['verdicts','--check',claim,'--json']);
  assert.ok(Date.now()-started<10000,`verdicts --check took ${Date.now()-started} ms`);assert.equal(v.out.error.code,'E_USAGE',v.text.slice(0,300));
});

test('the shipped okf-soul schema (both copies) accepts exactly the declarations validateDeclaration accepts, the staged version 2 included',()=>{
  const schema=JSON.parse(fs.readFileSync(join(ROOT,'oats-package/capabilities/oats-okf/schemas/okf-soul.schema.json'),'utf8'));
  assert.deepEqual(JSON.parse(fs.readFileSync(join(ROOT,'schemas/okf-soul.schema.json'),'utf8')),schema);
  // the subset these schemas use: oneOf, type, const, required, properties, additionalProperties, items, pattern, minItems, uniqueItems
  const ok=(v,sc)=>{
    if(sc.oneOf) return sc.oneOf.filter(a=>ok(v,a)).length===1;
    if('const' in sc && v!==sc.const) return false;
    const type=Array.isArray(v)?'array':v===null?'null':typeof v;
    if(sc.type && type!==sc.type) return false;
    if(sc.pattern && !new RegExp(sc.pattern).test(v)) return false;
    if(type==='array') { if(sc.minItems!==undefined && v.length<sc.minItems) return false; if(sc.uniqueItems && new Set(v.map(x=>JSON.stringify(x))).size!==v.length) return false; if(sc.items && !v.every(x=>ok(x,sc.items))) return false; }
    if(type==='object') {
      if((sc.required||[]).some(k=>!Object.hasOwn(v,k))) return false;
      for(const [k,x] of Object.entries(v)) { if(sc.properties && Object.hasOwn(sc.properties,k)) { if(!ok(x,sc.properties[k])) return false; } else if(sc.additionalProperties===false) return false; }
    }
    return true;
  };
  const runtime=d=>{try{validateDeclaration(d);return true;}catch(e){if(/^E_/.test(e.code||''))return false;throw e;}};
  const declarations=[
    JSON.parse(fs.readFileSync(join(ROOT,'souls/oats-okf-expert/okf.json.v2'),'utf8')),JSON.parse(fs.readFileSync(join(ROOT,'souls/oats-okf-expert/okf.json'),'utf8')),
    {version:2,subjects:['system/okf','workstream/knowledge','project/trial']},{version:2,subjects:['system/okf'],owns:[]},{version:2,subjects:[]},{version:2},{version:2,subjects:['okf']},
    {version:2,subjects:['team/x']},{version:2,subjects:['system/A']},{version:2,subjects:['system/a','system/a']},{version:2,subjects:[1]},{version:2,subjects:['system/okf'],owner:'o'},{version:3},
    {version:1,owner:'o',owns:['b/n'],reads:[]},{version:1,owner:'o',owns:[],reads:[],subjects:['system/okf']},{version:1,owns:[],reads:[]},
  ];
  assert.ok(runtime(declarations[0]) && runtime(declarations[1]));
  for(const d of declarations) assert.equal(ok(d,schema),runtime(d),JSON.stringify(d));
});

test('the linear scalar reader gives exactly 5.8\'s value (its comment regex), CR and Unicode line terminators included',()=>{
  const old=v=>v.replace(/\s+#.*$/,'').replace(/^["']|["']$/g,'').trim();
  for(const v of ['plain # c','a#b','"q" # c','x  #  y # z','#lead',' #lead','v # c\r','v # c\rmore','v\r # c','  ','a\t# t','[WIP] t # c','"a # b"','x # c\u2028y','x\u00a0# nb','',"'s' #"]) assert.equal(scalarValue(v),old(v),JSON.stringify(v));
  const started=Date.now();scalarValue('x'+' '.repeat(200000)+'y');assert.ok(Date.now()-started<1000);
});

test('a file name holding a backslash is refused before any read: no frontmatter from outside the base reaches a generated index',t=>{
  for(const via of ['cli','propose']) {
    const dir=bridged(t),outside=join(dirname(dir),'private.md');
    fs.writeFileSync(outside,'---\ntype: Decision\ntitle: PRIVATE OUTSIDE\ndescription: PRIVATE OUTSIDE\nabout: [system/okf]\nid: dec-private\n---\n');
    write(join(dir,'claims','x\\..\\..\\private.md'),'---\ntype: Decision\ntitle: Harmless\ndescription: Harmless.\nabout: [system/okf]\nid: dec-harmless\n---\n');
    const view=fs.readFileSync(join(dir,'subjects/system/okf/index.md'),'utf8');
    if(via==='cli') { const r=spawnSync(process.execPath,[REINDEX,dir],{encoding:'utf8'});assert.equal(r.status,2,r.stdout+r.stderr);assert.match(r.stderr,/E_PATH: .*a name with a backslash/); }
    else assert.throws(()=>prepareSubjectProposal({root:dir,decl:V2,ownedNodes:{},changes:[{path:'claims/x\\..\\..\\private.md',status:'A'}]}),e=>e.code==='E_PATH');
    assert.equal(fs.readFileSync(join(dir,'subjects/system/okf/index.md'),'utf8'),view);
    assert.doesNotMatch(fs.readdirSync(dir,{recursive:true}).filter(n=>n.endsWith('.md')).map(n=>fs.readFileSync(join(dir,n),'utf8')).join(''),/PRIVATE OUTSIDE/);
  }
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

test('a version-2 soul\'s project/<slug> is a subject even when a bound base is aliased `project` (a version-1 soul keeps alias/node)',t=>{
  const f=deployment(t,{decl:{version:2,subjects:['project/trial']}});
  write(join(f.repo,'subjects/project/trial.md'),'---\ntype: Project\ntitle: Trial\ndescription: A trial.\nstatus: open\n---\n\n# Trial\n');
  reindex(f.repo);assert.equal(validate(f.repo,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
  f.git('add','-A');f.git('commit','-q','-m','trial');
  for(const args of [['index','project/trial'],['index','project/trial','--base','project']]) {
    const r=run(f,[...args,'--json']);
    assert.equal(r.status,0,r.text);assert.equal(r.out.result.indexes[0].path,'subjects/project/trial/index.md');
  }
  json(join(f.soul,'okf.json'),{version:1,owner:'owner-1',owns:['project/expert'],reads:['project/peer']});
  assert.equal(run(f,['index','project/expert','--json']).out.result.indexes[0].path,'expert/index.md','version 1: project/expert is the node');
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
  assert.deepEqual(all.out.result.claims.map(c=>[c.type,c.kind,c.path]),[['Decision',null,'expert/decision.md'],['Insight','lesson','peer/lesson.md']]);
  assert.deepEqual(run(f,['claims','--about','workstream/knowledge','--type','insight','--kind','lesson','--json']).out.result.claims.map(c=>c.path),['peer/lesson.md']);
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

test('`oats okf verdicts --check` refuses when the committed verdict index is missing (not "no verdicts"); a present index with no verdicts still answers',t=>{
  const f=deployment(t),claim=join(f.dir,'claim.md');
  write(claim,`---\ntype: Decision\ntitle: Something new\ndescription: x\nabout: [system/okf]\nid: ${REJECTED.id}\n---\n`);
  fs.rmSync(join(f.repo,'verdicts/index.md'));f.git('add','-A');f.git('commit','-q','-m','no verdict index');
  const missing=run(f,['verdicts','--check',claim,'--fresh','--json']);
  assert.equal(missing.status,1);assert.equal(missing.out.error.code,'E_NOT_FOUND');assert.match(missing.out.error.message,/no generated verdict index .*okf-reindex\.mjs/);
  fs.rmSync(join(f.repo,`verdicts/${REJECTED.id}.md`));reindex(f.repo);f.git('add','-A');f.git('commit','-q','-m','no verdicts');
  const none=run(f,['verdicts','--check',claim,'--fresh','--json']);
  assert.equal(none.status,0,none.text.slice(0,300));assert.equal(none.out.result.identity,null);assert.equal(none.out.result.refusal,null);
});

test('a committed subject index with very many sections is read in linear time (parseView; the claims CLI)',t=>{
  const f=deployment(t),view=join(f.repo,'subjects/system/okf/index.md');
  const text=fs.readFileSync(view,'utf8'),parts=[text];
  for(let i=0;i<100000;i++) parts.push(`## Type-${i}\n\n* [Claim ${i}](/claims/c${i}.md) - Description ${i}\n`);
  fs.writeFileSync(view,parts.join('\n'));f.git('add','-A');f.git('commit','-q','-m','many sections');
  let started=Date.now();const parsed=parseView(fs.readFileSync(view,'utf8'));
  assert.ok(Date.now()-started<2000,`parseView took ${Date.now()-started} ms`);assert.ok(parsed.sections.length>100000);
  // filtered so the answer stays small; the whole index is still parsed
  // one long type or kind heading over many entries: the section is looked up per heading, not per entry
  for(const [heading,label] of [[`## ${'T'.repeat(1000000)}`,'long type'],[`## Decision\n\n### ${'k'.repeat(1000000)}`,'long kind']]) {
    const lines=[heading,''];for(let i=0;i<20000;i++) lines.push(`* [C${i}](/claims/c${i}.md) - D`);
    started=Date.now();const v=parseView(lines.join('\n'));
    assert.ok(Date.now()-started<2000,`${label}: parseView took ${Date.now()-started} ms`);
    assert.equal(v.sections.length,1);assert.equal(v.sections[0].entries.length,20000);
  }
  const merged=parseView('## A\n* [1](/claims/1.md)\n### k\n* [2](/claims/2.md)\n## B\n* [3](/claims/3.md)\n## A\n* [4](/claims/4.md)\n### k\n* [5](/claims/5.md)');
  assert.deepEqual(merged.sections.map(x=>[x.type,x.kind,x.entries.map(e=>e.title).join()]),[['A',null,'1,4'],['A','k','2,5'],['B',null,'3']]);
  fs.appendFileSync(view,`\n## ${'T'.repeat(1000000)}\n\n`+Array.from({length:20000},(_,i)=>`* [L${i}](/claims/l${i}.md) - D`).join('\n')+'\n');
  f.git('add','-A');f.git('commit','-q','-m','long heading');
  for(const args of [['claims','--about','system/okf','--type','Type-99999','--fresh','--json']]) {
    started=Date.now();const r=run(f,args);
    assert.equal(r.status,0,r.text.slice(0,300));assert.ok(Date.now()-started<15000,`${args[0]} took ${Date.now()-started} ms`);
  }
});

test('one long committed type over many kinds: `claims --type` compares the filter once per type, not per section',t=>{
  const f=deployment(t),view=join(f.repo,'subjects/system/okf/index.md');
  const lines=[`## ${'T'.repeat(2000000)}`,''];for(let i=0;i<50000;i++) lines.push(`### k${i}`,'',`* [C${i}](/claims/c${i}.md) - D`,'');
  fs.appendFileSync(view,'\n'+lines.join('\n'));f.git('add','-A');f.git('commit','-q','-m','long type, many kinds');
  const started=Date.now(),r=run(f,['claims','--about','system/okf','--type','Decision','--kind','nope','--fresh','--json']);
  assert.equal(r.status,0,r.text.slice(0,300));assert.ok(Date.now()-started<8000,`claims took ${Date.now()-started} ms`);
  const s2=run(f,['subject','system/okf','--fresh','--json']);
  assert.equal(s2.status,0,s2.text.slice(0,300));
  assert.equal(s2.out.result.counts[`${'T'.repeat(200)}…`],50000);
});

test('text from a base or an index is keyed by textKey: many long distinct types, kinds or ids stay linear (V8 hashes a long string by its length)',()=>{
  assert.equal(textKey('Decision'),'=Decision');assert.equal(textKey('x'.repeat(16000)),'='+'x'.repeat(16000));
  assert.match(textKey('x'.repeat(16001)),/^#[0-9a-f]{64}$/);assert.notEqual(textKey('x'.repeat(16001)),textKey('y'.repeat(16001)));
  // the two forms never meet: no text keys like another text's digest
  const long='T'.repeat(16001);for(const forged of [textKey(long),textKey(long).slice(1),'\u0000sha256:'+textKey(long).slice(1)]) assert.notEqual(textKey(forged),textKey(long));
  const prefix='T'.repeat(17000),types=Array.from({length:2500},(_,i)=>`${prefix}${String(i).padStart(6,'0')}`);
  let started=Date.now();const v=parseView(['# S','',GENERATED_NOTE,'',...types.flatMap((ty,i)=>[`## ${ty}`,`### ${ty}`,`* [C${i}](/claims/c${i}.md)`])].join('\n'));
  assert.ok(Date.now()-started<3000,`parseView took ${Date.now()-started} ms`);assert.equal(v.sections.length,2500);
  const concepts=new Map([['subjects/system/okf.md',{type:'System',title:'S'}],...types.map((ty,i)=>[`claims/c${i}.md`,{type:ty,kind:ty,title:`C${i}`,about:['system/okf',...(i<5?[prefix+'x'.repeat(7),prefix+'y'.repeat(7)]:[])]}])]);
  started=Date.now();const out=generate(concepts);
  assert.ok(Date.now()-started<3000,`generate took ${Date.now()-started} ms`);
  assert.equal(parseView(out.get('subjects/system/okf/index.md')).sections.length,2500);
});

test('a short type spelled like a long type\'s digest is a different type for `claims --type`',t=>{
  const f=deployment(t),long='T'.repeat(16001);
  const forged=parseView(['# S','',GENERATED_NOTE,'Subject file: [S](/subjects/system/okf.md)','',`## ${long}`,'* [A](/claims/a.md)',`## ${textKey(long)}`,'* [B](/claims/b.md)'].join('\n'));
  assert.deepEqual(forged.sections.map(x=>x.entries.map(e=>e.title).join()),['A','B']);
  const view=join(f.repo,'subjects/system/okf/index.md');
  fs.appendFileSync(view,`\n## ${long}\n\n* [A](/claims/a.md)\n\n## ${textKey(long)}\n\n* [B](/claims/b.md)\n`);
  f.git('add','-A');f.git('commit','-q','-m','forged key');
  const r=run(f,['claims','--about','system/okf','--type',textKey(long),'--fresh','--json']);
  assert.deepEqual(r.out.result.claims.map(c=>c.title),['B'],r.text.slice(0,300));
});

test('a subject description that starts with # or reads like the generated note survives the round trip (brief, subject)',t=>{
  for(const description of ['# OATS knowledge',GENERATED_NOTE,'Subject file: x']) {
    const dir=bridged(t);
    edit(join(dir,'subjects/system/okf.md'),'description: The knowledge provider package.',`description: ${JSON.stringify(description)}`);
    reindex(dir);assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
    const v=parseView(fs.readFileSync(join(dir,'subjects/system/okf/index.md'),'utf8'));
    assert.equal(v.title,'oats-okf');assert.equal(v.description,description);
    assert.deepEqual(Object.fromEntries(counts(v)),SUBJECT_COUNTS['system/okf']);
  }
  const bare=bridged(t);
  edit(join(bare,'subjects/system/okf.md'),'description: The knowledge provider package.\n','');
  reindex(bare);const v=parseView(fs.readFileSync(join(bare,'subjects/system/okf/index.md'),'utf8'));
  assert.equal(v.description,'');assert.ok(v.sections.length>0);
});

test('links in frontmatter prose do not move into generated indexes: a relative link in a description, type or title stays text, and both validators pass',t=>{
  const dir=join(tmp(t,'okf6-links-'),'base');writePlainBase(dir);
  edit(join(dir,'expert/decision.md'),'description: The owner is pinned when the instance spawns.','description: See [the decision](decision.md) before spawning.');
  edit(join(dir,'expert/index.md'),'- The owner is pinned when the instance spawns.','- See [the decision](decision.md) before spawning.');
  assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0,'the plain base is valid');
  bridge(dir);
  edit(join(dir,'subjects/system/okf.md'),'description: The knowledge provider package.','description: Read [the guide](guide.md) first.');
  edit(join(dir,'claims/insights/consult-reads-one-blob.md'),'type: Insight','type: See [x](missing.md)');
  reindex(dir);
  const view=fs.readFileSync(join(dir,'subjects/system/okf/index.md'),'utf8');
  assert.ok(view.includes('See (the decision)(decision.md) before spawning.'),view);
  assert.ok(view.includes('Read (the guide)(guide.md) first.'));assert.ok(view.includes('## See (x)(missing.md)'));
  const old=join(dirname(dir),'okf-validate-5.8.0.mjs');
  fs.writeFileSync(old,spawnSync('git',['-C',ROOT,'show','v5.8.0:oats-package/capabilities/oats-okf/lib/okf-validate.mjs'],{encoding:'utf8'}).stdout);
  for(const validator of [undefined,old]) {
    const r=validate(dir,{validator,env:{OKF_STRICT_EXIT:'1'}});
    assert.equal(r.status,0,`${validator?'5.8':'6.0'}: ${r.text}`);assert.deepEqual([r.out.errors,r.out.warnings],[[],[]]);
  }
});

test('a title ending in backslashes stays a link label: generated labels escape \\ and parseView reads the title back',t=>{
  const dir=bridged(t);
  edit(join(dir,'expert/decision.md'),'title: Pin the owner at spawn','title: Match a final \\');
  edit(join(dir,'subjects/system/okf.md'),'title: oats-okf','title: okf \\ x\\');
  reindex(dir);assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
  const text=fs.readFileSync(join(dir,'subjects/system/okf/index.md'),'utf8');
  assert.ok(text.includes('* [Match a final \\\\](/expert/decision.md)'),text);
  assert.ok(text.includes('Subject file: [okf \\\\ x\\\\](/subjects/system/okf.md)'),text);
  const titles=parseView(text).sections.flatMap(x=>x.entries.map(e=>e.title));
  assert.ok(titles.includes('Match a final \\'),JSON.stringify(titles));
  // every label's closing bracket is unescaped: an even run of backslashes before it
  for(const m of text.matchAll(/\[([^\]]*)\]\(/g)) assert.equal((/\\*$/.exec(m[1])[0].length)%2,0,m[0]);
});

test('a claim type spelled like the membership heading stays a claim; members are the subject files under it',t=>{
  const dir=bridged(t);
  edit(join(dir,'claims/insights/consult-reads-one-blob.md'),'type: Insight','type: In this workstream');
  edit(join(dir,'claims/insights/consult-reads-one-blob.md'),'about: [system/okf]','about: [system/okf, workstream/knowledge]');
  reindex(dir);assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
  for(const ref of ['system/okf','workstream/knowledge']) {
    const v=parseView(fs.readFileSync(join(dir,`subjects/${ref}/index.md`),'utf8'));
    assert.deepEqual(v.sections.filter(x=>x.type==='In this workstream').flatMap(x=>x.entries.map(e=>e.path)),['claims/insights/consult-reads-one-blob.md'],ref);
    assert.ok(v.members.every(m=>m.path.startsWith('subjects/')),ref);
    if(ref==='workstream/knowledge') assert.deepEqual(v.members.map(m=>m.path),['subjects/system/okf.md']);
  }
});

test('`claims` cuts a long committed type or kind heading in each row (the filter still sees it whole), so a heading cannot multiply the answer',t=>{
  const f=deployment(t),view=join(f.repo,'subjects/system/okf/index.md'),type='T'.repeat(300),kind='k'.repeat(300);
  fs.appendFileSync(view,`\n## ${type}\n\n### ${kind}\n\n* [A](/claims/a.md) - x\n* [B](/claims/b.md) - y\n`);
  f.git('add','-A');f.git('commit','-q','-m','long headings');
  const r=run(f,['claims','--about','system/okf','--type',type,'--fresh','--json']);
  assert.equal(r.status,0,r.text.slice(0,300));
  assert.deepEqual(r.out.result.claims.map(c=>[c.type,c.kind,c.title]),[[`${'T'.repeat(200)}…`,`${'k'.repeat(200)}…`,'A'],[`${'T'.repeat(200)}…`,`${'k'.repeat(200)}…`,'B']]);
  assert.equal(r.out.result.type,type);
});

test('a claim type holding `; ` or `\\` round-trips through the verdict index: the exact-title lane still finds the verdict; an empty claim description too',t=>{
  for(const type of ['Decision; architecture','Odd\\; type\\']) {
    const f=deployment(t),vfile=join(f.repo,`verdicts/${REJECTED.id}.md`);
    edit(vfile,`claim-type: ${REJECTED.type}`,`claim-type: ${type}`);
    edit(vfile,`title-hash: ${titleHash(REJECTED.type,REJECTED.title)}`,`title-hash: ${titleHash(type,REJECTED.title)}`);
    edit(vfile,`claim-description: ${REJECTED.description}\n`,'');
    reindex(f.repo);assert.equal(validate(f.repo,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
    const row=parseVerdictsIndex(fs.readFileSync(join(f.repo,'verdicts/index.md'),'utf8'))[0];
    assert.deepEqual([row.verdict,row.claimType,row.titleHash,row.description],['rejected',type,titleHash(type,REJECTED.title),''],type);
    f.git('add','-A');f.git('commit','-q','-m','odd type');
    const claim=join(f.dir,'claim.md');write(claim,`---\ntype: ${type}\ntitle: ${REJECTED.title}\ndescription: x\nabout: [system/okf]\n---\n`);
    const r=run(f,['verdicts','--check',claim,'--fresh','--json']);
    assert.equal(r.status,0,r.text.slice(0,400));assert.deepEqual(r.out.result.candidates.map(c=>[c.id,c.claimType]),[[REJECTED.id,type]],type);
  }
});

test('the root index\'s Subjects section ignores a fenced example of its heading (``` and ~~~): the node list and the example stay',t=>{
  const dir=join(tmp(t,'okf6-fence-'),'base');writePlainBase(dir);
  const root=join(dir,'index.md'),original=fs.readFileSync(root,'utf8');
  const example='# Project knowledge\n\nHow a converted root looks:\n\n```md\n## Subjects\n\n* Subjects\n```\n\n~~~~\n## Subjects\n```\n## Other\n~~~~\n\n';
  fs.writeFileSync(root,original.replace('# Project knowledge\n\n',example));
  assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
  bridge(dir);
  const after=fs.readFileSync(root,'utf8');
  assert.ok(after.startsWith(example),after);
  for(const l of ['* [expert](expert/index.md) - The expert node.','* [peer](peer/index.md) - The peer node.','* [claims](claims/index.md)']) assert.ok(after.includes(l),l);
  assert.equal(after.split('\n').filter(l=>l==='## Subjects').length,3,'two fenced examples, one generated section');
  assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
  assert.equal(spawnSync(process.execPath,[REINDEX,dir,'--check'],{encoding:'utf8'}).status,0,'idempotent');
});

test('a root index ending in an unclosed fence (``` or ~~~): the Subjects section goes before it, regeneration is idempotent, the fence stays',t=>{
  for(const opener of ['```md','~~~~']) {
    const dir=join(tmp(t,'okf6-open-fence-'),'base');writePlainBase(dir);
    const root=join(dir,'index.md'),tail=`\nAn example:\n\n${opener}\n## Subjects\n\n* Subjects\n`;
    fs.appendFileSync(root,tail);
    assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0);
    bridge(dir);
    const once=fs.readFileSync(root,'utf8');
    assert.ok(once.includes(`${opener}\n## Subjects\n\n* Subjects\n`),once);
    assert.ok(once.indexOf('* [Subjects](subjects/index.md)')<once.indexOf(opener),'the generated section precedes the open fence');
    for(const l of ['* [expert](expert/index.md) - The expert node.','* [peer](peer/index.md) - The peer node.']) assert.ok(once.includes(l),l);
    assert.equal(spawnSync(process.execPath,[REINDEX,dir,'--check'],{encoding:'utf8'}).status,0,`${opener}: --check after one run`);
    reindex(dir);assert.equal(fs.readFileSync(root,'utf8'),once,`${opener}: a second run changes nothing`);
    assert.equal(validate(dir,{env:{OKF_STRICT_EXIT:'1'}}).status,0,opener);
  }
  // a fence right after an existing section is the author's text: kept, not taken into the section
  const kept=withSubjectsSection('# R\n\n## Subjects\n\nold text\n\n```\ncode\n```\n');
  assert.ok(kept.endsWith('```\ncode\n```\n'),kept);assert.equal(withSubjectsSection(kept),kept);
});

test('long runs of blank lines in the root index, around its Subjects section, keep regeneration and strict validation linear',t=>{
  const dir=bridged(t),root=join(dir,'index.md'),blank='\n'.repeat(200000);
  const text=fs.readFileSync(root,'utf8').replace('# Project knowledge\n',`# Project knowledge\n${blank}Text after blank lines.\n`).replace('## Subjects\n',`${blank}## Subjects\n`)+`${blank}## After\n${blank}Trailing text.\n${blank}`;
  fs.writeFileSync(root,text);
  for(const args of [[REINDEX,dir],[REINDEX,dir,'--check'],[VALIDATE,dir,'--strict','--json']]) {
    const started=Date.now(),r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20000});
    assert.equal(r.error,undefined,`${args.slice(1).join(' ')}: ${r.error}`);assert.ok(Date.now()-started<6000,`${args.slice(1).join(' ')} took ${Date.now()-started} ms`);
    assert.equal(r.status,0,`${args.slice(1).join(' ')}: ${r.stdout.slice(0,300)}${r.stderr.slice(0,300)}`);
  }
  assert.ok(fs.readFileSync(root,'utf8').includes('Trailing text.'));
  const started=Date.now();withSubjectsSection('# Root\n'+blank+'Text\n## Subjects\n\nx\n'+blank+'## After\n'+blank+'tail\n');
  assert.ok(Date.now()-started<2000);
});

test('a long fence run before CR, U+2028 or U+2029 in the root index keeps regeneration and strict validation linear (``` and ~~~)',t=>{
  for(const [ch,end] of [['`','\u2028'],['`','\u2029'],['`','\r'],['~','\u2028'],['~','\r']]) {
    const dir=bridged(t),root=join(dir,'index.md');
    fs.appendFileSync(root,`\n${ch.repeat(400000)}${end}x\n`);
    for(const args of [[REINDEX,dir],[REINDEX,dir,'--check'],[VALIDATE,dir,'--strict','--json']]) {
      const started=Date.now(),r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:20000});
      assert.equal(r.error,undefined,`${JSON.stringify(end)} ${args.slice(1).join(' ')}: ${r.error}`);
      assert.ok(Date.now()-started<6000,`${JSON.stringify(end)} ${args.slice(1).join(' ')} took ${Date.now()-started} ms`);
      assert.equal(r.status,0,`${JSON.stringify(end)} ${args.slice(1).join(' ')}: ${r.stdout.slice(0,300)}${r.stderr.slice(0,300)}`);
    }
  }
});

test('the standalone validator refuses an unsafe tree on a bridged base before opening any file (a linked generated-view directory, a .md FIFO, a .md link to an outside FIFO or file, a hardlinked .md); a plain base keeps 5.8\'s walk',t=>{
  const dir=bridged(t),outside=join(dirname(dir),'outside-okf');
  fs.renameSync(join(dir,'subjects/system/okf'),outside);
  fs.rmSync(join(outside,'index.md'));assert.equal(spawnSync('mkfifo',[join(outside,'index.md')]).status,0);
  fs.symlinkSync(outside,join(dir,'subjects/system/okf'));
  const started=Date.now(),r=spawnSync(process.execPath,[VALIDATE,dir,'--strict','--json'],{encoding:'utf8',timeout:20000});
  assert.equal(r.error,undefined,String(r.error));assert.ok(Date.now()-started<6000);
  assert.equal(r.status,1);assert.ok(JSON.parse(r.stdout).errors.some(e=>/^subjects\/system\/okf: a symlink; generated indexes are read and written only/.test(e)),r.stdout);
  // an unsafe leaf, refused before any file is opened: nothing outside is read (no marker reaches the output), nothing blocks
  const LEAVES=[
    ['a .md FIFO','subjects/index.md',(b,leaf)=>{fs.rmSync(leaf);assert.equal(spawnSync('mkfifo',[leaf]).status,0);},'not a regular file'],
    ['a .md link to an outside FIFO','claims/trap.md',(b,leaf)=>{const out=join(dirname(b),'outside-fifo.md');assert.equal(spawnSync('mkfifo',[out]).status,0);fs.symlinkSync(out,leaf);},'a symlink'],
    ['a .md link to an outside file','subjects/system/trap.md',(b,leaf)=>{const out=join(dirname(b),'outside.md');write(out,'---\ntype: PRIVATE-OUTSIDE-MARKER\ntitle: x\n---\n');fs.symlinkSync(out,leaf);},'a symlink'],
    ['a hardlinked .md file','claims/hard.md',(b,leaf)=>{const out=join(dirname(b),'outside-hard.md');write(out,'---\ntype: PRIVATE-OUTSIDE-MARKER\ntitle: x\n---\n');fs.linkSync(out,leaf);},'a file with more than one link'],
  ];
  for(const [name,path,make,why] of LEAVES) {
    const b=bridged(t),leaf=join(b,path);make(b,leaf);
    const started=Date.now(),v=spawnSync(process.execPath,[VALIDATE,b,'--strict','--json'],{encoding:'utf8',timeout:20000});
    assert.equal(v.error,undefined,`${name}: ${v.error}`);assert.ok(Date.now()-started<6000,name);
    assert.equal(v.status,1,name);assert.ok(!v.stdout.includes('PRIVATE-OUTSIDE-MARKER'),`${name}: ${v.stdout}`);
    const out=JSON.parse(v.stdout);assert.deepEqual(out.errors,[`${path}: ${why}; generated indexes are read and written only in plain directories and regular single-link files`],name);
    assert.equal(out.concepts,0,`${name}: no file was read`);
  }
  const plain=join(tmp(t,'okf6-plain-link-'),'base');writePlainBase(plain);
  fs.symlinkSync(join(plain,'expert'),join(plain,'linked'));
  assert.equal(validate(plain).out.layout,'plain');assert.deepEqual(validate(plain).out.errors,[],'5.8 skips a linked directory on a plain base');
});

test('propose reads accepted bytes whole and fails closed: an absent path is null, an unreadable blob is E_GIT, never "absent"',t=>{
  const dir=tmp(t,'okf6-accepted-'),env={...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
  const g=(...a)=>execFileSync('git',['-c','user.name=F','-c','user.email=f@example.invalid','-C',dir,...a],{env,encoding:'utf8'}).trim();
  g('init','-q');write(join(dir,'index.md'),'# Root\n');write(join(dir,'n/a.md'),'A\n');g('add','-A');g('commit','-qm','x');
  const head=g('rev-parse','HEAD'),read=acceptedReader(dir,head);
  assert.equal(read('n/a.md'),'A\n');assert.equal(read('missing.md'),null);
  const oid=g('rev-parse','HEAD:index.md');fs.rmSync(join(dir,'.git/objects',oid.slice(0,2),oid.slice(2)));
  assert.throws(()=>acceptedReader(dir,head)('index.md'),e=>e.code==='E_GIT');
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

// ------------------------------------------------------------- readiness and the portable binding
const checkReq=bindingsFile=>({schemaVersion:1,phase:'check',slot:'knowledge',capability:'oats.okf',settings:{'bindings-file':bindingsFile},input:{context:{kind:'standalone',key:'t'},action:{kind:'hook',name:'spawn'}}});
function directoryDeployment(t,{plain=false,decl}) {
  const dir=tmp(t,'okf6-binding-'),base=join(dir,'bases','project'),bindingsFile=join(dir,'deployment','okf-bindings.json'),soul=join(dir,'soul');
  writePlainBase(base);if(!plain) bridge(base);
  json(bindingsFile,{version:1,stateDir:join(dir,'state'),bases:{project:{id:'base-1',kind:'directory',path:base}}});
  json(join(soul,'okf.json'),decl);
  const saved=process.env.OATS_SOUL;process.env.OATS_SOUL=soul;t.after(()=>{if(saved===undefined) delete process.env.OATS_SOUL; else process.env.OATS_SOUL=saved;});
  return bindingsFile;
}
test('readiness (binding check) resolves a version-2 soul\'s subjects; unresolved or no layout is declaration:unresolved',async t=>{
  const ready=await handleBindingRequest('check',checkReq(directoryDeployment(t,{decl:{version:2,subjects:['system/okf']}})));
  assert.deepEqual(ready,{status:'ready',problems:[]});
  for(const [plain,subjects] of [[false,['system/nope']],[true,['system/okf']]]) {
    const r=await handleBindingRequest('check',checkReq(directoryDeployment(t,{plain,decl:{version:2,subjects}})));
    assert.deepEqual(r,{status:'needs-configuration',problems:[{code:'needs-configuration',message:'declared knowledge nodes do not resolve in the accepted bases'}]},JSON.stringify({plain,subjects}));
  }
});
test('the portable binding keeps owner/stores/reads/owns and refuses a subjects payload with E_CONFIG naming the limit',()=>{
  assert.throws(()=>normalizeKnowledgeDeclaration({contract:'oats.okf.locations',version:1,payload:{subjects:['system/okf']}}),
    e=>e.code==='E_CONFIG' && /carries okf\.json version 1 owner\/owns\/reads only; a version-2 subjects declaration is read from the soul's okf\.json through the bindings-file setting/.test(e.message));
});

// ------------------------------------------------------------- the write surface (propose --check)
/** A bridged base, a snapshot of its accepted texts, and a proposal's changes. */
function proposal(t) {
  const root=bridged(t),accepted=new Map();
  const walk=d=>{for(const e of fs.readdirSync(join(root,d),{withFileTypes:true})) {const p=d?`${d}/${e.name}`:e.name;if(e.isDirectory()) walk(p); else accepted.set(p,fs.readFileSync(join(root,p),'utf8'));}};
  walk('');
  const changes=()=>{const now=new Map();const w=d=>{for(const e of fs.readdirSync(join(root,d),{withFileTypes:true})) {const p=d?`${d}/${e.name}`:e.name;if(e.isDirectory()) w(p); else now.set(p,fs.readFileSync(join(root,p),'utf8'));}};w('');
    return [...new Set([...accepted.keys(),...now.keys()])].sort().flatMap(p=>!accepted.has(p)?[{path:p,status:'A'}]:!now.has(p)?[{path:p,status:'D'}]:accepted.get(p)!==now.get(p)?[{path:p,status:'M'}]:[]);};
  return {root,changes,before:p=>accepted.get(p) ?? null};
}
const V1={version:1,owner:'owner-1',owns:['project/expert'],reads:['project/peer']},V2=validateDeclaration({version:2,subjects:['system/okf']});
const OWNED={expert:'expert'};
const NEW_CLAIM='---\ntype: Decision\ntitle: A new decision\ndescription: Decided now.\n---\n\n# A new decision\n';

test('propose --check, version 1 on a bridged base: a new claim gets about: from legacy-nodes, the indexes are regenerated, and the base validates',t=>{
  const p=proposal(t);
  write(join(p.root,'expert/new.md'),NEW_CLAIM);
  edit(join(p.root,'expert/index.md'),'\n* [Pin','\n* [A new decision](new.md) - Decided now.\n* [Pin');
  const prepared=prepareSubjectProposal({root:p.root,decl:V1,ownedNodes:OWNED,changes:p.changes()});
  assert.deepEqual(prepared,{about:['expert/new.md'],regenerated:['subjects/system/okf/index.md']});
  assert.match(fs.readFileSync(join(p.root,'expert/new.md'),'utf8'),/^description: Decided now\.\nabout: \[system\/okf\]\n---/m);
  assert.doesNotThrow(()=>checkWriteSurface({root:p.root,decl:V1,ownedNodes:OWNED,changes:p.changes(),before:p.before}));
  const v=validate(p.root);
  assert.deepEqual(v.out.errors,[]);
  assert.deepEqual(v.out.warnings,["expert/new.md: missing 'id' (stamped by the maintainer at acceptance)"]);
  assert.deepEqual(proposalFindings(v.out.warnings,p.changes()),[],'a proposed claim waits for the maintainer\'s id');
  assert.deepEqual(proposalFindings(["peer/lesson.md: missing 'id' (stamped by the maintainer at acceptance)"],p.changes()),["peer/lesson.md: missing 'id' (stamped by the maintainer at acceptance)"],'only for its own files');
});

test('propose --check, version 1: a new claim that already has about: gets its node\'s subject too, keeping the others; E_SUBJECT without a mapping',t=>{
  const p=proposal(t);
  write(join(p.root,'expert/new.md'),NEW_CLAIM.replace('description: Decided now.','description: Decided now.\nabout: [workstream/knowledge]'));
  write(join(p.root,'expert/both.md'),NEW_CLAIM.replace('description: Decided now.','description: Decided now.\nabout: [system/okf, workstream/knowledge]').replace('A new decision','Both'));
  assert.deepEqual(prepareSubjectProposal({root:p.root,decl:V1,ownedNodes:OWNED,changes:p.changes()}).about,['expert/new.md']);
  assert.match(fs.readFileSync(join(p.root,'expert/new.md'),'utf8'),/^about: \[system\/okf, workstream\/knowledge\]$/m);
  assert.match(fs.readFileSync(join(p.root,'subjects/system/okf/index.md'),'utf8'),/\(\/expert\/new\.md\)/);
  const q=proposal(t);
  edit(join(q.root,'subjects/system/okf.md'),'legacy-nodes: [expert]','legacy-nodes: []');
  write(join(q.root,'expert/new.md'),NEW_CLAIM.replace('description: Decided now.','description: Decided now.\nabout: [workstream/knowledge]'));
  assert.throws(()=>prepareSubjectProposal({root:q.root,decl:V1,ownedNodes:OWNED,changes:q.changes()}),e=>e.code==='E_SUBJECT');
  const r=proposal(t);
  write(join(r.root,'expert/new.md'),NEW_CLAIM.replace('description: Decided now.','description: Decided now.\nabout: workstream/knowledge'));
  assert.throws(()=>prepareSubjectProposal({root:r.root,decl:V1,ownedNodes:OWNED,changes:r.changes()}),e=>e.code==='E_SUBJECT' && /about must be a flow list/.test(e.message));
});

test('propose --check, version 1: E_SUBJECT when no subject names the owned node; E_SCOPE outside the owned nodes',t=>{
  const p=proposal(t);
  edit(join(p.root,'subjects/system/okf.md'),'legacy-nodes: [expert]','legacy-nodes: []');
  assert.equal(legacyMap(p.root).has('expert'),false);
  write(join(p.root,'expert/new.md'),NEW_CLAIM);
  assert.throws(()=>prepareSubjectProposal({root:p.root,decl:V1,ownedNodes:OWNED,changes:p.changes()}),e=>e.code==='E_SUBJECT' && /expert\/new\.md: no subject on this base names node expert in its legacy-nodes/.test(e.message));
  const q=proposal(t);
  write(join(q.root,'peer/new.md'),NEW_CLAIM.replace('description: Decided now.','description: Decided now.\nabout: [workstream/knowledge]'));
  prepareSubjectProposal({root:q.root,decl:V1,ownedNodes:OWNED,changes:q.changes()});
  assert.throws(()=>checkWriteSurface({root:q.root,decl:V1,ownedNodes:OWNED,changes:q.changes(),before:q.before}),e=>e.code==='E_SCOPE' && e.message==='peer/new.md: a version-1 soul writes only its owned nodes (expert/) and the root index.md');
});

test('propose --check, version 2: claims/**, new system and project subjects and status: superseded pass; the regenerated indexes are part of it',t=>{
  const p=proposal(t);
  write(join(p.root,'claims/decisions/new.md'),NEW_CLAIM.replace('description: Decided now.','description: Decided now.\nabout: [system/okf, system/new-thing, workstream/knowledge]\nsupersedes: [/expert/decision.md]'));
  write(join(p.root,'subjects/system/new-thing.md'),'---\ntype: System\ntitle: New thing\ndescription: A new system.\nin-workstreams: [workstream/knowledge]\n---\n\n# New thing\n');
  write(join(p.root,'subjects/project/trial.md'),'---\ntype: Project\ntitle: Trial\ndescription: A trial.\nstatus: open\n---\n');
  edit(join(p.root,'expert/decision.md'),'id: dec-000000000001','id: dec-000000000001\nstatus: superseded');
  const prepared=prepareSubjectProposal({root:p.root,decl:V2,ownedNodes:{},changes:p.changes()});
  assert.deepEqual(prepared.about,[]);
  assert.deepEqual(prepared.regenerated.sort(),['subjects/index.md','subjects/project/trial/index.md','subjects/system/new-thing/index.md','subjects/system/okf/index.md','subjects/workstream/knowledge/index.md']);
  assert.doesNotThrow(()=>checkWriteSurface({root:p.root,decl:V2,ownedNodes:{},changes:p.changes(),before:p.before}));
  const v=validate(p.root);
  assert.deepEqual(proposalFindings(v.out.errors,p.changes()),[],'the claims/ concept without id is the maintainer\'s to stamp');
  assert.deepEqual(proposalFindings(v.out.warnings,p.changes()),[]);
});

const SCOPE=[
  ['verdicts/',r=>write(join(r,'verdicts/dec-000000000009.md'),'---\ntype: Verdict\n---\n'),/verdicts\/dec-000000000009\.md: only the knowledge maintainer writes verdicts\//],
  ['subjects/workstream/',r=>edit(join(r,'subjects/workstream/knowledge.md'),'description: How','description: Why'),/subjects\/workstream\/knowledge\.md: workstreams change only on a person's cited acceptance/],
  ['an existing system subject',r=>edit(join(r,'subjects/system/okf.md'),'status: active','status: retired'),/subjects\/system\/okf\.md: a proposal adds system and project subjects; it never changes an existing one/],
  ['an old-node file',r=>edit(join(r,'peer/lesson.md'),'Model the refusals.','Model the outputs.'),/peer\/lesson\.md: outside the write surface/],
  ['okf-base.json',r=>{const f=join(r,'okf-base.json'),m=JSON.parse(fs.readFileSync(f,'utf8'));m.nodes.extra={path:'extra',owner:'x'};fs.writeFileSync(f,JSON.stringify(m));},/okf-base\.json: a proposal never changes okf-base\.json/],
  ['the root index.md by hand',r=>edit(join(r,'index.md'),'The peer node.','The peer\'s node.'),/index\.md: a version-2 proposal changes the root index\.md only through the regenerator's Subjects section/],
  ['a deletion',r=>fs.rmSync(join(r,'claims/insights/consult-reads-one-blob.md')),/consult-reads-one-blob\.md: a proposal deletes nothing/],
  ['a non-Markdown file under subjects/system/',r=>write(join(r,'subjects/system/notes.txt'),'not a subject\n'),/subjects\/system\/notes\.txt: subjects\/system\/ and subjects\/project\/ hold Markdown subject files only/],
  ['a non-Markdown file under subjects/project/',r=>write(join(r,'subjects/project/x/data.json'),'{}\n'),/subjects\/project\/x\/data\.json: subjects\/system\/ and subjects\/project\/ hold Markdown subject files only/],
  ['subjects/project/log.md (a reserved name)',r=>write(join(r,'subjects/project/log.md'),'# project log\n'),/subjects\/project\/log\.md: log\.md is a reserved name; a proposal adds subject files subjects\/<system\|project>\/<slug>\.md/],
  ['subjects/system/index.md (a reserved name)',r=>write(join(r,'subjects/system/index.md'),'# system\n'),/subjects\/system\/index\.md: index\.md is a reserved name/],
  ['a reserved name deeper under subjects/system/',r=>write(join(r,'subjects/system/okf/log.md'),'# okf log\n'),/subjects\/system\/okf\/log\.md: log\.md is a reserved name/],
];
for(const [name,mutate,rule] of SCOPE) test(`propose --check, version 2: E_SCOPE for ${name}`,t=>{
  const p=proposal(t);mutate(p.root);
  prepareSubjectProposal({root:p.root,decl:V2,ownedNodes:{},changes:p.changes()});
  assert.throws(()=>checkWriteSurface({root:p.root,decl:V2,ownedNodes:{},changes:p.changes(),before:p.before}),e=>e.code==='E_SCOPE' && rule.test(e.message),name);
});

test('propose --check, version 2: many long supersedes items keep the scope check linear (keyed by textKey), and a real target still matches',t=>{
  const p=proposal(t),items=Array.from({length:2500},(_,i)=>`${'x'.repeat(17000)}${String(i).padStart(6,'0')}`);
  write(join(p.root,'claims/decisions/new.md'),NEW_CLAIM.replace('description: Decided now.',`description: Decided now.\nabout: [system/okf]\nsupersedes: [${items.join(', ')}, /expert/decision.md]`));
  edit(join(p.root,'expert/decision.md'),'id: dec-000000000001','id: dec-000000000001\nstatus: superseded');
  prepareSubjectProposal({root:p.root,decl:V2,ownedNodes:{},changes:p.changes()});
  const started=Date.now();
  assert.doesNotThrow(()=>checkWriteSurface({root:p.root,decl:V2,ownedNodes:{},changes:p.changes(),before:p.before}));
  assert.ok(Date.now()-started<4000,`checkWriteSurface took ${Date.now()-started} ms`);
});

test('propose --check, version 2: status: superseded only on a concept one of the proposal\'s claims supersedes (by path or id)',t=>{
  const cases=[
    ['no superseding claim',null,true],
    ['an unrelated replacement','supersedes: [/expert/decision.md]',true],
    ['a replacement naming its path','supersedes: [/peer/lesson.md]',false],
    ['a replacement naming its id','supersedes: [ins-000000000002]',false],
  ];
  for(const [name,supersedes,refused] of cases) {
    const p=proposal(t);
    edit(join(p.root,'peer/lesson.md'),'id: ins-000000000002','id: ins-000000000002\nstatus: superseded');
    if(supersedes) write(join(p.root,'claims/insights/better.md'),`---\ntype: Insight\ntitle: Better\ndescription: Better.\nabout: [workstream/knowledge]\n${supersedes}\n---\n`);
    prepareSubjectProposal({root:p.root,decl:V2,ownedNodes:{},changes:p.changes()});
    const check=()=>checkWriteSurface({root:p.root,decl:V2,ownedNodes:{},changes:p.changes(),before:p.before});
    if(refused) assert.throws(check,e=>e.code==='E_SCOPE' && /peer\/lesson\.md: status: superseded only on a concept a claim of this proposal supersedes/.test(e.message),name);
    else assert.doesNotThrow(check,name);
  }
});

test('propose --check, version 2: a node\'s reserved log.md or index.md is never superseded, even when a claim names it',t=>{
  for(const file of ['peer/log.md','expert/index.md']) {
    const p=proposal(t),was='---\ntitle: Peer file\n---\n\n# Peer file\n';
    write(join(p.root,file),was.replace('title: Peer file','title: Peer file\nstatus: superseded'));
    write(join(p.root,'claims/insights/better.md'),`---\ntype: Insight\ntitle: Better\ndescription: Better.\nabout: [workstream/knowledge]\nsupersedes: [/${file}]\n---\n`);
    prepareSubjectProposal({root:p.root,decl:V2,ownedNodes:{},changes:p.changes()});
    const before=x=>x===file?was:p.before(x);
    assert.throws(()=>checkWriteSurface({root:p.root,decl:V2,ownedNodes:{},changes:p.changes(),before}),e=>e.code==='E_SCOPE' && e.message.includes(`${file}: outside the write surface`),file);
  }
});

test('propose --check: the regenerator is required; a hand-edited generated index is refused',t=>{
  const p=proposal(t);
  write(join(p.root,'claims/decisions/new.md'),NEW_CLAIM.replace('description: Decided now.','description: Decided now.\nabout: [system/okf]'));
  // Not regenerated: the subject's index is stale.
  assert.throws(()=>checkWriteSurface({root:p.root,decl:V2,ownedNodes:{},changes:p.changes(),before:p.before}),e=>e.code==='E_SCOPE' && /subjects\/system\/okf\/index\.md: a generated index differs from okf-reindex\.mjs's output; regenerate, never edit it/.test(e.message));
  prepareSubjectProposal({root:p.root,decl:V2,ownedNodes:{},changes:p.changes()});
  edit(join(p.root,'subjects/system/okf/index.md'),'# oats-okf','# oats-okf, edited');
  assert.throws(()=>checkWriteSurface({root:p.root,decl:V2,ownedNodes:{},changes:p.changes(),before:p.before}),e=>e.code==='E_SCOPE' && /subjects\/system\/okf\/index\.md: a generated index differs/.test(e.message));
});

test('propose --check: verdict lanes over the proposal\'s claims, from the clone (E_VERDICT; candidates for the PR body)',t=>{
  const p=proposal(t);
  write(join(p.root,'claims/decisions/again.md'),`---\ntype: Decision\ntitle: Something\ndescription: x\nabout: [system/okf]\nid: ${REJECTED.id}\n---\n`);
  assert.throws(()=>proposalVerdicts(p.root,p.changes()),e=>e.code==='E_VERDICT' && e.message.startsWith(`claims/decisions/again.md: claim id ${REJECTED.id} was rejected on 2026-11-10`));
  write(join(p.root,'claims/decisions/again.md'),`---\ntype: Decision\ntitle: ${REJECTED.title.toUpperCase()}\ndescription: x\nabout: [system/okf]\n---\n`);
  const reports=proposalVerdicts(p.root,p.changes());
  assert.deepEqual(reports.map(r=>[r.path,r.candidates.map(c=>c.id)]),[['claims/decisions/again.md',[REJECTED.id]]]);
  assert.match(verdictSection(reports),/^## Verdict candidates\n\n- `claims\/decisions\/again\.md`: title-hash candidate `dec-0000000000aa` \(rejected, Decision\) "Keep a harvester per proposal"/);
  assert.equal(verdictSection([]),'');
});
