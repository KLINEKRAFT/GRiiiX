/* Klinekraft GR / Photography Director — Cinematic v1
   Pure camera-independent exposure decisions from JPEG preview statistics.
   No facial recognition, scene identification, or camera writes occur here. */
(function(root){
"use strict";
const FINITE=v=>typeof v==="number"&&Number.isFinite(v);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const ISO_LIMIT=6400, MAX_STEP=0.7;
function preflight(settings){
 if(!settings||typeof settings!=="object")return {ok:false,reason:"Read the camera exposure settings first."};
 const mode=String(settings.exposureMode||"").trim().toLowerCase();
 if(mode!=="m"&&mode!=="manual")return {ok:false,reason:"Cinematic camera control requires M exposure mode. Camera reports "+(settings.exposureMode||"unknown")+"."};
 const iso=String(settings.iso||"");
 if(!/^\d+$/.test(iso)||!Number.isSafeInteger(Number(iso))||Number(iso)<100)return {ok:false,reason:"Select a fixed ISO on the camera (not Auto ISO)."};
 if(!Array.isArray(settings.isoOptions)||settings.isoOptions.length===0)return {ok:false,reason:"Camera did not report available ISO steps. Writes are blocked."};
 if(!settings.isoOptions.map(String).includes(iso))return {ok:false,reason:"Current ISO is not in the camera's supported value list. Refresh camera settings."};
 return {ok:true,iso:Number(iso),mode:"M"};
}
function evaluate(metrics){
 if(!metrics||!["mid","clipped","dark"].every(k=>FINITE(metrics[k])))return {valid:false,ev:0,ready:true,label:"Unavailable",text:"The image has no reliable exposure statistics.",reason:"missing_metrics",confidence:"low"};
 const mid=clamp(metrics.mid,0,255),clipped=clamp(metrics.clipped,0,100),dark=clamp(metrics.dark,0,100);
 let ev=0,label="Keep the atmosphere.",reason="hold",text="The tonal balance supports a cinematic look. Keep the deliberate shadow depth.";
 if(clipped>=2){
   ev=-clamp(.42+(clipped-2)*.065,.42,MAX_STEP);
   label="Protect the highlights.";reason="clipping";
   text="Bright areas occupy a significant part of the preview. Reduce ISO gently; preserve light sources and highlight detail.";
 }else if(clipped>=.7){
   ev=-.33;label="Hold the highlights.";reason="highlight_warning";
   text="A small highlight reduction may preserve detail without flattening the scene.";
 }else if(mid>115 && dark<25){
   ev=-.35;label="Give the shadows room.";reason="flat_bright";
   text="The preview is brighter than the cinematic target. A small ISO reduction can deepen the tones.";
 }else if(mid<43 && dark>=52){
   // Deliberately do NOT brighten a silhouette / low-key frame based on a histogram.
   label="Let the shadows stay.";reason="intentional_dark";
   text="Deep shadows can be intentional. Review your subject before raising exposure; no automatic brightening recommended.";
 }else if(mid<57 && dark<45 && clipped<.35){
   ev=.3;label="Lift the subject gently.";reason="gentle_lift";
   text="The preview looks underexposed without extensive shadow areas. A small ISO increase may help, but judge the subject.";
 }
 ev=Math.round(clamp(ev,-MAX_STEP,MAX_STEP)*100)/100;
 return {valid:true,ev,ready:Math.abs(ev)<.25,label,reason,text,confidence:"heuristic",clipped,mid,dark};
}
function plan(metrics,options){
 const evaluation=evaluate(metrics);
 const current=Number(options&&options.iso);
 const max=clamp(Number(options&&options.maxISO)||ISO_LIMIT,100,ISO_LIMIT);
 if(!evaluation.valid || !Number.isFinite(current) || current<100)
   return {...evaluation,iso:Number.isFinite(current)?current:null,ev:0,ready:true,reason:"invalid_input",text:"Read the current camera ISO and review the frame first."};
 const desired=clamp(Math.round(current*Math.pow(2,evaluation.ev)),100,max);
 // The camera bridge selects an actual supported token; this is only a request.
 return {...evaluation,iso:desired,isoLimit:max,shutter:"unchanged",safeStep:MAX_STEP};
}
root.KKDirector=Object.freeze({evaluate,plan,preflight,ISO_LIMIT,MAX_STEP});
})(window);
