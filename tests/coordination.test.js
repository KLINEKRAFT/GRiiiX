// Run with: node --test tests/coordination.test.js
// Deliberately hardware-free: exercising plans and the explicit consent pathway.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function libraries(){
 const context={window:{}};vm.createContext(context);
 vm.runInContext(read('exposure.js'),context);
 vm.runInContext(read('director.js'),context);
 return context.window;
}
const data=()=>({
 exposureMode:'M',iso:'1600',
 isoOptions:['100','200','400','800','1000','1250','1600','2000','2500','3200','6400'],
 shutter:'1.125',shutterOptions:['1.30','1.40','1.60','1.80','1.100','1.125','1.160','1.200','1.250'],
 aperture:'4.0',apertureOptions:['2.8','3.2','3.5','4.0','5.6']
});
const shadow={mid:52,clipped:0.1,dark:18};
test('walking subjects favor ISO, maintaining a safe shutter speed',()=>{
 const p=libraries().KKDirector.coordinate(shadow,data(),'people',{maxISO:6400});
 assert.equal(p.ok,true);assert.equal(p.field,'iso');assert.equal(p.to,'2000');
 assert.equal(p.snapshot.shutter,'1.125');
});
test('still subject favors conservative shutter step before adding noise',()=>{
 const p=libraries().KKDirector.coordinate(shadow,data(),'still',{maxISO:6400});
 assert.equal(p.field,'tv');assert.equal(p.to,'1.100');
 assert.ok(p.deltaEV>0&&p.deltaEV<=.6);
});
test('portrait can prioritize aperture and preserve the scene shutter',()=>{
 const p=libraries().KKDirector.coordinate(shadow,data(),'portrait',{maxISO:6400});
 assert.equal(p.field,'av');assert.equal(p.to,'3.5');
});
test('highlight clipping at base ISO favors faster shutter over impossible ISO reduction',()=>{
 const p=libraries().KKDirector.coordinate({mid:90,clipped:4,dark:10},{...data(),iso:'100'},'still',{maxISO:6400});
 assert.equal(p.ok,true);assert.equal(p.field,'tv');assert.equal(p.direction,'darker');
});
test('do not brighten an intentional silhouette',()=>{
 const p=libraries().KKDirector.coordinate({mid:20,clipped:0,dark:85},data(),'people',{maxISO:6400});
 assert.equal(p.ok,false);assert.equal(p.reason,'target_met');
});
test('unsafe current shutter blocks Director rather than silently changing ISO',()=>{
 const p=libraries().KKDirector.coordinate(shadow,{...data(),shutter:'1.60'},'running',{maxISO:6400});
 assert.equal(p.ok,false);assert.equal(p.reason,'unsafe_shutter');
});
test('missing camera state and auto ISO are read-only',()=>{
 const D=libraries().KKDirector;
 assert.equal(D.coordinate(shadow,null,'people',{}).ok,false);
 assert.equal(D.coordinate(shadow,{...data(),iso:'auto'},'people',{}).ok,false);
});
function appHarness(scene){
 const w=libraries();const handlers={},calls=[],camera={...data()};
 w.KKNative={request:async(op,args)=>{
  calls.push([op,args]);
  if(op==='getSettings')return {...camera};
  if(op==='setISO'){camera.iso=String(args.iso);return {verified:true,before:'1600',after:camera.iso};}
  if(op==='setExposureStep'){camera.shutter='1.100';return {verified:true,field:'tv',before:'1.125',after:'1.100'};}
  throw new Error('Unexpected camera command '+op);
 }};
 const doc={documentElement:{dataset:{}},addEventListener(name,fn){(handlers[name]??=[]).push(fn)},getElementById(){return {checked:true}}};
 const pages={},tablist=[],state={page:'adaptive',recipes:[],walks:[],photos:[]};
 const build=new Function('window','document','pages','tablist','state','heading','render','localStorage',read('adaptive.js')+';return window.KKAdaptive;');
 const ui=build(w,doc,pages,tablist,state,()=>'',()=>{}, {getItem:key=>key==='kkgr:director'?'cinematic':null,setItem(){}});
 ui.state.scene=scene;ui.state.connected=true;ui.state.settings={...camera};
 ui.state.shots=[{name:'TEST.JPG',url:'blob:mock',data:shadow}];
 const trigger=async()=>{
  const target={dataset:{ac:'directorStep'},closest(){return this;}};
  for(const handler of handlers.click)await handler({target});
 };
 return {ui,trigger,calls,camera,pages};
}
test('camera remains unchanged until a fresh camera capture is available',async()=>{
 const h=appHarness('still');await h.trigger();
 assert.equal(h.calls.filter(c=>c[0]==='setExposureStep').length,0);
});
test('one supervised shutter adjustment is verified, then a second write is blocked',async()=>{
 const h=appHarness('still');h.ui.state.directorNeedsFrame=false;
 const markup=h.pages.adaptive();assert.ok(markup.includes('Apply Director step'));
 await h.trigger();
 assert.equal(h.camera.shutter,'1.100');
 assert.equal(h.calls.filter(c=>c[0]==='setExposureStep').length,1);
 assert.equal(h.ui.state.directorNeedsFrame,true);
 assert.equal(h.ui.state.undoExposure.from,'1.125');
 await h.trigger();
 assert.equal(h.calls.filter(c=>c[0]==='setExposureStep').length,1);
});
