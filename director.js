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

// Cinematic v2: rank a *single* change from the live camera's reported values.
// A proposal is never a camera command. Scriptable independently validates writes.
// In a scene with motion, do not sacrifice shutter speed to correct brightness.
function coordinate(metrics,settings,scene,options){
 const exposure=root.KKExposure;
 const assessment=plan(metrics,{iso:Number(settings&&settings.iso),maxISO:options&&options.maxISO||ISO_LIMIT});
 const gate=preflight(settings);
 const no=(reason,explanation)=>({ok:false,action:"hold",reason,label:assessment.label||"Review the frame.",
   explanation:explanation||reason,assessment,alternatives:[],confidence:"heuristic"});
 if(!assessment.valid)return no("unusable_preview","Import or capture a usable JPEG preview first.");
 if(!gate.ok)return no("camera_preflight",gate.reason);
 if(!assessment.ev||assessment.ready)return no("target_met",assessment.text);
 if(!exposure||!exposure.preflight(settings).ok)
   return no("exposure_unavailable","Shutter or aperture values were not reported reliably. Review the camera controls.");
 const sign=assessment.ev>0?"brighter":"darker";
 const sceneName=["people","running","portrait","still"].includes(scene)?scene:"people";
 const available=[];
 const iso=Number(settings.iso);
 const steps=Array.isArray(settings.isoOptions)?settings.isoOptions.map(String):[];
 const desiredEV=assessment.ev;
 const ISO_MAX=Math.min(ISO_LIMIT,Number(options&&options.maxISO)||ISO_LIMIT);
 const requestedISO=iso*Math.pow(2,desiredEV);
 const isoSteps=steps.filter(t=>/^\d+$/.test(t)).map(Number).filter(n=>
   n>=100&&n<=ISO_MAX&&n!==iso&&Math.sign(Math.log2(n/iso))===Math.sign(desiredEV)&&
   Math.abs(Math.log2(n/iso))<=MAX_STEP+.001)
   .sort((a,b)=>Math.abs(Math.log2(a/iso)-desiredEV)-Math.abs(Math.log2(b/iso)-desiredEV));
 if(isoSteps.length) {
   const target=isoSteps[0],delta=Math.log2(target/iso);
   available.push({field:"iso",direction:sign,from:String(iso),to:String(target),deltaEV:Math.round(delta*100)/100,
     label:sign==="brighter"?"Raise ISO gently":"Reduce ISO",detail:"Keeps shutter and aperture unchanged.",quality:"low_noise_tradeoff"});
 }
 for(const field of ["tv","av"]){
   const step=exposure.propose(settings,field,sign,sceneName);
   if(step.ok && Math.sign(step.deltaEV)===Math.sign(desiredEV)){
     available.push({field,direction:sign,from:step.from,to:step.to,deltaEV:step.deltaEV,
       label:field==="tv"?(sign==="brighter"?"Slower shutter":"Faster shutter"):(sign==="brighter"?"Wider aperture":"Narrower aperture"),
       detail:step.reason,quality:field==="tv"?"motion_tradeoff":"depth_tradeoff"});
   }
 }
 // Cinematic has one creative objective but different safety priorities by subject.
 const preference=sign==="darker"?["iso","tv","av"]:
   sceneName==="still"?["tv","iso","av"]:
   sceneName==="portrait"?["av","iso","tv"]:
   ["iso","av","tv"];
 available.sort((a,b)=>preference.indexOf(a.field)-preference.indexOf(b.field)||
   Math.abs(a.deltaEV-desiredEV)-Math.abs(b.deltaEV-desiredEV));
 if(!available.length)return no("no_safe_step","No supported one-step adjustment meets the scene limits. Check the camera or keep the frame.");
 const chosen=available[0];
 return {ok:true,action:"step",field:chosen.field,direction:chosen.direction,
   from:chosen.from,to:chosen.to,deltaEV:chosen.deltaEV,label:chosen.label,
   detail:chosen.detail,reason:assessment.reason,assessment,
   alternatives:available.slice(1),scene:sceneName,
   snapshot:{iso:String(settings.iso),shutter:String(settings.shutter),
     aperture:String(settings.aperture),exposureMode:String(settings.exposureMode)},
   confidence:"heuristic"};
}

root.KKDirector=Object.freeze({evaluate,plan,preflight,ISO_LIMIT,MAX_STEP,coordinate});
})(window);
