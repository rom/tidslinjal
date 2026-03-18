'use strict';
var utc = window.__initData.utc;
function p(n){return String(n).padStart(2,"0");}
setInterval(function(){var n=new Date();var h,m,s,tz,d;
if(utc){h=n.getUTCHours();m=n.getUTCMinutes();s=n.getUTCSeconds();tz="UTC/Z";d=n.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"});}
else{h=n.getHours();m=n.getMinutes();s=n.getSeconds();tz="Local";d=n.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});}
document.getElementById("t").textContent=p(h)+":"+p(m)+":"+p(s);
document.getElementById("d").textContent=d;document.getElementById("z").textContent=tz;},1000);
try{var bc=new BroadcastChannel("tidslinjal-sync");bc.onmessage=function(e){if(e.data&&e.data.type==="theme")document.body.className="theme-"+(e.data.theme||"dark")};}catch(e){}
