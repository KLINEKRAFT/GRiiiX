// Run: node --test tests/director.test.js
// Uses Node's built-in test runner; no packages or camera connection required.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
function getDirector(){
  const sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'director.js'),'utf8'),sandbox);
  return sandbox.window.KKDirector;
}
const Director=getDirector();
test('cinematic protects large bright regions with a cautious ISO decrease',()=>{
  const r=Director.plan({mid:82,clipped:4,dark:20},{iso:1600,maxISO:12800});
  assert.equal(r.reason,'clipping');
  assert.ok(r.ev<0&&r.ev>=-0.7);
  assert.ok(r.iso<1600);
  assert.equal(r.isoLimit,6400);
});
test('cinematic preserves intentional silhouettes instead of brightening the whole image',()=>{
  const r=Director.plan({mid:25,clipped:.1,dark:82},{iso:1600,maxISO:6400});
  assert.equal(r.ev,0);
  assert.equal(r.reason,'intentional_dark');
  assert.equal(r.iso,1600);
});
test('subtle, deliberate adjustments for a flat bright photograph',()=>{
  const r=Director.plan({mid:155,clipped:0,dark:4},{iso:3200,maxISO:12800});
  assert.equal(r.ev,-.35);
  assert.ok(r.iso<3200);
});
test('manual M mode, numeric fixed ISO and reported supported ISO are required',()=>{
  assert.equal(Director.preflight({exposureMode:'M',iso:'1600',isoOptions:['1600','3200']}).ok,true);
  assert.equal(Director.preflight({exposureMode:'P',iso:'1600',isoOptions:['1600']}).ok,false);
  assert.equal(Director.preflight({exposureMode:'M',iso:'auto',isoOptions:['auto','1600']}).ok,false);
  assert.equal(Director.preflight({exposureMode:'M',iso:'1600',isoOptions:[]}).ok,false);
});
function bridgeHarness({iso='1600',mode='M',stale=false,refuse=false,changeShutter=false}={}){
  const camera={sv:iso,svList:['auto','100','200','400','800','1250','1600','2000','3200','6400','12800'],exposureMode:mode,tv:'1/125',av:'2.8'};
  let writes=0;
  async function cameraRequest(){return {...camera};}
  class Request {
    constructor(){this.response={statusCode:200};}
    async loadString(){
      if(this.method==='PUT'){
        writes++;
        if(!refuse)camera.sv=decodeURIComponent(this.body.split('=')[1]);
        if(changeShutter)camera.tv='1/60';
      }
      return '{"errCode":200}';
    }
  }
  const source=fs.readFileSync(path.join(root,'Scriptable-GR-Bridge.js'),'utf8');
  const start=source.indexOf('function numericISO(v)'),end=source.indexOf('async function handle(message)',start);
  assert.ok(start>=0&&end>start,'ISO bridge code should be extractable');
  const context={cameraRequest,Request,CAMERA:'http://192.168.0.1',Error,Number,Math,String,Array,JSON,RegExp,Promise};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  return {setISO:context.setVerifiedISO,camera,getWrites:()=>writes};
}
test('bridge accepts cinematic ISO write only after successful read-back',async()=>{
  const h=bridgeHarness();
  const out=await h.setISO({iso:1250,expected:'1600',maxISO:6400,policy:'cinematic',expectedShutter:'1/125',expectedAperture:'2.8'});
  assert.equal(out.verified,true);
  assert.equal(out.after,'1250');
  assert.equal(h.getWrites(),1);
});
test('bridge blocks Auto ISO, P mode, stale ISO and too-large changes before writing',async()=>{
  const scenarios=[
    {options:{iso:'auto'},request:{iso:1250,expected:'auto',policy:'cinematic'}},
    {options:{mode:'P'},request:{iso:1250,expected:'1600',policy:'cinematic'}},
    {options:{},request:{iso:1250,expected:'800',policy:'cinematic'}},
    {options:{},request:{iso:6400,expected:'1600',policy:'cinematic'}}
  ];
  for(const x of scenarios){
    const h=bridgeHarness(x.options);
    await assert.rejects(()=>h.setISO(x.request));
    assert.equal(h.getWrites(),0);
  }
});
test('bridge does not claim success on an unconfirmed ISO write',async()=>{
  const h=bridgeHarness({refuse:true});
  await assert.rejects(()=>h.setISO({iso:1250,expected:'1600',policy:'cinematic'}),/not verified/);
  assert.equal(h.getWrites(),1);
});
test('bridge flags unexpected changes to shutter settings after a write',async()=>{
  const h=bridgeHarness({changeShutter:true});
  await assert.rejects(()=>h.setISO({iso:1250,expected:'1600',policy:'cinematic',expectedShutter:'1/125'}),/shutter value changed/);
});
