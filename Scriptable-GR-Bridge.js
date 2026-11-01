// KLINEKRAFT / GR — Scriptable iPhone camera bridge (experimental)
// Install the free Scriptable app, create a script, paste this source, then Run.
// Downloads the current web UI from your public GRiiiX repository on first run.
// It then works from local cache when connected to the camera's Wi-Fi (no internet).
// This is NOT an official Ricoh app. Only read-only operations and a deliberate test shutter
// are supported. ISO writes require explicit app consent and camera read-back.
const SOURCE = "https://raw.githubusercontent.com/KLINEKRAFT/GRiiiX/main/";
const FILES = ["index.html", "adaptive.js", "adaptive.css", "studio.css", "icon.svg", "manifest.webmanifest", "sw.js"];
const CAMERA = "http://192.168.0.1";
const fm = FileManager.local();
const folder = fm.joinPath(fm.documentsDirectory(), "KlinekraftGR");
let messages = [];
let stage = "startup";
async function showMessage(title, description) {
  const alert = new Alert();
  alert.title = title;
  alert.message = description;
  alert.addAction("OK");
  await alert.presentAlert();
}


async function cameraRequest(path, method) {
  if (!path.startsWith("/v1/")) throw Error("Camera path must start with /v1/");
  const r = new Request(CAMERA + path);
  r.allowInsecureRequest = true;
  r.method = method || "GET";
  r.timeoutInterval = 12;
  if (method === "PUT") {
    throw Error("Use putCameraISO for validated camera writes.");
  }
  const output = await r.loadString();
  const status = r.response ? r.response.statusCode : 0;
  if (status < 200 || status >= 300) throw Error("Camera HTTP " + status + ": " + output.slice(0,180));
  let result;
  try { result=JSON.parse(output); } catch (e) { return {text: output} }
  // Ricoh often conveys an error in JSON while still returning HTTP 200.
  if (result && typeof result.errCode==="number" && result.errCode!==200 && result.errCode!==0)
    throw Error("Camera "+path+" returned "+result.errCode+": "+String(result.errMsg||"Unknown error"));
  return result;
}
async function imageRequest(path) {
  const r = new Request(CAMERA + path);
  r.allowInsecureRequest = true;
  r.timeoutInterval = 22;
  const bytes = await r.load();
  const status = r.response ? r.response.statusCode : 0;
  if (status < 200 || status >= 300) throw Error("Camera preview HTTP " + status);
  if (!bytes) throw Error("Empty camera preview");
  const header=bytes.getBytes().slice(0,3);
  if(header[0]!==255 || header[1]!==216 || header[2]!==255)
    throw Error("Camera returned data, but not JPEG. HTTP "+status+"; first bytes: "+header.join(","));
  return bytes.toBase64String();
}
// The GR III/IIIx typically reports {dirs:[{name:"100RICOH",files:["R0000001.JPG", ...]}]}.
// Earlier versions of this script silently ignored those filename strings.
function pathsFromPhotos(json) {
  const found=new Set();
  const validPart=x=>typeof x==="string" && /^[A-Za-z0-9_.-]+$/.test(x);
  const validImage=x=>validPart(x) && /\.(jpe?g|dng)$/i.test(x);
  function add(dir,file) {
    if(validPart(dir)&&validImage(file))found.add(dir+"/"+file);
  }
  function visit(value,parent,depth) {
    if(depth>12||value==null)return;
    if(typeof value==="string"){
      if(parent&&validImage(value))add(parent,value);
      return;
    }
    if(Array.isArray(value)){for(const x of value)visit(x,parent,depth+1);return}
    if(typeof value!=="object")return;
    const dir=value.folder||value.directory||value.dir||
      (typeof value.name==="string" && /^\d{3}[A-Za-z0-9_]{4,}$/.test(value.name)?value.name:parent);
    const filename=value.filename||value.file||
      (typeof value.name==="string"&&validImage(value.name)?value.name:null);
    if(filename&&dir)add(dir,filename);
    const url=value.path||value.url||value.href;
    if(typeof url==="string"){
      const match=url.match(/(?:^|\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+\.(?:jpe?g|dng))(?:\?|$)/i);
      if(match)add(match[1],match[2]);
    }
    if(Array.isArray(value.files))visit(value.files,dir,depth+1);
    for(const key of Object.keys(value)){
      if(key==="files"||key==="path"||key==="url"||key==="href")continue;
      if(value[key]&&typeof value[key]==="object")visit(value[key],dir,depth+1);
    }
  }
  visit(json,null,0);
  return [...found].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function summarizePhotoList(data) {
  const paths=pathsFromPhotos(data);
  return {count:paths.length,jpegs:paths.filter(p=>/\.jpe?g$/i.test(p)).length,
    dngs:paths.filter(p=>/\.dng$/i.test(p)).length,
    folders: Array.isArray(data?.dirs)?data.dirs.length:0,
    keys: Object.keys(data||{}).slice(0,8),
    latest:paths.length?paths[paths.length-1]:null};
}
function previewPath(path) {
  const pieces=path.split("/");
  if(pieces.length!==2)throw Error("Unexpected camera file path");
  return "/v1/photos/"+encodeURIComponent(pieces[0])+"/"+encodeURIComponent(pieces[1])+"?size=view";
}
async function loadPreview(path) {
  const name=path.split("/").pop();
  const url=previewPath(path);
  try{
    return {name:name.replace(/\.dng$/i,".jpg"),mime:"image/jpeg",
      base64:await imageRequest(url)};
  }catch(primary){
    // A small thumbnail is more likely to finish over the GR's slower 2.4GHz radio.
    // This fallback remains a genuine image from the camera, never a placeholder.
    try{
      const thumb=url.replace("?size=view","?size=thumb");
      return {name:name.replace(/\.dng$/i,".jpg"),mime:"image/jpeg",
        base64:await imageRequest(thumb),quality:"thumb"};
    }catch(fallback){
      throw Error("Photo saved, but preview download failed (view: "+String(primary.message||primary)+
        "; thumb: "+String(fallback.message||fallback)+"). Use Recover photo after reconnecting.");
    }
  }
}
async function latestPreview() {
  const list=pathsFromPhotos(await cameraRequest("/v1/photos"));
  if(!list.length)throw Error("No photos found on camera SD card (check camera mode or Wi-Fi).");
  const path=list[list.length-1];
  return await loadPreview(path);
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const PENDING_FILE=fm.joinPath(folder,"pending-capture.json");
let pendingCapture=null;
try{if(fm.fileExists(PENDING_FILE))pendingCapture=JSON.parse(fm.readString(PENDING_FILE))}catch(e){pendingCapture=null}
function persistPending(snapshot){
  pendingCapture=snapshot;
  try{
    if(snapshot)fm.writeString(PENDING_FILE,JSON.stringify(snapshot));
    else if(fm.fileExists(PENDING_FILE))fm.remove(PENDING_FILE);
  }catch(e){messages.push("Capture recovery state could not be saved: "+String(e.message||e))}
}
async function findNewCapture(snapshot){
  const paths=pathsFromPhotos(await cameraRequest("/v1/photos"));
  const previous=new Set(snapshot.before||[]);
  const added=paths.filter(p=>!previous.has(p));
  return added.length?added[added.length-1]:null;
}
async function retrievePending(maxWaitMs){
  if(!pendingCapture)return {pending:false,message:"There is no outstanding camera shot to recover."};
  const end=Date.now()+maxWaitMs;
  let lastError="";
  while(Date.now()<end){
    try{
      if(!pendingCapture.path){
        const path=await findNewCapture(pendingCapture);
        if(path){persistPending({...pendingCapture,path})}
      }
      if(pendingCapture.path){
        const p=await loadPreview(pendingCapture.path);
        persistPending(null);return p;
      }
    }catch(e){lastError=String(e.message||e)}
    await wait(850);
  }
  return {pending:true,message:"Shutter may have fired. No new preview yet. "+
    (lastError?"Last camera error: "+lastError:"Check if the image is on the SD card.")+
    " Tap Recover photo to try again WITHOUT taking another shot."};
}
async function capturePreview(){
  // Never repeat POST on timeout, and never send a second shutter command while
  // the previous result is unresolved. Recovery only performs GET requests.
  if(pendingCapture)return {pending:true,message:"Previous shutter result unresolved. Use Recover photo before taking another shot."};
  const before=pathsFromPhotos(await cameraRequest("/v1/photos"));
  persistPending({before,started:Date.now(),path:null});
  try{await cameraRequest("/v1/camera/shoot","POST")}
  catch(e){
    // A timed-out POST can still have triggered the camera: keep recovery state.
    return {pending:true,message:"Shutter response uncertain: "+String(e.message||e)+
      ". Use Recover photo. No automatic second shutter attempt."};
  }
  return await retrievePending(21000);
}
// Camera ISO bridge: one camera setting at a time, read and verify on every write.
// Deliberately never accept arbitrary paths or unvalidated key-value pairs from WebView.
function numericISO(v) {
  const n=Number(v);return Number.isInteger(n)&&n>=100&&n<=102400?n:null;
}
async function readISOState() {
  // Some Ricoh firmwares expose only /v1/props for GET; prefer dedicated params.
  let data;
  try { data=await cameraRequest("/v1/params/camera","GET"); }
  catch(e) { data=await cameraRequest("/v1/props","GET"); }
  if(!data || typeof data!=="object")throw Error("Camera settings response missing.");
  if(data.sv===undefined || !Array.isArray(data.svList) || data.svList.length===0) {
    const props=await cameraRequest("/v1/props","GET");
    data={...props,...data,svList:Array.isArray(data.svList)&&data.svList.length?data.svList:props.svList};
  }
  const list=Array.isArray(data.svList)?data.svList.map(String):[];
  const iso=data.sv===undefined?null:String(data.sv);
  if(!iso)throw Error("Camera did not provide its current ISO (sv).");
  return {iso,isoOptions:list,exposureMode:String(data.exposureMode||"unknown"),
    shutter:String(data.tv||""),aperture:String(data.av||""),
    compensation:String(data.xv||"")};
}
async function writeCameraISO(isoToken) {
  const r=new Request(CAMERA+"/v1/params/camera");
  r.allowInsecureRequest=true;
  r.method="PUT";
  r.headers={"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"};
  r.body="sv="+encodeURIComponent(isoToken);
  r.timeoutInterval=15;
  const raw=await r.loadString();
  const code=r.response?r.response.statusCode:0;
  if(code<200||code>=300)throw Error("Camera rejected ISO request: HTTP "+code+" "+raw.slice(0,80));
  let data;
  try{data=JSON.parse(raw)}catch(e){throw Error("Camera ISO response was not JSON");}
  if(data.errCode!==undefined && ![0,200,"0","200"].includes(data.errCode))
    throw Error("Camera ISO error "+String(data.errCode)+": "+String(data.errMsg||""));
}
function validateToken(target,previous) {
  const options=previous.isoOptions;
  if(!options.length)throw Error("Camera returned no ISO options; change blocked.");
  if(target==="auto") {
    if(!options.includes("auto"))throw Error("Auto ISO is not a supported setting right now.");
    return target;
  }
  const desired=numericISO(target);
  if(desired==null)throw Error("ISO must be an integer from 100 to 102400.");
  const desiredCeiling=Number.isInteger(previous.maxISO)?previous.maxISO:102400;
  const candidate=options.filter(v=>numericISO(v)!=null && numericISO(v)<=desiredCeiling).sort((a,b)=>
    Math.abs(Math.log2(Number(a)/desired))-Math.abs(Math.log2(Number(b)/desired)))[0];
  if(!candidate)throw Error("Camera reported no writable manual ISO values.");
  return candidate;
}
async function setVerifiedISO(payload) {
  const current=await readISOState();
  const requested=payload&&payload.iso;
  const maxISO=payload&&Number(payload.maxISO);
  if(Number.isInteger(maxISO)&&maxISO>=100&&maxISO<=102400)current.maxISO=maxISO;
  // Cinematic Director has an independent, hardware-side safety policy.
  // An arbitrary WebView request cannot bypass manual mode, fixed ISO or the
  // per-step limit; camera-advertised ISO options still determine the final token.
  const cinematic=payload&&payload.policy==="cinematic";
  if(cinematic){
    if(!/^(m|manual)$/i.test(current.exposureMode))
      throw Error("Cinematic ISO write blocked: camera must be in M exposure mode.");
    if(!/^\\d+$/.test(current.iso))
      throw Error("Cinematic ISO write blocked: fixed manual ISO required.");
    if(payload.expectedShutter!==undefined && String(payload.expectedShutter)!==current.shutter)
      throw Error("Cinematic shutter setting changed since analysis. Refresh camera settings.");
    if(payload.expectedAperture!==undefined && String(payload.expectedAperture)!==current.aperture)
      throw Error("Cinematic aperture setting changed since analysis. Refresh camera settings.");
    current.maxISO=Math.min(current.maxISO||6400,6400);
  }
  const token=validateToken(requested,current);
  if(!payload || payload.expected!==current.iso)
    throw Error("Camera ISO has changed since last read. It is "+current.iso+". Refresh settings and try again.");
  if(cinematic && Math.abs(Math.log2(Number(token)/Number(current.iso)))>.85)
    throw Error("Cinematic ISO change exceeds one cautious camera step; write blocked.");
  if(token===current.iso)return {before:current.iso,after:current.iso,verified:false,
      same:true,exposureMode:current.exposureMode,
      message:"Camera is already at requested ISO; no write performed."};
  await writeCameraISO(token);
  const after=await readISOState();
  if(after.iso!==token)throw Error("ISO write not verified. Requested "+token+", camera reads "+after.iso+".");
  if(cinematic){
    if(!/^(m|manual)$/i.test(after.exposureMode))
      throw Error("ISO changed, but camera no longer reports M mode. Stop and inspect the camera.");
    if(current.shutter && after.shutter && after.shutter!==current.shutter)
      throw Error("ISO changed, but shutter value changed too. Stop and inspect the camera.");
    if(current.aperture && after.aperture && after.aperture!==current.aperture)
      throw Error("ISO changed, but aperture value changed too. Stop and inspect the camera.");
  }
  return {before:current.iso,after:after.iso,verified:true,exposureMode:after.exposureMode,cinematic};
}
async function handle(message) {
  switch(message.op) {
    case "ping": return await cameraRequest("/v1/ping");
    case "props": return await cameraRequest("/v1/props");
    case "listPhotos": return summarizePhotoList(await cameraRequest("/v1/photos"));
    case "latestPreview": return await latestPreview();
    case "capturePreview": return await capturePreview();
    case "recoverCapture": return await retrievePending(15000);
    case "clearPending": persistPending(null); return {cleared:true};
    case "getSettings": return await readISOState();
    case "setISO": return await setVerifiedISO(message.payload);
    default: throw Error("Unsupported camera command: "+message.op);
  }
}
async function syncUI(){
  // All-or-nothing refresh. Never mix new index.html with older JavaScript
  // when GitHub becomes unavailable while connected to the camera's Wi-Fi.
  const downloaded=[];
  try{
    for(const file of FILES){
      const r=new Request(SOURCE+file);
      r.timeoutInterval=4;
      const data=await r.load();
      if(r.response && r.response.statusCode!==200)
        throw Error(file+" HTTP "+r.response.statusCode);
      downloaded.push({file,data});
    }
  }catch(e){
    messages.push("Using last complete offline app; update unavailable: "+String(e.message||e));
    if(!fm.fileExists(fm.joinPath(folder,"index.html")))
      throw Error("First-time download incomplete. Run once while connected to regular internet. "+String(e.message||e));
    return 0;
  }
  // For normal operation this writes a very small local bundle.
  for(const item of downloaded)fm.write(fm.joinPath(folder,item.file),item.data);
  return downloaded.length;
}
try {
  stage = "preflight";
  if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
  const hasCache = fm.fileExists(fm.joinPath(folder,"index.html"));
  await showMessage("Klinekraft GR", hasCache
    ? "Bridge started. Tap OK to open the camera companion. If you're connected to the camera's Wi-Fi, the saved offline copy will be used."
    : "Bridge started. Connect to regular internet for first-time setup. Tap OK to download the app files from GitHub.");
  stage = "downloading";
  const count=await syncUI();
  stage = "loading WebView";
  const view=new WebView();
  await view.loadFile(fm.joinPath(folder,"index.html"));
  const ready=await view.evaluateJavaScript("({title:document.title,bodyLength:document.body?document.body.innerText.length:0})",false);
  if (!ready || !ready.bodyLength) throw Error("The saved HTML loaded as an empty page. Try updating with an internet connection.");
  stage = "initializing camera bridge";
  // Queue-based bridge: Scriptable processes camera requests outside WebKit.
  await view.evaluateJavaScript(
    "(function(){window.__kkJobs=[];window.__kkPending={};window.__kkSerial=0;" +
    "window.KKNative={request:function(op,payload){return new Promise(function(resolve){var id=++window.__kkSerial;var wait=(op==='capturePreview'||op==='setISO')?110000:op==='recoverCapture'?85000:op==='latestPreview'?65000:45000;var timer=setTimeout(function(){if(window.__kkPending[id]){delete window.__kkPending[id];resolve({error:'Scriptable bridge timed out during '+op+'. Open the script again or check camera Wi-Fi.'})}},wait);window.__kkPending[id]=function(result){clearTimeout(timer);resolve(result)};window.__kkJobs.push({id:id,op:op,payload:payload||{}});})}};" +
    "window.__kkReceive=function(x){var fn=window.__kkPending[x.id];if(fn){delete window.__kkPending[x.id];fn(x.result)}};return true})()",
    false
  );
  stage = "displaying app";
  let showing=true;
  let pumpError=null;
  // Let the WebView remain onscreen even if the background message pump fails.
  // Never call Script.complete() while its presentation promise is still open.
  const pump=(async()=>{
    while(showing){
      let job;
      try {
        job=await view.evaluateJavaScript(
          "(function(){var pull=function(){if(window.__kkJobs&&window.__kkJobs.length){completion(window.__kkJobs.shift())}else{setTimeout(function(){completion(null)},350)}};pull()})()",
          true
        );
      }catch(e){pumpError=e;break}
      if(!job || !job.op)continue;
      let response;
      try{response=await handle(job)}catch(e){response={error:String(e.message||e)}}
      try{await view.evaluateJavaScript("window.__kkReceive("+JSON.stringify({id:job.id,result:response})+")",false)}
      catch(e){pumpError=e;break}
    }
  })();
  await view.present(false); // Wait until user closes the app. Do not silently exit.
  showing=false;
  if (pumpError) logError("Klinekraft GR background bridge issue: "+String(pumpError));
}catch(error){
  const a=new Alert();
  a.title="Klinekraft GR Bridge";
  a.message="Step: "+stage+"\n"+String(error.message||error)+"\n\n"+messages.join("\n");
  a.addAction("OK");await a.present();
}
Script.complete();
