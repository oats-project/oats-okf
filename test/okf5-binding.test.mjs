import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { handleBindingRequest, runBindingWire, CHECK_REASONS } from '../oats-package/capabilities/oats-okf/lib/binding-wire.mjs';
import { initBase } from '../oats-package/capabilities/oats-okf/lib/migration.mjs';
import { loadBindings } from '../oats-package/capabilities/oats-okf/lib/config.mjs';
// oats.okf 5.0.0 provider binding wire: payloadVersion 2 (no `execution`),
// and a forwarded 4.x harvest setting answers needs-configuration with the
// rendered E_REMOVED sentence. oats.okf 6.1.0: check refuses a captured
// binding as its settings with the one fixed reason.
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const CAP=join(ROOT,'oats-package/capabilities/oats-okf');
const manifest=JSON.parse(fs.readFileSync(join(CAP,'oats.json'),'utf8'));
const SETTING_REASONS=[
  'setting bindings-file is required (absolute host path)',
  'setting bindings-file must be a normalized absolute host path',
  'setting state-dir is required (absolute host path)',
  'setting state-dir must be a normalized absolute host path',
];
const HOST_ORIGINS=JSON.stringify({'/harvest':{kind:'host',at:'oats-local.yaml#/settings/oats.okf'}});
const BF='/srv/oats/test/okf-bindings.json',SD='/srv/oats/test/state';
const ORIGIN={kind:'soul-requirement',pointer:'/knowledge'};
const req=(phase,settings,input)=>({schemaVersion:1,phase,slot:'knowledge',capability:'oats.okf',settings,input});
const soulDeclaration=()=>({kind:'soul',origin:ORIGIN,origins:{},value:{knowledge:{contract:'oats.okf.locations',version:1,payload:{
  owner:'owner-1',stores:{project:{fixed:{id:'base-1',kind:'directory',path:'path:/srv/oats/test/base'}}},
  reads:[{store:'project',node:'peer'}],owns:[{node:'expert',destination:'project'}]}}}});
const normalizeRequest=(settings={'bindings-file':BF,'state-dir':SD})=>req('normalize',settings,{declarations:[soulDeclaration()],context:{kind:'standalone',key:'t'}});
/** The kernel's part, reduced: every requirement's value is the choice. */
async function bound() {
  const normalized=await handleBindingRequest('normalize',normalizeRequest());
  const choices=Object.fromEntries(normalized.requirements.filter(r=>r.value).map(r=>[r.key,{value:r.value,selectedBy:r.origin,constraints:[],considered:[]}]));
  const result=await handleBindingRequest('bind',req('bind',{'bindings-file':BF,'state-dir':SD},{model:normalized.model,choices,context:{kind:'standalone',key:'t'}}));
  return {schemaVersion:1,capability:'oats.okf',...result};
}
function withEnv(t,values) {
  const saved=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  Object.assign(process.env,values);
  t.after(()=>{for(const [k,v] of Object.entries(saved)) if(v===undefined) delete process.env[k]; else process.env[k]=v;});
}
async function wire(phase,request) {
  let text='';
  await runBindingWire(phase,[Buffer.from(JSON.stringify(request))],{write:b=>{text+=b.toString();}});
  return JSON.parse(text);
}
/** A real directory base and soul, for the check phase. Its alias (project)
 *  differs from its id (base-1), as in a usual bindings file: the declared-node
 *  check resolves by the bindings' own aliases. */
function deployment(t) {
  const dir=fs.realpathSync(fs.mkdtempSync(join(tmpdir(),'okf5-binding-')));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const bindingsFile=join(dir,'deployment','okf-bindings.json'),soul=join(dir,'soul'),nodes=join(dir,'nodes.json');
  fs.mkdirSync(dirname(bindingsFile),{recursive:true});fs.mkdirSync(soul);
  fs.writeFileSync(nodes,JSON.stringify({expert:{path:'expert',owner:'owner-1'},peer:{path:'peer',owner:'owner-2'}}));
  fs.writeFileSync(bindingsFile,JSON.stringify({version:1,stateDir:join(dir,'state'),bases:{project:{id:'base-1',kind:'directory',path:join(dir,'bases','project')}}}));
  initBase(loadBindings(bindingsFile),'project',nodes,undefined,{confirm:true});
  fs.writeFileSync(join(soul,'okf.json'),JSON.stringify({version:1,owner:'owner-1',owns:['project/expert'],reads:['project/peer']}));
  return {bindingsFile,soul};
}
const checkInput={context:{kind:'standalone',key:'t'},action:{kind:'hook',name:'spawn'}};

test('normalize then bind a soul declaration yields payloadVersion 2 without execution',async()=>{
  const binding=await bound();
  assert.equal(binding.payloadContract,'oats.okf.locations');
  assert.equal(binding.payloadVersion,2);
  assert.deepEqual(Object.keys(binding.payload).sort(),['owner','owns','reads','runtime','stores']);
  assert.equal(Object.hasOwn(binding.payload,'execution'),false);
  assert.deepEqual(binding.payload.runtime.declaration,{version:1,owner:'owner-1',reads:['base-1/peer'],owns:['base-1/expert']});
  assert.deepEqual(binding.credentialRefs,{});
});

test('check with valid settings for a directory base is ready',async t=>{
  const d=deployment(t);
  withEnv(t,{OATS_SOUL:d.soul});
  const result=await handleBindingRequest('check',req('check',{'bindings-file':d.bindingsFile},checkInput));
  assert.deepEqual(result,{status:'ready',problems:[]});
});

// awebai/oats-aweb#242 part 2 (oats.okf 6.1.0): a captured binding passed as
// the settings (a ProviderBinding1, any payloadVersion) is not checked.
const CAPTURED_REASON='captured bindings are not supported since oats.okf 6.1.0; readiness takes a workspace context (oats readiness)';
test('check with a captured binding as settings needs configuration with the fixed reason',async()=>{
  const binding=await bound();
  for(const settings of [binding,{...binding,payloadVersion:1},{schemaVersion:1}]) {
    const result=await handleBindingRequest('check',req('check',settings,checkInput));
    assert.deepEqual(result,{status:'needs-configuration',problems:[{code:'needs-configuration',message:CAPTURED_REASON}]},JSON.stringify(settings));
  }
  assert.ok(manifest.binding.reasons.includes(CAPTURED_REASON));
});

test('the binding command with a captured variable set answers as without it and warns, naming it and never its value',t=>{
  const d=deployment(t),marker='captured-marker-91b0';
  const env={PATH:process.env.PATH,OATS_SOUL:d.soul};
  const check=extra=>spawnSync(process.execPath,[join(CAP,'bin/oats-okf-binding.mjs'),'check'],{env:{...env,...extra},input:JSON.stringify(req('check',{'bindings-file':d.bindingsFile},checkInput)),encoding:'utf8',timeout:60000});
  const plain=check({}),r=check({OATS_INVOCATION_CONTEXT_FILE:`/srv/${marker}.json`});
  assert.equal(plain.stderr,'');
  assert.equal(JSON.parse(plain.stdout).result.status,'ready');
  assert.deepEqual([r.status,r.stdout],[plain.status,plain.stdout]);
  assert.equal(r.stderr,`OATS_INVOCATION_CONTEXT_FILE is ignored: ${CAPTURED_REASON}\n`);
  assert.doesNotMatch(r.stdout+r.stderr,new RegExp(marker));
});

test('normalize with a host harvest setting needs configuration with the E_REMOVED sentence',async t=>{
  withEnv(t,{OATS_SETTINGS_ORIGINS:HOST_ORIGINS});
  const answer=await wire('normalize',normalizeRequest({'bindings-file':BF,'state-dir':SD,harvest:'on'}));
  assert.equal(answer.ok,false);
  assert.equal(answer.error.code,'needs-configuration');
  assert.ok(answer.error.message.startsWith('E_REMOVED: settings.oats.okf.harvest from host (oats-local.yaml#/settings/oats.okf) was removed in oats.okf 5.0;'),answer.error.message);
  assert.ok(answer.error.message.includes('oats okf setup --remove-legacy-settings --soul <soul> --json'));
});

test('check with a host harvest setting needs configuration with the E_REMOVED sentence',async t=>{
  withEnv(t,{OATS_SETTINGS_ORIGINS:HOST_ORIGINS});
  const result=await handleBindingRequest('check',req('check',{'bindings-file':BF,harvest:'on'},checkInput));
  assert.equal(result.status,'needs-configuration');
  assert.equal(result.problems[0].code,'needs-configuration');
  assert.ok(result.problems[0].message.startsWith('E_REMOVED: settings.oats.okf.harvest from host'),result.problems[0].message);
});

// test/fixtures/okf4-instance-record.json: what a home spawned under 4.x replays.
const OKF4_ORIGINS=JSON.stringify(JSON.parse(fs.readFileSync(join(ROOT,'test/fixtures/okf4-instance-record.json'),'utf8')).capabilities[0].settingsOrigins);
const OKF4_DEFAULTS={harvest:'off','harvest-runtime':'pi'};

test('normalize and check ignore a 4.x home\'s manifest-default harvest off / harvest-runtime pi (never a 5.0 setting)',async t=>{
  const d=deployment(t);
  withEnv(t,{OATS_SOUL:d.soul,OATS_SETTINGS_ORIGINS:OKF4_ORIGINS});
  const normalized=await handleBindingRequest('normalize',normalizeRequest({'bindings-file':BF,'state-dir':SD,...OKF4_DEFAULTS}));
  assert.deepEqual(normalized.model.runtime,{descriptorFile:BF,stateDir:SD},'the effective runtime carries no harvest key');
  const result=await handleBindingRequest('check',req('check',{'bindings-file':d.bindingsFile,...OKF4_DEFAULTS},checkInput));
  assert.deepEqual(result,{status:'ready',problems:[]});
});

test('oats.json binding.reasons pins the setting literals and CHECK_REASONS byte-exact',()=>{
  assert.deepEqual(manifest.binding.reasons,[...SETTING_REASONS,...CHECK_REASONS]);
  assert.equal(manifest.binding.reasons.length,23);
  assert.equal(new Set(manifest.binding.reasons).size,23);
});

test('the portable payload schema requires the five keys and has no execution',()=>{
  const schema=JSON.parse(fs.readFileSync(join(CAP,'schemas','okf-portable-payload.schema.json'),'utf8'));
  assert.deepEqual([...schema.required].sort(),['owner','owns','reads','runtime','stores']);
  assert.deepEqual(Object.keys(schema.properties).sort(),['owner','owns','reads','runtime','stores']);
  assert.equal(schema.additionalProperties,false);
  assert.doesNotMatch(JSON.stringify(schema),/execution/);
  assert.ok(fs.readFileSync(join(ROOT,'schemas','okf-portable-payload.schema.json')).equals(fs.readFileSync(join(CAP,'schemas','okf-portable-payload.schema.json'))),'the repository copy and the capability copy are byte-identical');
});
