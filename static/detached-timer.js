'use strict';
var tm = window.__initData.tm;
var timerColor = window.__initData.timerColor;
function pad(n){return String(n).padStart(2,"0");}
function fmtMs(ms){var s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60,cs=Math.floor((ms%1000)/10);return pad(h)+":"+pad(m)+":"+pad(sec)+"."+pad(cs);}
function tick(){
  var elapsed=tm.paused?tm.pausedElapsed:(Date.now()-tm.startTime);
  var isOver=tm.targetMs>0&&elapsed>=tm.targetMs;
  var displayMs=(isOver&&!tm.continueAfter)?tm.targetMs:elapsed;
  var ts=Math.floor(displayMs/1000),h=Math.floor(ts/3600),m=Math.floor((ts%3600)/60),s=ts%60;
  var el=document.getElementById("tmTime");
  el.textContent=pad(h)+":"+pad(m)+":"+pad(s);
  el.classList.toggle("tm-blink",tm.paused);
  if(isOver)el.style.color="var(--danger)";else el.style.color="";
  if(tm.targetMs>0){
    var bar=document.getElementById("tmBar");
    if(bar){bar.style.width=Math.min(100,(elapsed/tm.targetMs)*100)+"%";if(isOver)bar.style.background="var(--danger)";}
    document.body.classList.toggle("tm-overtime",isOver);
  }
  document.getElementById("btnPause").textContent=tm.paused?"\u25B6":"\u23F8";
  // Sync state back to opener if available
  try{var ot=window.opener&&window.opener._timers?window.opener._timers.find(function(t){return t.id===tm.id}):null;if(ot){ot.startTime=tm.startTime;ot.paused=tm.paused;ot.pausedElapsed=tm.pausedElapsed;ot.alarmFired=tm.alarmFired;ot.laps=tm.laps;ot.lastLapTime=tm.lastLapTime;ot.targetMs=tm.targetMs;}}catch(e){}
  // Fire alarm
  if(isOver&&!tm.alarmFired){tm.alarmFired=true;if(tm.playSound)try{window.opener.playCdAlarm(tm.soundType)}catch(e){}}
  // Stop at target
  if(isOver&&!tm.continueAfter&&!tm.paused){tm.pausedElapsed=tm.targetMs;tm.paused=true;}
}
document.getElementById("btnPause").onclick=function(){
  if(tm.paused){tm.startTime=Date.now()-tm.pausedElapsed;tm.paused=false;}
  else{tm.pausedElapsed=Date.now()-tm.startTime;tm.paused=true;}
};
document.getElementById("btnReset").onclick=function(){
  tm.startTime=Date.now();tm.paused=false;tm.pausedElapsed=0;tm.alarmFired=false;tm.laps=[];tm.lastLapTime=tm.startTime;renderLaps();
};
document.getElementById("btnLap").onclick=function(){
  if(tm.paused)return;
  var now=Date.now(),totalMs=now-tm.startTime,splitMs=now-tm.lastLapTime;
  tm.laps.push({num:tm.laps.length+1,splitMs:splitMs,totalMs:totalMs});
  tm.lastLapTime=now;
  renderLaps();
};
function renderLaps(){
  var area=document.getElementById("lapArea");if(!area)return;
  if(tm.laps.length===0){area.innerHTML="";return;}
  var h='<div class="lap-list">';
  tm.laps.forEach(function(l){h+='<div class="lap-row"><span class="lap-num">#'+l.num+'</span><span class="lap-split">'+fmtMs(l.splitMs)+'</span><span class="lap-total">'+fmtMs(l.totalMs)+'</span></div>';});
  h+="</div>";
  h+='<div class="lap-export"><button id="btnCsv">CSV</button><button id="btnPrint">Print</button></div>';
  area.innerHTML=h;
  document.getElementById("btnCsv").onclick=function(){var csv="Lap,Split,Total\n";tm.laps.forEach(function(l){csv+=l.num+","+fmtMs(l.splitMs)+","+fmtMs(l.totalMs)+"\n";});var b=new Blob([csv],{type:"text/csv"});var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=(tm.label||"timer")+"-laps.csv";a.click();};
  document.getElementById("btnPrint").onclick=function(){var pw=window.open("","","width=400,height=500");if(!pw)return;var ph="<html><head><title>Laps</title><style>body{font-family:monospace;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 8px;text-align:right}th{background:#eee}</style></head><body><h2>"+tm.label+" — Lap Times</h2><table><tr><th>#</th><th>Split</th><th>Total</th></tr>";tm.laps.forEach(function(l){ph+="<tr><td>"+l.num+"</td><td>"+fmtMs(l.splitMs)+"</td><td>"+fmtMs(l.totalMs)+"</td></tr>";});ph+="</table></body></html>";pw.document.write(ph);pw.document.close();pw.print();};
}
// Scroll to adjust target on progress bar
var pw=document.getElementById("tmProgressWrap");
if(pw)pw.addEventListener("wheel",function(e){e.preventDefault();var delta=e.deltaY<0?60000:-60000;tm.targetMs=Math.max(10000,tm.targetMs+delta);tm.alarmFired=false;},{passive:false});
// Size slider
var tmSzCls=["tm-sz-xs","tm-sz-sm","tm-sz-md","tm-sz-lg","tm-sz-xl","tm-sz-xxl"];
var tmSzLbl=["XS","S","M","L","XL","XXL"];
document.getElementById("tmSizeSlider").oninput=function(){
  var v=parseInt(this.value,10);
  document.body.className=document.body.className.replace(/tm-sz-\S+/g,"").trim()+" "+tmSzCls[v];
  document.getElementById("tmSizeLbl").textContent=tmSzLbl[v];
};
// BroadcastChannel theme sync
try{var bc=new BroadcastChannel("tidslinjal-sync");bc.onmessage=function(e){if(e.data&&e.data.type==="theme"){document.body.className=document.body.className.replace(/theme-\S+/g,"").trim()+" theme-"+(e.data.theme||"dark");}};}catch(e){}
// Custom background color
document.body.style.background=window.__initData.bgColor;
// On window close: re-attach timer to parent
window.addEventListener("beforeunload",function(){
  try{var ot=window.opener&&window.opener._timers?window.opener._timers.find(function(t){return t.id===tm.id}):null;if(ot){ot.detached=false;ot._detachedWin=null;window.opener.renderTimers();}}catch(e){}
});
renderLaps();
setInterval(tick,200);tick();
