'use strict';
var cd = window.__initData.cd;
var cdColor = window.__initData.cdColor;
var _audioCtx = null;
function pad(n){return String(n).padStart(2,"0");}
function playCdAlarm(type){
  try{if(!_audioCtx)_audioCtx=new(window.AudioContext||window.webkitAudioContext)();var ctx=_audioCtx;
  if(type==="beep"){for(var i=0;i<3;i++){var o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=880;o.type="square";g.gain.value=0.15;var t=ctx.currentTime+i*0.3;o.start(t);o.stop(t+0.15);}}
  else if(type==="klaxon"){for(var i=0;i<4;i++){var o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=i%2===0?440:550;o.type="sawtooth";g.gain.value=0.2;var t=ctx.currentTime+i*0.4;o.start(t);o.stop(t+0.35);}}
  }catch(e){}
}
function tick(){
  var ms,isOT=false;
  if(cd.paused){ms=Math.max(0,cd.pausedRemaining);}
  else{var rem=cd.targetTime-Date.now();if(rem>0){ms=rem;}else{isOT=cd.continueUp;ms=isOT?-rem:0;}}
  var ts=Math.floor(ms/1000),h=Math.floor(ts/3600),m=Math.floor((ts%3600)/60),s=ts%60;
  var el=document.getElementById("cdTime");
  el.textContent=(isOT?"+":"")+pad(h)+":"+pad(m)+":"+pad(s);
  el.classList.toggle("cd-overtime",isOT);
  el.classList.toggle("cd-blink",cd.paused);
  document.getElementById("btnPause").textContent=cd.paused?"\u25B6":"\u23F8";
  var bar=document.getElementById("cdBar");
  if(bar&&cd.totalMs>0){var elapsed=cd.totalMs-(cd.paused?cd.pausedRemaining:(cd.targetTime-Date.now()));var pct=isOT?100:Math.min(100,Math.max(0,(elapsed/cd.totalMs)*100));bar.style.width=pct+"%";if(isOT)bar.style.background="var(--danger)";}
  var ackBtn=document.getElementById("btnAck");
  if(isOT&&!cd.acknowledged&&ackBtn)ackBtn.style.display="";
  // Fire alarm
  if(!cd.paused&&!cd.expired&&cd.targetTime<=Date.now()){cd.expired=true;if(cd.playSound)playCdAlarm(cd.soundType);}
  // Sync state back to opener
  try{var oc=window.opener&&window.opener._countdowns?window.opener._countdowns.find(function(c){return c.id===cd.id}):null;if(oc){oc.targetTime=cd.targetTime;oc.paused=cd.paused;oc.pausedRemaining=cd.pausedRemaining;oc.expired=cd.expired;oc.acknowledged=cd.acknowledged;}}catch(e){}
}
document.getElementById("btnPause").onclick=function(){
  if(cd.paused){cd.targetTime=Date.now()+cd.pausedRemaining;cd.paused=false;}
  else{cd.pausedRemaining=cd.targetTime-Date.now();cd.paused=true;}
};
document.getElementById("btnReset").onclick=function(){
  cd.targetTime=Date.now()+cd.totalMs;cd.paused=false;cd.expired=false;cd.acknowledged=false;
  document.getElementById("btnAck").style.display="none";
};
document.getElementById("btnAck").onclick=function(){
  cd.acknowledged=true;document.getElementById("btnAck").style.display="none";
};
var cdSzCls=["cd-sz-xs","cd-sz-sm","cd-sz-md","cd-sz-lg","cd-sz-xl","cd-sz-xxl"];
var cdSzLbl=["XS","S","M","L","XL","XXL"];
document.getElementById("cdSizeSlider").oninput=function(){
  var v=parseInt(this.value,10);
  document.body.className=document.body.className.replace(/cd-sz-\S+/g,"").trim()+" "+cdSzCls[v];
  document.getElementById("cdSizeLbl").textContent=cdSzLbl[v];
};
// BroadcastChannel theme sync
try{var bc=new BroadcastChannel("tidslinjal-sync");bc.onmessage=function(e){if(e.data&&e.data.type==="theme"){document.body.className=document.body.className.replace(/theme-\S+/g,"").trim()+" theme-"+(e.data.theme||"dark");}};}catch(e){}
// Custom background color
document.body.style.background=window.__initData.bgColor;
// On window close: re-attach countdown to parent
window.addEventListener("beforeunload",function(){
  try{var oc=window.opener&&window.opener._countdowns?window.opener._countdowns.find(function(c){return c.id===cd.id}):null;if(oc){oc.detached=false;oc._detachedWin=null;window.opener.renderCountdowns();}}catch(e){}
});
setInterval(tick,200);tick();
