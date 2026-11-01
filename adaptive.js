/* Adaptive Capture: browser-local image review + optional Scriptable camera bridge */
(function(){
"use strict";
const A={shots:[],scene:"people",intent:"moody",iso:1600,max:12800,maxShots:3,busy:false,stop:false,verified:false,connected:false,log:[],camera:null};
const $=id=>document.getElementById(id);
const safe=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const goal=()=>A.intent==="moody"?72:A.intent==="balanced"?104:128;
const sceneNames={people:"People walking",running:"Running subjects",portrait:"Posed portraits",still:"Stationary subjects"};
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
 let last=A.shots[A.shots.length-1];
 const active=A.connected&&!!bridge();
 return heading("Adaptive Capture.","Review each frame. Improve your exposure. Keep the atmosphere.")+
 '<div class="ac-card"><div class="ac-row"><div><div class="ac-label">CAMERA LINK</div><h2>GR IIIx</h2></div><span class="ac-pill '+(active?"good":"")+'">'+(active?"Connected":"Not connected")+'</span></div><p class="ac-small">Run this interface in Scriptable to use the camera. Use the checks below in order to isolate any failure.</p><div class="ac-actions"><button class="ac-button light" data-ac="connect" '+(!bridge()||A.busy?"disabled":"")+'>1 · Connect</button><button class="ac-button light" data-ac="check" '+(!active||A.busy?"disabled":"")+'>2 · Check card</button><button class="ac-button light" data-ac="latest" '+(!active||A.busy?"disabled":"")+'>3 · Review latest photo</button><button class="ac-button" data-ac="capture" '+(!active||A.busy?"disabled":"")+'>4 · Shoot & analyze</button></div><div class="ac-blue" role="status" aria-live="polite"><b>Latest status</b><p>'+safe(A.log[0]||"Run 1 · Connect first.")+'</p></div></div>'+
 '<div class="ac-card"><div class="ac-label">CREATIVE TARGET</div><div class="ac-fields"><label>Scene<select id="acScene">'+Object.entries(sceneNames).map(([k,v])=>'<option '+(A.scene===k?"selected":"")+' value="'+k+'">'+v+'</option>').join("")+'</select></label><label>Look<select id="acIntent">'+[["moody","Moody / cinematic"],["balanced","Balanced"],["bright","Bright / clear"]].map(([k,v])=>'<option '+(A.intent===k?"selected":"")+' value="'+k+'">'+v+'</option>').join("")+'</select></label><label>Current ISO<input id="acIso" type="number" min="100" max="102400" value="'+A.iso+'"></label><label>ISO limit<input id="acMax" type="number" min="100" max="102400" value="'+A.max+'"></label></div><p class="ac-small">ISO is entered manually until the camera properties are parsed and confirmed.</p></div>'+
 '<div class="ac-card"><div class="ac-row"><div><div class="ac-label">PHOTO REVIEW</div><h2>Analyze a shot</h2></div><span class="ac-pill">'+A.shots.length+' photos</span></div><label class="ac-button ac-picker">Import photographs<input id="acPhotos" type="file" accept="image/*" multiple hidden></label> <button class="ac-button light" data-ac="clear" '+(!A.shots.length?"disabled":"")+'>Clear</button><p class="ac-small">Compatible JPEG / HEIC images are processed only on-device. RAW requires a rendered preview.</p></div>'+
 (last?result(last):'<div class="ac-card ac-empty">Import a photograph to see exposure, highlight, and shadow analysis.</div>')+
 (A.shots.length>=2?'<div class="ac-card"><div class="ac-label">BEFORE / AFTER</div><div class="ac-compare">'+A.shots.slice(-2).map((s,i)=>'<div><img src="'+safe(s.url)+'" alt="'+(i?"After":"Before")+'"><span class="ac-small">'+(i?"Latest":"Previous")+' · tone '+s.data.mid+'</span></div>').join("")+'</div></div>':"")+
 '<div class="ac-card"><div class="ac-label">AUTOMATED CAPTURE</div><h2>Auto Correct</h2><p class="ac-small">A bounded capture/analyze/adjust loop is included, but automatic ISO changes stay locked until the camera confirms a supported setting write and read-back on your firmware. It will never report a fake success.</p><label class="ac-check"><input type="checkbox" id="acConsent"> I authorize up to three captures and verified ISO changes once connected.</label><div class="ac-actions"><button class="ac-button" data-ac="auto" '+(!active||!A.verified||A.busy?"disabled":"")+'>Auto Correct</button><button class="ac-button light" data-ac="stop" '+(!A.busy?"disabled":"")+'>Stop</button></div><p class="ac-small">Status: '+(A.verified?"ISO writes verified":"Camera setting writes not verified")+'. Original files remain on the camera.</p></div>'+
 '<div class="ac-card"><div class="ac-label">SESSION ACTIVITY</div><pre class="ac-log">'+safe(A.log.join("\n")||"No activity yet.")+'</pre></div>';
}
async function native(op,payload){if(!bridge())throw Error("Scriptable camera bridge is not active.");const response=await bridge().request(op,payload||{});if(!response||response.error)throw Error(response?.error||"No camera response");return response}
async function connect(){try{A.busy=true;message("Checking camera ping…");const ping=await native("ping");const props=await native("props");A.camera=props;A.connected=true;message("Camera connection verified. Read-only control active.");return {ping,props}}catch(e){A.connected=false;message("Camera not connected: "+e.message)}finally{A.busy=false;refresh()}}
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
 try{A.busy=true;message("Capturing a test photo…");const r=await native("capturePreview");await addCameraShot(r);
 message("Test photo analyzed; original preserved on camera.")
 }catch(e){message("Test capture stopped: "+e.message)}finally{A.busy=false;refresh()}
}
async function auto(){
 if(!A.verified||!A.connected){message("Automatic camera adjustment is locked pending read-back verification.");return}
 if(!$("acConsent")?.checked){message("Please authorize the capture sequence first.");return}
 A.busy=true;A.stop=false;try{for(let i=0;i<A.maxShots&&!A.stop;i++){let r=await native("capturePreview");if(!r.base64||!r.mime)throw Error("Missing JPEG preview");
 let bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0)),photo=new File([bytes],r.name||"GR-shot.jpg",{type:r.mime}),shot=await examine(photo);A.shots.push(shot);let p=guide(shot.data);message("Shot "+(i+1)+": "+p.text);if(p.ready)break;if(i+1>=A.maxShots)break;
 let result=await native("setISO",{iso:p.iso});if(result.verified!==true)throw Error("ISO read-back failed, stopping");A.iso=p.iso}
 }catch(e){message("Auto Correct stopped: "+e.message)}finally{A.busy=false;A.stop=false;refresh()}
}
document.addEventListener("click",async e=>{let x=e.target.closest("[data-ac]");if(!x)return;let op=x.dataset.ac;if(op==="connect")await connect();if(op==="check")await checkCard();if(op==="latest")await latestPhoto();if(op==="capture")await capture();if(op==="auto")await auto();if(op==="stop"){A.stop=true;message("Stop requested; waiting for in-flight operation.")}if(op==="clear"){A.shots.forEach(s=>URL.revokeObjectURL(s.url));A.shots=[];message("Analysis cleared; camera originals unchanged.")}});
document.addEventListener("change",e=>{let x=e.target;if(x.id==="acPhotos"){addFiles([...x.files]);x.value=""}
if(x.id==="acScene"){A.scene=x.value;refresh()}if(x.id==="acIntent"){A.intent=x.value;refresh()}
if(x.id==="acIso"){A.iso=clamp(Number(x.value)||1600,100,102400);refresh()}if(x.id==="acMax"){A.max=clamp(Number(x.value)||12800,100,102400);refresh()}});
window.KKAdaptive={view,metrics,guide,connect,state:A};
pages.adaptive=view;tablist.splice(4,0,["adaptive","◎","Adaptive"]);render();
})();