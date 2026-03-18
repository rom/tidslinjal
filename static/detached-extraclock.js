'use strict';
var tz = window.__initData.timezone;
function p(n){return String(n).padStart(2,"0");}
setInterval(function(){var n=new Date();try{
var h=parseInt(n.toLocaleTimeString("en-GB",{hour:"2-digit",hour12:false,timeZone:tz}),10)||0;
var m=parseInt(n.toLocaleTimeString("en-GB",{minute:"2-digit",hour12:false,timeZone:tz}),10)||0;
var s=parseInt(n.toLocaleTimeString("en-GB",{second:"2-digit",hour12:false,timeZone:tz}),10)||0;
document.getElementById("t").textContent=p(h)+":"+p(m)+":"+p(s);
var tzl=n.toLocaleTimeString("en-GB",{timeZoneName:"short",timeZone:tz}).split(" ").pop();
document.getElementById("z").textContent=tzl;}catch(e){document.getElementById("t").textContent="??:??:??";}},1000);
try{var bc=new BroadcastChannel("tidslinjal-sync");bc.onmessage=function(e){if(e.data&&e.data.type==="theme")document.body.className="theme-"+(e.data.theme||"dark")};}catch(e){}
