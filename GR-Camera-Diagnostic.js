// GR IIIx — independent Wi-Fi diagnostic (read-only, does not take photographs)
const BASE = "http://192.168.0.1";
async function getJSON(path) {
  const r = new Request(BASE + path);
  r.allowInsecureRequest = true;
  r.timeoutInterval = 15;
  const text = await r.loadString();
  const status = r.response ? r.response.statusCode : 0;
  if (status !== 200) throw new Error(path + " HTTP " + status + " " + text.slice(0,80));
  const json=JSON.parse(text);
  if (json.errCode != null && json.errCode !== 200 && json.errCode !== 0) throw new Error(path + ": " + json.errMsg + " (" + json.errCode + ")");
  return json;
}
async function notify(title,message) {
  const a=new Alert();
  a.title=title;a.message=message;
  a.addAction("OK");
  await a.presentAlert();
}
try {
  await notify("GR Camera Check","Connect iPhone to the GR IIIx Wi-Fi first, then tap OK. This script only reads the camera; it will NOT fire the shutter.");
  const ping=await getJSON("/v1/ping");
  const props=await getJSON("/v1/props");
  const list=await getJSON("/v1/photos");
  const paths=[];
  for(const dir of (list.dirs || [])) {
    for(const file of (dir.files || [])) {
      const name=typeof file==="string"?file:file?.name||file?.filename||file?.file;
      if (/\.(jpe?g|dng)$/i.test(name||"")) paths.push({dir:dir.name,file:name});
    }
  }
  paths.sort((a,b)=>(a.dir+"/"+a.file).localeCompare(b.dir+"/"+b.file,undefined,{numeric:true}));
  const latest=paths[paths.length-1];
  await notify("Camera connected", "Model: "+String(props.model||"GR camera")+"\nSD card images: "+paths.length+"\nLatest: "+(latest?latest.dir+"/"+latest.file:"None")+"\nNext: try downloading the latest preview.");
  if(!latest)throw new Error("Camera photo list is empty; take a regular picture and retry.");
  const url=BASE+"/v1/photos/"+encodeURIComponent(latest.dir)+"/"+encodeURIComponent(latest.file)+"?size=view";
  const request=new Request(url);request.allowInsecureRequest=true;request.timeoutInterval=25;
  const image=await request.loadImage();
  const status=request.response?.statusCode;
  if(status!==200)throw new Error("Preview HTTP "+status);
  await QuickLook.present(image);
  await notify("Preview works!","The camera delivered its latest image. Our Adaptive app can use the same read-only request.");
} catch(e) {
  await notify("GR Diagnostic Error", String(e.message||e)+"\n\nIf it's a network error, join the camera Wi-Fi in Settings. If the card is empty, take a photo normally on the camera.");
}
Script.complete();
