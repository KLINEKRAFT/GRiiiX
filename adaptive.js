/* Adaptive Capture: browser-local image review + optional Scriptable camera bridge */
(function(){
"use strict";
const A={shots:[],scene:"people",intent:"moody",iso:1600,max:12800,maxShots:3,busy:false,stop:false,verified:false,connected:false,log:[],camera:null,settings:null,undoISO:null,originalISO:null,recoveryPending:false,detailsOpen:false,directorOn:false};
const $=id=>document.getElementById(id);
const safe=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const goal=()=>A.intent==="moody"?72:A.intent==="balanced"?104:128;
const sceneNames={people:"People walking",running:"Running subjects",portrait:"Posed portraits",still:"Stationary subjects"};
try{A.directorOn=localStorage.getItem("kkgr:director")==="cinematic"}catch(e){}
function directing(){return A.directorOn&&window.KKDirector}
function suggest(m,iso){return directing()?window.KKDirector.plan(m,{iso:Number(iso)||A.iso,maxISO:A.max,scene:A.scene}):guide(m)}
function directorPreflight(x){return window.KKDirector?window.KKDirector.preflight(x):{ok:false,reason:"Photography Director module is not loaded."}}

function message(text){A.log.unshift(new Date().toLocaleTimeString()+" — "+text);A.log=A.log.slice(0,24);refresh()}
function bridge(){return window.KKNative&&typeof window.KKNative.request==="function"?window.KKNative:null}
function refresh(){if(typeof state!=="undefined"&&state.page==="adaptive")render()}
function guide(m){
 let ev=clamp(Math.log2(goal()/Math.max(8,m.mid)),-1.5,1.5);
 if(m.clipped>2.5)ev=Math.min(ev,-clamp(.4+m.clipped/25,.4,1.5));
 const iso=clamp(Math.round(A.iso*Math.pow(2,ev)/100)*100,100,A.max);
 const shutter=A.scene==="running"?"1/250":A.scene==="still"?"1/15":A.scene==="portrait"?"1/60":"1/125";
 return {ev:ev,iso:iso,shutter:shutter,ready:Math.abs(ev)<.3&&m.clipped<2.5,
 text:Math.abs(ev)<.3?"Exposure is near your creative target. Inspect the subject and framing.":ev>0?"Try brighter exposure, ideally by raising ISO to retain shutter speed.":"Reduce exposure to protect highlights or preserve the intended darkness."};
}
function metrics(ctx,w,h){
 const d=ctx.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h),hist=new Uint32Array(256);
 let total=0,dark=0,clip=0,edges=0,count=0;
 for(let p=0,i=0;p<d.length;p+=4,i++){let y=clamp(Math.round(d[p]*.2126+d[p+1]*.7152+d[p+2]*.0722),0,255);gray[i]=y;hist[y]++;total+=y;if(y<33)dark++;if(y>249)clip++}
 for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x+=2){let n=y*w+x;edges+=Math.abs(4*gray[n]-gray[n-1]-gray[n+1]-gray[n-w]-gray[n+w]);count++}
 let threshold=(w*h)/2,sum=0,mid=255;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=threshold){mid=i;break}}
 return {mean:total/(w*h),mid:mid,dark:dark*100/(w*h),clipped:clip*100/(w*h),edge:edges/Math.max(count,1)};
}
async function examine(file){
 if(!file||file.size>50*1024*1024)throw Error("Choose a JPEG/HEIC preview under 50MB.");
 let url=URL.createObjectURL(file),im;
 try{
  if(typeof createImageBitmap==="function")im=await createImageBitmap(file);
  else im=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error("Image decoder cannot open this format."));img.src=url});
  let w=im.width||im.naturalWidth,h=im.height||im.naturalHeight;if(!w||!h)throw Error("Unsupported image. Convert DNG to JPEG.");
  let scale=Math.min(1,640/Math.max(w,h)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  let ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(im,0,0,c.width,c.height);if(im.close)im.close();
  return {name:file.name,url:url,data:metrics(ctx,c.width,c.height)};
 }catch(e){URL.revokeObjectURL(url);throw e}
}
async function addFiles(files){if(A.busy)return;A.busy=true;message("Inspecting images locally…");try{for(const file of files.slice(0,8)){let shot=await examine(file);A.shots.push(shot)}while(A.shots.length>8)URL.revokeObjectURL(A.shots.shift().url);message("Analysis completed on your iPhone. No cloud upload.")}catch(e){message("Import failed: "+e.message)}finally{A.busy=false;refresh()}}
function result(shot){let d=shot.data,g=guide(d);
 return '<div class="ac-card"><b>'+safe(shot.name)+'</b><img class="ac-photo" src="'+safe(shot.url)+'" alt="Analyzed photograph"><div class="ac-metrics"><div><small>MEDIAN TONE</small><strong>'+d.mid+'</strong></div><div><small>CLIPPED WHITE</small><strong>'+d.clipped.toFixed(1)+'%</strong></div><div><small>DEEP SHADOWS</small><strong>'+d.dark.toFixed(1)+'%</strong></div></div><div class="ac-blue"><b>Next-shot recommendation</b><p>'+safe(g.text)+'</p><p>Suggested ISO: <b>'+g.iso+'</b> · Suggested minimum shutter: <b>'+g.shutter+'</b> · Change: <b>'+g.ev.toFixed(1)+' stops</b></p></div><p class="ac-small">Edge detail: '+d.edge.toFixed(1)+'. This is a heuristic, not a reliable focus or motion-blur detector. A moody photograph may deliberately contain many dark pixels.</p></div>';
}
function view(){
 const shot=A.shots[A.shots.length-1];
 const active=A.connected&&!!bridge();
 const suggestion=shot?suggest(shot.data,A.settings?.iso||A.iso):null;
 const director=A.directorOn;
 const canApply=active&&!!A.settings&&!!shot&&!A.busy&&suggestion&&Math.abs(suggestion.ev)>=.3;
 const sceneOptions=Object.entries(sceneNames).map(([key,name])=>'<option value="'+key+'" '+(A.scene===key?'selected':'')+'>'+safe(name)+'</option>').join('');
 const intentOptions=[["moody","Atmospheric"],["balanced","Natural"],["bright","Bright"]]
    .map(([key,name])=>'<option value="'+key+'" '+(A.intent===key?'selected':'')+'>'+name+'</option>').join('');
 const connection=active?"CONNECTED":A.busy?"WORKING":"OFFLINE";
 const latestStatus=A.log[0]?A.log[0].split(" — ").slice(1).join(" — "):"Connect to your camera to begin.";
 return '<div class="shoot-screen">'+
 '<section class="shoot-intro"><div class="shoot-kicker">KLINEKRAFT GR / CAPTURE</div><div class="shoot-intro-row"><h1>Make the frame.</h1><span class="shoot-connection '+(active?'is-online':'')+'"><i></i>'+connection+'</span></div></section>'+
 '<div class="shoot-camera-meta"><span>RICOH GR IIIx</span><span>'+safe(A.settings?.exposureMode||"—")+' &nbsp;·&nbsp; ISO '+safe(A.settings?.iso||"—")+'</span></div>'+
 '<div class="shoot-viewfinder">'+(shot?'<img class="shoot-preview" src="'+safe(shot.url)+'" alt="Last analyzed camera photograph">':'<div class="shoot-no-preview"><div class="shoot-focus-corners"><span></span><span></span><span></span><span></span></div><div class="shoot-frame-title">READY FOR THE LIGHT</div><div class="shoot-frame-subtitle">Your latest frame appears here.</div></div>')+
 '<div class="shoot-viewfinder-meta"><span>GR IIIx &nbsp;/&nbsp; '+(shot?"FRAME "+A.shots.length:"STANDBY")+'</span><span>'+(shot?safe(shot.name):'40 MM')+'</span></div></div>'+
 '<div class="shoot-control-band">'+(active?
   '<button class="shoot-shutter" data-ac="'+(A.recoveryPending?'recover':'capture')+'" '+(A.busy?'disabled':'')+' aria-label="'+(A.recoveryPending?'Recover last captured image':'Take photograph and analyze')+'"><span></span></button>'+
   '<div class="shoot-control-copy"><b>'+(A.recoveryPending?'Recover last frame':'Capture & analyze')+'</b><p>'+(A.recoveryPending?'No additional shutter press':'Camera photo · private analysis')+'</p></div>'
   :
   '<button class="shoot-connect" data-ac="connect" '+(!bridge()||A.busy?'disabled':'')+'>Connect camera</button><div class="shoot-control-copy"><b>'+(!bridge()?'Scriptable connection required':'Camera not connected')+'</b><p>Join the Ricoh Wi-Fi in iPhone Settings</p></div>')+
 '<div class="shoot-control-trailing"><label for="acPhotos" class="shoot-import">Import</label><input id="acPhotos" type="file" accept="image/*" multiple hidden></div></div>'+
 '<div class="shoot-status" role="status" aria-live="polite"><span class="shoot-status-dot"></span>'+safe(latestStatus)+'</div>'+
 '<section class="director-panel '+(director?'director-active':'')+'"><div class="director-top"><div><span class="shoot-section-title">PHOTOGRAPHY DIRECTOR</span><h2>Cinematic</h2></div><button class="director-switch '+(director?'active':'')+'" data-ac="director" aria-pressed="'+(director?'true':'false')+'" '+(A.busy?'disabled':'')+'>'+(director?'Director on':'Enable')+'</button></div><p>'+(director?'Protect light. Keep the shadows. Make every correction deliberate.':'Highlight-first shooting with gentle, verified camera adjustments.')+'</p>'+(director?'<div class="director-tags"><span>HIGHLIGHTS FIRST</span><span>SHADOWS KEPT</span><span>ISO ≤ 6400</span></div>':'')+'</section>'+
 '<div class="shoot-section-title">THE INTENTION</div><div class="shoot-selectors"><label>Subject<select id="acScene">'+sceneOptions+'</select></label>'+(director?'<div class="director-rendering"><span>RENDERING</span><strong>Cinematic / low key</strong></div>':'<label>Rendering<select id="acIntent">'+intentOptions+'</select></label>')+'</div>'+
 (shot?'<div class="shoot-result"><div class="shoot-result-top"><div><span class="shoot-section-title">FRAME ASSESSMENT</span><h2>'+(director?safe(suggestion.label):(suggestion.ready?'On target.':suggestion.ev>0?'Needs more light.':'Protect the highlights.'))+'</h2></div><div class="shoot-ev">'+(suggestion.ev>0?'+':'')+suggestion.ev.toFixed(1)+' EV</div></div>'+
 '<p class="shoot-assessment">'+safe(suggestion.text)+'</p>'+
 '<div class="shoot-iso-trace"><div><span>CAMERA ISO</span><strong>'+safe(A.settings?.iso||A.iso)+'</strong></div><div class="shoot-iso-arrow">→</div><div><span>RECOMMENDED</span><strong>'+suggestion.iso+'</strong></div><div class="shoot-iso-note">'+(director?'M MODE / ISO ONLY':'ISO ONLY')+'</div></div>'+
 '<label class="shoot-consent"><input id="acApplyConsent" type="checkbox"><span>Allow this ISO change on my camera</span></label>'+
 '<div class="shoot-result-actions"><button class="shoot-primary" data-ac="apply" '+(!canApply?'disabled':'')+'>'+(director?'Apply Director ISO':'Apply to camera')+'</button><button class="shoot-tertiary" data-ac="restore" '+(!active||!A.undoISO||A.busy?'disabled':'')+'>Undo</button></div>'+
 '</div>':
 '<div class="shoot-first-frame"><div class="shoot-section-title">THE FIRST FRAME</div><p>Capture or import a photograph. We’ll analyze exposure and suggest the next move.</p></div>')+
 '<details class="shoot-advanced" data-grdetails '+(A.detailsOpen?'open':'')+'><summary><span>Advanced controls</span><span>Camera tools & diagnostics</span></summary><div class="shoot-advanced-body">'+
 '<div class="shoot-section-title">CAMERA CONTROL</div><div class="shoot-tool-actions"><button data-ac="settings" '+(!active||A.busy?'disabled':'')+'>Refresh camera ISO</button><button data-ac="latest" '+(!active||A.busy?'disabled':'')+'>Review most recent</button><button data-ac="check" '+(!active||A.busy?'disabled':'')+'>Check SD card</button></div>'+
 '<div class="shoot-advanced-grid"><label>Current ISO<input type="number" id="acIso" min="100" max="102400" value="'+A.iso+'"></label><label>Maximum ISO<input type="number" id="acMax" min="100" max="102400" value="'+A.max+'"></label></div>'+
 '<div class="shoot-section-title">AUTOMATIC CAPTURE</div><p class="shoot-small">After one confirmed ISO change in M mode, capture and review up to 3 frames automatically. The camera keeps its originals.</p><label class="shoot-consent"><input id="acConsent" type="checkbox">Authorize the automatic capture sequence</label>'+
 '<div class="shoot-tool-actions"><button data-ac="auto" '+(!active||!A.verified||A.busy||A.recoveryPending?'disabled':'')+'>Auto correct</button><button data-ac="stop" '+(!A.busy?'disabled':'')+'>Stop</button></div>'+
 (director?'<div class="director-auto"><span class="shoot-section-title">CINEMATIC DIRECTOR PASS</span><p>Two frames maximum. Review the first; apply a confirmed ISO adjustment only when necessary.</p><label class="shoot-consent"><input id="acDirectorConsent" type="checkbox">Authorize two captures and verified ISO changes</label><button class="shoot-primary" data-ac="direct" '+(!active||!A.verified||A.busy||A.recoveryPending?'disabled':'')+'>Run Director pass</button></div>':'')+
 '<div class="shoot-section-title">SESSION TOOLS</div><div class="shoot-tool-actions"><button data-ac="clear" '+(!A.shots.length?'disabled':'')+'>Clear review</button><button data-ac="recover" '+(!active||A.busy?'disabled':'')+'>Recover shot</button><button data-ac="discard" '+(!active||!A.recoveryPending||A.busy?'disabled':'')+'>Discard pending marker</button></div>'+
 (shot?'<div class="shoot-data-grid"><div><span>MEDIAN TONE</span><b>'+shot.data.mid+'</b></div><div><span>CLIPPED WHITES</span><b>'+shot.data.clipped.toFixed(1)+'%</b></div><div><span>SHADOW DETAIL</span><b>'+shot.data.dark.toFixed(1)+'%</b></div></div>':'')+
 (A.shots.length>1?'<div class="shoot-compare">'+A.shots.slice(-2).map((p,i)=>'<div><img src="'+safe(p.url)+'" alt="'+(i?'Most recent':'Previous')+'"><small>'+(i?'CURRENT':'PREVIOUS')+'</small></div>').join('')+'</div>':'')+
 '<div class="shoot-section-title">ACTIVITY</div><pre class="shoot-activity">'+safe(A.log.join("\\n")||"No activity yet.")+'</pre>'+
 '<p class="shoot-small">Camera control requires Scriptable. iOS may interrupt transfers over the GR IIIx Wi-Fi. A recovery request does not fire the shutter again.</p>'+
 '</div></details></div>';
}
async function native(op,payload){if(!bridge())throw Error("Scriptable camera bridge is not active.");const response=await bridge().request(op,payload||{});if(!response||response.error)throw Error(response?.error||"No camera response");return response}
async function readSettings() {
 const settings=await native("getSettings");
 A.settings=settings;
 const value=Number(settings.iso);
 if(Number.isInteger(value)&&value>=100){A.iso=value}
 return settings;
}
async function connect(){
 try{
  A.busy=true;A.verified=false;A.undoISO=null;
  message("Checking camera Wi-Fi and exposure settings…");
  await native("ping");await native("props");A.connected=true;
  try { const settings=await readSettings();
    message("Connected. Camera ISO "+settings.iso+" · Mode "+settings.exposureMode+". Settings are ready for testing.");
  }catch(e){message("Camera connected; exposure settings unavailable: "+e.message)}
 }catch(e){A.connected=false;A.settings=null;message("Camera connection failed: "+e.message)}
 finally{A.busy=false;refresh()}
}
async function refreshExposure(){
 try{A.busy=true;const s=await readSettings();message("Camera confirms ISO "+s.iso+" · "+s.exposureMode+" mode. "+s.isoOptions.length+" available ISO values.")}
 catch(e){message("Could not read camera settings: "+e.message)}
 finally{A.busy=false;refresh()}
}
async function applySuggestion(){
 if(!A.connected||!A.shots.length){message("Connect the camera and analyze a photograph first.");return}
 if(A.busy)return;
 if(!$("acApplyConsent")?.checked){message("Check the Apply ISO consent box before changing the camera.");return}
 try{
  A.busy=true;message("Reading live ISO before making any adjustment…");
  const current=await readSettings();
  if(!/^\d+$/.test(current.iso))throw Error("Current camera ISO is "+current.iso+". Switch from Auto ISO to a fixed ISO on the camera for this first test.");
  if(!current.isoOptions.length)throw Error("Camera did not report a writable ISO list.");
  if(A.directorOn){const check=directorPreflight(current);if(!check.ok)throw Error(check.reason)}
  const suggested=suggest(A.shots[A.shots.length-1].data,current.iso);
  if(suggested.ready||Math.abs(suggested.ev)<.25){message(A.directorOn?"Director recommends holding this exposure. No camera write.":"No ISO change needed for the selected look.");return}
  const proposed=Math.min(A.max,A.directorOn?6400:102400,suggested.iso);
  message("Sending ISO adjustment to your GR IIIx…");
  const result=await native("setISO",{iso:proposed,expected:current.iso,maxISO:A.directorOn?Math.min(A.max,6400):A.max,...(A.directorOn?{policy:"cinematic",expectedShutter:current.shutter,expectedAperture:current.aperture}:{})});
  const checked=await readSettings();
  if(result.verified!==true){
   if(result.same){message("Camera was already set to "+checked.iso+". No change made.");return}
   throw Error("Camera did not confirm a setting change");
  }
  if(checked.iso!==result.after)throw Error("Second read-back did not match the applied ISO");
  A.undoISO=result.before;A.verified=true;
  message("Camera confirmed ISO "+result.before+" → "+result.after+". You can undo this, or try Auto Correct in M mode.");
 }catch(e){A.verified=false;message("ISO adjustment failed: "+e.message)}
 finally{A.busy=false;refresh()}
}
async function restoreISO(){
 if(!A.connected||!A.undoISO||A.busy)return;
 try{
  A.busy=true;const live=await readSettings();
  const result=await native("setISO",{iso:A.undoISO,expected:live.iso});
  if(result.verified===true || result.same){
    await readSettings();A.undoISO=null;message("Camera ISO restored to "+A.settings.iso+".");
  }else throw Error("Camera did not verify restore");
 }catch(e){message("Restore failed: "+e.message)}
 finally{A.busy=false;refresh()}
}
async function checkCard(){
 try{A.busy=true;message("Checking camera SD card…");const r=await native("listPhotos");
  message("Card: "+r.count+" photos ("+r.jpegs+" JPEG, "+r.dngs+" DNG), "+r.folders+" folders. "+(r.latest?"Latest: "+r.latest:"No recent photo found."));
 }catch(e){message("Card check failed: "+e.message)}
 finally{A.busy=false;refresh()}
}
async function latestPhoto(){
 try{
  A.busy=true;message("Downloading preview of latest photo…");
  const r=await native("latestPreview");await addCameraShot(r);
  message("Latest camera photo reviewed and analyzed.");
 }catch(e){message("Preview check failed: "+e.message)}
 finally{A.busy=false;refresh()}
}
async function addCameraShot(r){
 if(!r.base64||!r.mime)throw Error("Camera returned no JPEG preview data");
 const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0));
 if(bytes[0]!==255||bytes[1]!==216)throw Error("Preview data is not a JPEG");
 const photo=new File([bytes],r.name||"Ricoh-preview.jpg",{type:"image/jpeg"});
 const shot=await examine(photo);A.shots.push(shot);
 while(A.shots.length>8)URL.revokeObjectURL(A.shots.shift().url);
 refresh();
}
async function capture(){
 try{A.busy=true;message("Capturing a frame and waiting for the preview…");const r=await native("capturePreview");
 if(r.pending){A.recoveryPending=true;message(r.message||"Photo pending. Use Recover shot.");return}
 await addCameraShot(r);A.recoveryPending=false;
 message("Frame received and analyzed. Original preserved on camera.")
 }catch(e){message("Test capture stopped: "+e.message)}finally{A.busy=false;refresh()}
}

async function recover(){
 if(A.busy)return;
 try{A.busy=true;message("Looking for the previous photo. No new shutter command…");
 const result=await native("recoverCapture");
 if(result.pending){A.recoveryPending=true;message(result.message||"Photo is still being saved.");return}
 if(!result.base64)throw Error(result.message||"No previous capture to recover.");
 await addCameraShot(result);A.recoveryPending=false;
 message("Recovered and analyzed the photo. No additional shutter press.");
 }catch(e){message("Recovery failed: "+e.message)}
 finally{A.busy=false;refresh()}
}
async function discardPending(){
 if(A.busy)return;
 try{A.busy=true;await native("clearPending");A.recoveryPending=false;
 message("Recovery marker cleared. Existing camera photographs were not changed.");}
 catch(e){message("Could not clear recovery marker: "+e.message)}
 finally{A.busy=false;refresh()}
}

async function auto(directorPass=false){
 if(A.busy||A.recoveryPending||!A.verified||!A.connected){message("Apply one verified manual ISO change before using Auto Correct.");return}
 if(directorPass&&!A.directorOn){message("Enable Cinematic Director first.");return}
 if(!$(directorPass?"acDirectorConsent":"acConsent")?.checked){message("Check the capture authorization box first.");return}
 A.busy=true;A.stop=false;
 try{
  const initial=await readSettings();
  if(!/^(m|manual)$/i.test(initial.exposureMode))
    throw Error("Auto Correct needs manual exposure mode (M). Current camera mode is "+initial.exposureMode+".");
  if(!/^\d+$/.test(initial.iso))
    throw Error("Auto Correct requires fixed ISO. Camera reports "+initial.iso+".");
  if(directorPass){const check=directorPreflight(initial);if(!check.ok)throw Error(check.reason)}
  A.iso=Number(initial.iso);
  let confirmed=initial.iso,budget=directorPass?2:A.maxShots;
  message(directorPass?"Starting Cinematic Director pass (up to two frames).":"Starting Auto Correct (up to "+budget+" frames).");
  for(let i=0;i<budget&&!A.stop;i++){
   const before=await readSettings();
   if(before.iso!==confirmed)throw Error("Camera ISO changed externally. Stopping.");
   if(!/^(m|manual)$/i.test(before.exposureMode))throw Error("Camera left M exposure mode. Stopping.");
   const r=await native("capturePreview");
   if(r.pending){A.recoveryPending=true;throw Error(r.message||"Camera image pending; recover before another shutter request.")}
   await addCameraShot(r);A.recoveryPending=false;
   const shot=A.shots[A.shots.length-1];
   const proposed=directorPass?window.KKDirector.plan(shot.data,{iso:Number(before.iso),maxISO:Math.min(A.max,6400),scene:A.scene}):guide(shot.data);
   message("Frame "+(i+1)+": "+proposed.text);
   if(proposed.ready || A.stop || i+1>=budget)break;
   const oldISO=before.iso;
   const write=await native("setISO",{iso:proposed.iso,expected:oldISO,maxISO:directorPass?Math.min(A.max,6400):A.max,...(directorPass?{policy:"cinematic",expectedShutter:before.shutter,expectedAperture:before.aperture}:{})});
   if(write.same){message("Camera ISO cannot improve further at the available setting.");break}
   if(write.verified!==true)throw Error("Camera ISO adjustment wasn't verified. Stopping.");
   const checked=await readSettings();
   if(checked.iso!==write.after)throw Error("Camera ISO read-back changed. Stopping.");
   A.undoISO=A.undoISO||initial.iso;A.iso=Number(write.after);confirmed=write.after;
   message("Camera updated ISO "+oldISO+" → "+confirmed+".");
  }
  message(A.stop?"Capture sequence stopped. Last confirmed ISO "+confirmed+".":(directorPass?"Director pass complete. ":"Auto Correct complete. ")+"Last ISO "+confirmed+".");
 }catch(e){A.verified=false;message("Auto Correct stopped: "+e.message)}
 finally{A.busy=false;A.stop=false;refresh()}
}
document.addEventListener("click",async e=>{let x=e.target.closest("[data-ac]");if(!x)return;let op=x.dataset.ac;if(op==="connect")await connect();if(op==="settings")await refreshExposure();if(op==="apply")await applySuggestion();if(op==="restore")await restoreISO();if(op==="check")await checkCard();if(op==="latest")await latestPhoto();if(op==="capture")await capture();if(op==="recover")await recover();if(op==="discard")await discardPending();if(op==="auto")await auto();if(op==="direct")await auto(true);if(op==="director"){A.directorOn=!A.directorOn;if(A.directorOn)A.intent="moody";try{localStorage.setItem("kkgr:director",A.directorOn?"cinematic":"off")}catch(e){}message(A.directorOn?"Cinematic Director enabled. Highlights first, shadows preserved.":"Photography Director disabled.");}if(op==="stop"){A.stop=true;message("Stop requested; waiting for in-flight operation.")}if(op==="clear"){A.shots.forEach(s=>URL.revokeObjectURL(s.url));A.shots=[];message("Analysis cleared; camera originals unchanged.")}});
document.addEventListener("change",e=>{let x=e.target;if(x.id==="acPhotos"){addFiles([...x.files]);x.value=""}
if(x.id==="acScene"){A.scene=x.value;refresh()}if(x.id==="acIntent"){A.intent=x.value;refresh()}
if(x.id==="acIso"){A.iso=clamp(Number(x.value)||1600,100,102400);refresh()}if(x.id==="acMax"){A.max=clamp(Number(x.value)||12800,100,102400);refresh()}});
window.KKAdaptive={view,metrics,guide,connect,state:A,directorPlan:(m,iso)=>window.KKDirector?.plan(m,{iso,maxISO:Math.min(A.max,6400),scene:A.scene})};
function iconSvg(d){return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>'}
pages.adaptive=view;
pages.recipes=function(){
 const list=state.recipes.map(r=>{
  const selected=state.active===r.id;
  return '<article class="look-item"><div class="look-main"><span class="look-symbol">'+(selected?'●':'○')+'</span><div class="look-copy"><h2>'+safe(r.name)+'</h2><p>'+safe(r.look)+' <span>·</span> '+safe(r.shutter)+' <span>·</span> '+safe(r.aperture)+' <span>·</span> '+safe(r.iso)+'</p>'+(r.note?'<small>'+safe(r.note)+'</small>':'')+'</div><div class="look-indicator">'+(selected?'IN USE':'')+'</div></div><div class="look-actions"><button data-select="'+safe(r.id)+'" '+(selected?'disabled':'')+'>'+(selected?'Selected':'Select look')+'</button><button data-edit="'+safe(r.id)+'">Edit</button><button data-delete="'+safe(r.id)+'">Remove</button></div></article>';
 }).join('');
 return '<div class="shoot-intro"><div class="shoot-kicker">YOUR PERSONAL PALETTE</div><div class="collection-heading"><h1>Looks.</h1><button data-action="new">New look +</button></div><p class="shoot-subtitle">Save the settings behind the photographs you love.</p></div>'+
 '<div class="look-list">'+list+'</div>'+
 '<div class="collection-tools"><button data-action="import">Import JSON</button><button data-action="export">Export collection</button></div>'+
 '<p class="collection-note">Selecting a look changes the reference in this app. It does not automatically modify the GR IIIx.</p>';
};
pages.library=function(){
 const count=state.photos.length;
 return '<div class="shoot-intro"><div class="shoot-kicker">THE PRIVATE COLLECTION</div><div class="collection-heading"><h1>Library.</h1><button data-action="photos">Import +</button></div><p class="shoot-subtitle">'+count+' photograph'+(count===1?'':'s')+' saved locally on this device.</p></div>'+
 (count?'<div class="collection-gallery">'+state.photos.slice().reverse().map(p=>'<button class="collection-photo" data-photo="'+safe(p.id)+'"><img src="'+safe(p.url)+'" loading="lazy" alt="'+safe(p.name)+'"></button>').join('')+'</div>':'<div class="collection-empty"><span>✳</span><h2>A place for your photographs.</h2><p>Import from Photos or Files to begin a private collection.</p><button data-action="photos">Choose photographs</button></div>')+
 '<p class="collection-note">Photos are stored in your browser on this iPhone, not uploaded to a server. Keep your original images backed up elsewhere.</p>';
};
pages.more=function(){
 return '<div class="shoot-intro"><div class="shoot-kicker">THE PHOTOGRAPHER’S TOOLKIT</div><h1>Beyond the frame.</h1><p class="shoot-subtitle">The essentials, when you need them.</p></div>'+
 '<div class="more-links">'+
 '<button data-page="walks"><span>01</span><div><strong>Photo walks</strong><small>GPS field notes & saved routes</small></div><b>↗</b></button>'+
 '<button data-page="studio"><span>02</span><div><strong>Studio tools</strong><small>Timers & shooting guidance</small></div><b>↗</b></button>'+
 '<button data-page="insights"><span>03</span><div><strong>Insights</strong><small>Photo and activity statistics</small></div><b>↗</b></button></div>'+
 '<div class="more-pref"><span>APPEARANCE</span><button data-grtheme>Switch to '+(document.documentElement.dataset.theme==="dark"?"light":"dark")+' mode</button></div>'+
 '<div class="more-footer">KLINEKRAFT / GR <span>PRIVATE BY DESIGN</span></div>';
};
tablist.splice(0,tablist.length,
 ["adaptive",iconSvg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/>'),"Shoot"],
 ["recipes",iconSvg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),"Looks"],
 ["library",iconSvg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 3 3 3-3 5 5"/>'),"Library"],
 ["more",iconSvg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),"More"]);
if(state.page==="home")state.page="adaptive";
try{document.documentElement.dataset.theme=localStorage.getItem("kkgr:theme")||"light"}catch(e){document.documentElement.dataset.theme="light"}
document.addEventListener("click",e=>{const t=e.target.closest("[data-grtheme]");if(t){const next=document.documentElement.dataset.theme==="dark"?"light":"dark";document.documentElement.dataset.theme=next;try{localStorage.setItem("kkgr:theme",next)}catch(e){}render()}});
document.addEventListener("toggle",e=>{if(e.target.matches&&e.target.matches("[data-grdetails]"))A.detailsOpen=e.target.open},true);
render();
})();