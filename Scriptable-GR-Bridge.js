// KLINEKRAFT / GR — Scriptable iPhone camera bridge (experimental)
// Install the free Scriptable app, create a script, paste this source, then Run.
// Downloads the current web UI from your public GRiiiX repository on first run.
// It then works from local cache when connected to the camera's Wi-Fi (no internet).
// This is NOT an official Ricoh app. Only read-only operations and a deliberate test shutter
// are supported. Experimental setting writes remain DISABLED.
const SOURCE = "https://raw.githubusercontent.com/KLINEKRAFT/GRiiiX/main/";
const FILES = ["index.html", "adaptive.js", "adaptive.css", "icon.svg", "manifest.webmanifest", "sw.js"];
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
  return {name:name.replace(/\.dng$/i,".jpg"),mime:"image/jpeg",
    base64:await imageRequest(previewPath(path))};
}
async function latestPreview() {
  const list=pathsFromPhotos(await cameraRequest("/v1/photos"));
  if(!list.length)throw Error("No photos found on camera SD card (check camera mode or Wi-Fi).");
  const path=list[list.length-1];
  return await loadPreview(path);
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function capturePreview() {
  const before=pathsFromPhotos(await cameraRequest("/v1/photos"));
  const beforeSet=new Set(before);
  await cameraRequest("/v1/camera/shoot","POST");
  let newest=null;
  for(let attempt=0;attempt<14;attempt++){
    await wait(850);
    const after=pathsFromPhotos(await cameraRequest("/v1/photos"));
    const added=after.filter(x=>!beforeSet.has(x));
    if(added.length){newest=added[added.length-1];break}
  }
  if(!newest)throw Error("Shutter command sent, but no new photo appeared in the list. Before="+before.length+". Try 'Check card' or 'Review latest photo' to isolate the problem.");
  return await loadPreview(newest);
}
async function handle(message) {
  switch(message.op) {
    case "ping": return await cameraRequest("/v1/ping");
    case "props": return await cameraRequest("/v1/props");
    case "listPhotos": return summarizePhotoList(await cameraRequest("/v1/photos"));
    case "latestPreview": return await latestPreview();
    case "capturePreview": return await capturePreview();
    case "setISO": throw Error("ISO writes are not yet enabled. Verify the exact protocol and firmware first.");
    default: throw Error("Unsupported camera command: "+message.op);
  }
}
async function syncUI(){
  let synced=0,online=true;
  for(const file of FILES){
    if(!online)break;
    try{
      const r=new Request(SOURCE+file);
      r.timeoutInterval=4;
      const data=await r.load();
      if(r.response && r.response.statusCode!==200)throw Error("HTTP "+r.response.statusCode);
      fm.write(fm.joinPath(folder,file),data);
      synced++;
    }catch(e){messages.push("Using cached interface; update unavailable: "+e.message);online=false}
  }
  if(!fm.fileExists(fm.joinPath(folder,"index.html")))throw Error("No cached UI. Run the script once while your iPhone has internet access.");
  return synced;
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
    "window.KKNative={request:function(op,payload){return new Promise(function(resolve){var id=++window.__kkSerial;window.__kkPending[id]=resolve;window.__kkJobs.push({id:id,op:op,payload:payload||{}});})}};" +
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
