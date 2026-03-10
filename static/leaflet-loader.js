/* Leaflet lazy-loader — loads self-hosted Leaflet JS on first use */
window._leafletLoaded = false;
function loadLeaflet(cb) {
  if (window._leafletLoaded && window.L) { cb(); return; }
  if (document.getElementById('leaflet-script')) {
    var check = setInterval(function () {
      if (window.L) { clearInterval(check); window._leafletLoaded = true; cb(); }
    }, 100);
    return;
  }
  var s = document.createElement('script');
  s.id = 'leaflet-script';
  s.src = '/static/vendor/leaflet.js';
  s.onload = function () { window._leafletLoaded = true; cb(); };
  document.head.appendChild(s);
}
