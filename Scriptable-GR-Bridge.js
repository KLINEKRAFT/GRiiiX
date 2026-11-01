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
if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
let messages = [];

async function cameraRequest(path, method) {
  if (!path.startsWith("/v1/")) throw Error("Camera path must start with /v1/");
  const r = new Request(CAMERA + path);
  r.allowInsecureRequest = true;
  r.method = method || "GET";
  r.timeoutInterval = 12;
  const output = await r.loadString();
  const status = r.response ? r.response.statusCode : 0;
  if (status < 200 || status >= 300) throw Error("Camera HTTP " + status + ": " + output.slice(0,180));
  try { return JSON.parse(output) } catch (e) { return {text: output} }
}
async function imageRequest(path) {
  const r = new Request(CAMERA + path);
  r.allowInsecureRequest = true;
  r.timeoutInterval = 22;
  const bytes = await r.load();
  const status = r.response ? r.response.statusCode : 0;
  if (status < 200 || status >= 300) throw Error("Camera preview HTTP " + status);
  if (!bytes || !bytes.toBase64String()) throw Error("Empty camera preview");
  return bytes.toBase64String();
}
function pathsFromPhotos(json) {
  const found = new Set();
  function visit(value, parent, depth) {
    if (depth > 14 || value == null) return;
    if (Array.isArray(value)) { for (const item of value) visit(item,parent,depth+1); return }
    if (typeof value !== "object") return;
    const folder = value.folder || value.directory || value.dir || (typeof value.name==="string" && /^\d{3}[A-Z0-9_]{3,}$/i.test(value.name) ? value.name : parent);
    const filename = value.filename || value.file || (typeof value.name==="string" && /\.jpe?g$/i.test(value.name) ? value.name : null);
    const path = value.path || value.url || value.href || "";
    if (typeof path === "string") {
      const m=path.match(/(?:^|\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+\.jpe?g)(?:\?|$)/i);
      if(m)found.add(m[1]+"/"+m[2]);
    }
    if (filename && folder && /^[A-Za-z0-9_.-]+$/.test(String(folder)) && /^[A-Za-z0-9_.-]+\.jpe?g$/i.test(String(filename)))found.add(folder+"/"+filename);
    for (const key of Object.keys(value)) if (value[key] && typeof value[key] === "object")visit(value[key],folder,depth+1);
  }
  visit(json,null,0);
  return [...found].sort();
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function capturePreview() {
  // Strictly compare filenames before/after shutter release. Never silently show an old photo.
  const old=pathsFromPhotos(await cameraRequest("/v1/photos"));
  await cameraRequest("/v1/camera/shoot","POST");
  let newest;
  for(let attempt=0;attempt<9;attempt++) {
    await wait(900);
    const list=pathsFromPhotos(await cameraRequest("/v1/photos"));
    newest=list.find(x=>!old.includes(x));
    if(newest)break;
  }
  if(!newest)throw Error("Shutter requested, but a new JPEG was not identified. Check RAW+JPEG mode and /v1/photos response format.");
  const components=newest.split("/");
  const url="/v1/photos/"+encodeURIComponent(components[0])+"/"+encodeURIComponent(components[1])+"?size=view";
  return {name:components[1],mime:"image/jpeg",base64:await imageRequest(url)};
}
async function handle(message) {
  switch(message.op) {
    case "ping": return await cameraRequest("/v1/ping");
    case "props": return await cameraRequest("/v1/props");
    case "listPhotos": return {paths:pathsFromPhotos(await cameraRequest("/v1/photos"))};
    case "capturePreview": return await capturePreview();
    case "setISO": throw Error("ISO writes are not yet enabled. Verify the exact protocol and firmware first.");
    default: throw Error("Unsupported camera command: "+message.op);
  }
}
async function syncUI(){
  let synced=0;
  for(const file of FILES){
    try{
      const r=new Request(SOURCE+file);
      r.timeoutInterval=8;
      const data=await r.load();
      if(r.response && r.response.statusCode!==200)throw Error("HTTP "+r.response.statusCode);
      fm.write(fm.joinPath(folder,file),data);
      synced++;
    }catch(e){messages.push(file+": "+e.message)}
  }
  if(!fm.fileExists(fm.joinPath(folder,"index.html")))throw Error("No cached UI. Run the script once while your iPhone has internet access.");
  return synced;
}
try {
  const count=await syncUI();
  const view=new WebView();
  await view.loadFile(fm.joinPath(folder,"index.html"));
  // Queue-based bridge: Scriptable processes camera requests outside WebKit.
  await view.evaluateJavaScript(
    "(function(){window.__kkJobs=[];window.__kkPending={};window.__kkSerial=0;" +
    "window.KKNative={request:function(op,payload){return new Promise(function(resolve){var id=++window.__kkSerial;window.__kkPending[id]=resolve;window.__kkJobs.push({id:id,op:op,payload:payload||{}});})}};" +
    "window.__kkReceive=function(x){var fn=window.__kkPending[x.id];if(fn){delete window.__kkPending[x.id];fn(x.result)}};return true})()",
    false
  );
  let showing=true;
  const closed=view.present(false);
  closed.then(()=>{showing=false}).catch(()=>{showing=false});
  while(showing){
    let job;
    try {
      job=await view.evaluateJavaScript(
        "(function(){var pull=function(){if(window.__kkJobs&&window.__kkJobs.length){completion(window.__kkJobs.shift())}else{setTimeout(function(){completion(null)},350)}};pull()})()",
        true
      );
    }catch(e){break}
    if(!job || !job.op)continue;
    let response;
    try{response=await handle(job)}catch(e){response={error:String(e.message||e)}}
    try{await view.evaluateJavaScript("window.__kkReceive("+JSON.stringify({id:job.id,result:response})+")",false)}
    catch(e){break}
  }
}catch(error){
  const a=new Alert();
  a.title="Klinekraft GR Bridge";
  a.message=String(error.message||error)+"\n\n"+messages.join("\n");
  a.addAction("OK");await a.present();
}
Script.complete();
