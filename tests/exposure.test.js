// node --test tests/exposure.test.js
// All tests are hardware-free. Live Ricoh firmware behavior requires an iPhone test.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const exposureSource=fs.readFileSync(path.join(root,"exposure.js"),"utf8");
const box={window:{}};vm.runInNewContext(exposureSource,box);
const E=box.window.KKExposure;
const camera=()=>({exposureMode:"M",iso:"1600",shutter:"1.125",aperture:"2.8",
  shutterOptions:["1.60","1.80","1.100","1.125","1.160","1.200","1.250","1.320"],
  apertureOptions:["2.8","3.2","3.5","4.0","5.6","8.0"]});
test("Ricoh TV token 1.125 is 1/125 sec, not 1.125 sec",()=>{
  assert.equal(E.tvSeconds("1.125"),1/125);
  assert.equal(E.display("tv","1.125"),"1/125");
});
test("faster shutter and narrower aperture have small negative-EV changes",()=>{
  const t=E.propose(camera(),"tv","darker","people");
  const a=E.propose(camera(),"av","darker","people");
  assert.equal(t.to,"1.160");assert.equal(a.to,"3.2");
  assert.ok(t.deltaEV<0&&Math.abs(t.deltaEV)<.6);
  assert.ok(a.deltaEV<0&&Math.abs(a.deltaEV)<.6);
});
test("moving subject blocks going below 1/125 sec",()=>{
  assert.equal(E.propose(camera(),"tv","brighter","people").ok,false);
  assert.equal(E.propose(camera(),"tv","brighter","still").to,"1.100");
});
test("non-manual modes and missing camera-supported values block controls",()=>{
  assert.equal(E.propose({...camera(),exposureMode:"P"},"tv","darker","still").ok,false);
  assert.equal(E.propose({...camera(),iso:"auto"},"tv","darker","still").ok,false);
  assert.equal(E.propose({...camera(),apertureOptions:[]},"av","darker","still").ok,false);
});
function transport({refuse=false,mode="M",changedISO=false}={}){
  let writes=0;
  const current=camera();current.exposureMode=mode;
  async function readISOState(){return {...current}}
  class Request{
    constructor(){this.response={statusCode:200}}
    async loadString(){writes++;const [field,val]=this.body.split("=");
      if(!refuse){current[field==="tv"?"shutter":"aperture"]=decodeURIComponent(val)}
      if(changedISO)current.iso="800";
      return '{"errCode":200}';
    }
  }
  const src=fs.readFileSync(path.join(root,"Scriptable-GR-Bridge.js"),"utf8");
  const start=src.indexOf("function secondsFromTv(token)"),end=src.indexOf("async function handle(message)",start);
  assert.ok(start>0&&end>start);
  const sandbox={readISOState,Request,CAMERA:"http://192.168.0.1"};
  vm.createContext(sandbox);vm.runInContext(src.slice(start,end),sandbox);
  return {apply:sandbox.setVerifiedExposure,writes:()=>writes};
}
const expected=()=>({iso:"1600",exposureMode:"M",shutter:"1.125",aperture:"2.8"});
test("device-side shutter write returns success only with confirmed read-back",async()=>{
 const b=transport();
 const r=await b.apply({field:"tv",direction:"darker",scene:"people",expected:expected()});
 assert.equal(r.verified,true);assert.equal(r.after,"1.160");assert.equal(b.writes(),1);
});
test("camera-side guard refuses stale state without sending PUT",async()=>{
 const b=transport();
 await assert.rejects(()=>b.apply({field:"tv",direction:"darker",scene:"people",
   expected:{...expected(),iso:"800"}}));
 assert.equal(b.writes(),0);
});
test("failed and ambiguous writes never report verification",async()=>{
 const b=transport({refuse:true});
 await assert.rejects(()=>b.apply({field:"tv",direction:"darker",scene:"people",expected:expected()}),/did not confirm/);
 const c=transport({changedISO:true});
 await assert.rejects(()=>c.apply({field:"tv",direction:"darker",scene:"people",expected:expected()}),/changed another/);
});
