/* Klinekraft GR · Exposure Studio
   Pure one-step plans; no direct camera I/O. Canonical GR tv is "1.125" for 1/125 s.
   Camera reported option lists are the only authority for available settings. */
(function(root){
"use strict";
const FIELDS=["tv","av"];
const round=x=>Math.round(x*100)/100;
const tvSeconds=s=>{
 const m=/^1\.(\d+)$/.exec(String(s));
 if(!m)return null;
 const d=Number(m[1]);return Number.isInteger(d)&&d>0?1/d:null;
};
const aperture=s=>{const n=Number(s);return Number.isFinite(n)&&n>=2.8&&n<=16?n:null};
function display(field,value){
 if(field==="tv"){const n=tvSeconds(value);return n?"1/"+String(value).slice(2):String(value||"—")}
 if(field==="av")return aperture(value)!==null?"f/"+String(value):String(value||"—");
 return String(value||"—");
}
function preflight(settings){
 if(!settings||typeof settings!=="object")return {ok:false,reason:"Camera settings have not been read."};
 if(!/^(M|manual)$/i.test(String(settings.exposureMode||"")))
   return {ok:false,reason:"Shutter and aperture writes require M exposure mode."};
 if(!/^\d+$/.test(String(settings.iso||"")))
   return {ok:false,reason:"Use a fixed camera ISO, not Auto ISO."};
 if(!tvSeconds(settings.shutter)||aperture(settings.aperture)===null)
   return {ok:false,reason:"The camera did not report recognizable shutter and aperture values."};
 return {ok:true};
}
function propose(settings,field,direction,scene){
 const gate=preflight(settings);
 if(!gate.ok)return {...gate,field,direction};
 if(!FIELDS.includes(field)||!["brighter","darker"].includes(direction))
   return {ok:false,reason:"Unsupported exposure field or direction.",field,direction};
 const options=field==="tv"?settings.shutterOptions:settings.apertureOptions;
 if(!Array.isArray(options)||!options.length)
   return {ok:false,field,direction,reason:"No camera-reported "+field+" values. Change disabled."};
 const current=String(field==="tv"?settings.shutter:settings.aperture);
 const minShutter=scene==="running"?1/250:scene==="people"?1/125:scene==="portrait"?1/60:1/30;
 const values=options.map(String)
    .filter(x=>field==="tv"?tvSeconds(x)!==null&&tvSeconds(x)>=(aperture(settings.aperture)>=5.6?1/4000:1/2500)&&tvSeconds(x)<=minShutter
      :aperture(x)!==null)
    .filter((x,i,arr)=>arr.indexOf(x)===i);
 // Moving subjects may already be set slower than the recommended minimum.
 // Those settings must be corrected on the camera before offering remote changes.
 if(!values.includes(current))
   return {ok:false,field,direction,reason:"Current "+field+" is outside the safe shooting range or not in camera options. Set a supported value on the camera."};
 const brightness=token=>field==="tv"?Math.log2(tvSeconds(token)):
   -2*Math.log2(aperture(token));
 values.sort((a,b)=>brightness(a)-brightness(b));
 const index=values.indexOf(current),next=values[index+(direction==="brighter"?1:-1)];
 if(!next)return {ok:false,field,direction,reason:"Camera is already at the safe "+(direction==="brighter"?"bright":"dark")+" limit."};
 const stops=brightness(next)-brightness(current);
 if(Math.abs(stops)>.6)
   return {ok:false,field,direction,reason:"Next supported camera step exceeds the 0.6-stop safety limit."};
 return {ok:true,field,direction,from:current,to:next,deltaEV:round(stops),
   fromLabel:display(field,current),toLabel:display(field,next),
   reason:field==="tv"?
     (direction==="brighter"?"Slower shutter admits more light; movement can blur.":"Faster shutter reduces exposure and helps freeze motion."):
     (direction==="brighter"?"Wider aperture admits more light and reduces depth of field.":"Narrower aperture preserves highlights and increases depth of field.")};
}
root.KKExposure=Object.freeze({tvSeconds,aperture,display,preflight,propose});
})(window);
