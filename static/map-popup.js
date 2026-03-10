'use strict';

/* ── i18n: read translations from opener ── */
function _t(key) {
  try {
    const lang = window.opener?.state?.preferences?.language || 'en';
    const TR = window.opener?.TRANSLATIONS;
    if (TR && TR[lang] && TR[lang][key]) return TR[lang][key];
    if (TR && TR.en && TR.en[key]) return TR.en[key];
  } catch(e) {}
  const fb = {
    map_title:'Map Projection', map_tile_layer:'Tile Layer', map_layers:'Layers',
    map_import:'Import', map_meetings:'Meetings', map_users:'Users',
    map_fit_all:'Fit All', map_legend:'Legend', map_overlays:'Overlays',
    map_import_title:'Import GeoJSON / KML', map_cancel:'Cancel',
    map_osm:'OpenStreetMap', map_topo:'Topographic', map_satellite:'Satellite',
    map_dark:'Dark', map_meetings_layer:'Physical Meetings', map_users_layer:'User Locations'
  };
  return fb[key] || key;
}

/* ── Theme sync ── */
const _themeClasses = ['theme-dark','theme-light','theme-city-camo','theme-urban-camo'];
function syncTheme() {
  try {
    const t = window.opener?.state?.preferences?.theme || 'dark';
    _themeClasses.forEach(c => document.body.classList.remove(c));
    document.body.classList.add('theme-' + t);
  } catch(e) {}
}

/* ── Language sync ── */
let _lastLang = '';
function syncLanguage() {
  try {
    const lang = window.opener?.state?.preferences?.language || 'en';
    if (lang === _lastLang) return;
    _lastLang = lang;
    document.title = 'Tidslinjal \u2014 ' + _t('map_title');
    const hdr = document.querySelector('.page-header');
    if (hdr) hdr.textContent = 'Tidslinjal \u2014 ' + _t('map_title');
    const lbl = document.getElementById('lblTileLayer');
    if (lbl) lbl.textContent = _t('map_tile_layer');
    const btn = (id, key) => { const b = document.getElementById(id); if (b) b.textContent = _t(key); };
    btn('btnLayers', 'map_layers');
    btn('btnImport', 'map_import');
    btn('btnMeetings', 'map_meetings');
    btn('btnUsers', 'map_users');
    btn('btnFitAll', 'map_fit_all');
    // Tile layer options
    const sel = document.getElementById('selTileLayer');
    if (sel) {
      sel.options[0].text = _t('map_osm');
      sel.options[1].text = _t('map_topo');
      sel.options[2].text = _t('map_satellite');
      sel.options[3].text = _t('map_dark');
    }
    const leg = document.querySelector('.map-legend h4');
    if (leg) leg.textContent = _t('map_legend');
    const ovr = document.querySelector('.map-layers h4');
    if (ovr) ovr.textContent = _t('map_overlays');
  } catch(e) {}
}

/* ── Tile layer definitions ── */
const TILE_LAYERS = {
  osm: { url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  topo: { url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr:'&copy; OpenTopoMap' },
  satellite: { url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr:'&copy; Esri' },
  dark: { url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr:'&copy; CartoDB' }
};

/* ── State ── */
let _map = null;
let _tileLayer = null;
let _meetingsLayer = null;
let _usersLayer = null;
let _importedLayers = [];
let _showMeetings = true;
let _showUsers = true;

/* ── Initialize map ── */
function initMapProjection() {
  _map = L.map('mapProjection', { zoomControl: true }).setView([51.505, -0.09], 4);
  setTileLayer('osm');

  // Meetings layer
  _meetingsLayer = L.layerGroup().addTo(_map);
  // Users layer
  _usersLayer = L.layerGroup().addTo(_map);

  loadMeetings();
  loadUsers();
  updateLegend();

  // Poll for data updates every 30s
  setInterval(() => {
    loadMeetings();
    loadUsers();
  }, 30000);
}

function setTileLayer(key) {
  const def = TILE_LAYERS[key] || TILE_LAYERS.osm;
  if (_tileLayer) _map.removeLayer(_tileLayer);
  _tileLayer = L.tileLayer(def.url, { attribution: def.attr, maxZoom: 19 }).addTo(_map);
}

/* ── Load physical meeting events ── */
function loadMeetings() {
  try {
    const events = window.opener?.state?.events;
    if (!events) return;
    _meetingsLayer.clearLayers();
    events.forEach(ev => {
      if (ev.latitude && ev.longitude) {
        const color = ev.color || '#D35400';
        const marker = L.circleMarker([ev.latitude, ev.longitude], {
          radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.8
        });
        const popupHtml = `<b>${escH(ev.title)}</b><br>` +
          (ev.physical_location ? escH(ev.physical_location) + '<br>' : '') +
          (ev.start_time ? new Date(ev.start_time).toLocaleString() : '');
        marker.bindPopup(popupHtml);
        marker.bindTooltip(ev.title, { direction: 'top', offset: [0, -8] });
        _meetingsLayer.addLayer(marker);
      }
    });
  } catch(e) {}
}

/* ── Load user locations ── */
function loadUsers() {
  try {
    const users = window.opener?.state?.users;
    if (!users) return;
    _usersLayer.clearLayers();
    users.forEach(u => {
      // Users with location data (if available via profile or device reporting)
      if (u.latitude && u.longitude) {
        const marker = L.marker([u.latitude, u.longitude], {
          icon: L.divIcon({
            className: 'user-marker',
            html: `<div style="background:var(--accent,#4a9eff);width:24px;height:24px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700">${(u.display_name||'?')[0]}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        });
        marker.bindPopup(`<b>${escH(u.display_name)}</b><br>${escH(u.role||'')}<br>${(u.nato_designations||[]).join(', ')}`);
        marker.bindTooltip(u.display_name, { direction: 'top', offset: [0, -12] });
        _usersLayer.addLayer(marker);
      }
    });
  } catch(e) {}
}

/* ── Import GeoJSON / KML ── */
function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = e.target.result;
    try {
      if (file.name.endsWith('.kml')) {
        importKML(data);
      } else {
        const geojson = JSON.parse(data);
        const layer = L.geoJSON(geojson, {
          style: { color: '#4a9eff', weight: 2, fillOpacity: 0.2 },
          pointToLayer: function(f, ll) {
            return L.circleMarker(ll, { radius: 6, fillColor: '#4a9eff', color: '#fff', weight: 1, fillOpacity: 0.8 });
          },
          onEachFeature: function(feature, layer) {
            if (feature.properties) {
              const name = feature.properties.name || feature.properties.Name || '';
              const desc = feature.properties.description || feature.properties.Description || '';
              if (name || desc) layer.bindPopup(`<b>${escH(name)}</b><br>${escH(desc)}`);
            }
          }
        }).addTo(_map);
        _importedLayers.push({ name: file.name, layer: layer });
        _map.fitBounds(layer.getBounds());
        updateLayersPanel();
      }
    } catch(err) {
      alert('Failed to parse file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/* ── KML import (basic) ── */
function importKML(kmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'text/xml');
  const placemarks = doc.querySelectorAll('Placemark');
  const geojsonFeatures = [];

  placemarks.forEach(pm => {
    const name = pm.querySelector('name')?.textContent || '';
    const desc = pm.querySelector('description')?.textContent || '';
    const point = pm.querySelector('Point coordinates');
    const lineStr = pm.querySelector('LineString coordinates');
    const polygon = pm.querySelector('Polygon outerBoundaryIs LinearRing coordinates');

    if (point) {
      const [lng, lat] = point.textContent.trim().split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        geojsonFeatures.push({ type:'Feature', properties:{name,description:desc},
          geometry:{type:'Point', coordinates:[lng,lat]} });
      }
    }
    if (lineStr) {
      const coords = parseKMLCoords(lineStr.textContent);
      if (coords.length > 0) {
        geojsonFeatures.push({ type:'Feature', properties:{name,description:desc},
          geometry:{type:'LineString', coordinates:coords} });
      }
    }
    if (polygon) {
      const coords = parseKMLCoords(polygon.textContent);
      if (coords.length > 0) {
        geojsonFeatures.push({ type:'Feature', properties:{name,description:desc},
          geometry:{type:'Polygon', coordinates:[coords]} });
      }
    }
  });

  if (geojsonFeatures.length === 0) {
    alert('No features found in KML file');
    return;
  }

  const geojson = { type:'FeatureCollection', features:geojsonFeatures };
  const layer = L.geoJSON(geojson, {
    style: { color: '#e67e22', weight: 2, fillOpacity: 0.2 },
    pointToLayer: function(f, ll) {
      return L.circleMarker(ll, { radius: 6, fillColor: '#e67e22', color: '#fff', weight: 1, fillOpacity: 0.8 });
    },
    onEachFeature: function(feature, layer) {
      if (feature.properties) {
        const n = feature.properties.name || '';
        const d = feature.properties.description || '';
        if (n || d) layer.bindPopup(`<b>${escH(n)}</b><br>${escH(d)}`);
      }
    }
  }).addTo(_map);
  _importedLayers.push({ name: 'KML Import', layer: layer });
  _map.fitBounds(layer.getBounds());
  updateLayersPanel();
}

function parseKMLCoords(text) {
  return text.trim().split(/\s+/).map(s => {
    const parts = s.split(',').map(Number);
    return [parts[0], parts[1]]; // [lng, lat]
  }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
}

/* ── Legend ── */
function updateLegend() {
  const el = document.getElementById('legendContent');
  if (!el) return;
  el.innerHTML = '';
  const items = [
    { color: '#D35400', label: _t('map_meetings_layer') },
    { color: '#4a9eff', label: _t('map_users_layer') },
  ];
  _importedLayers.forEach(il => {
    items.push({ color: '#e67e22', label: il.name });
  });
  items.forEach(it => {
    el.innerHTML += `<div class="legend-item"><span class="legend-dot" style="background:${it.color}"></span>${escH(it.label)}</div>`;
  });
}

/* ── Layers panel ── */
function updateLayersPanel() {
  const el = document.getElementById('layersList');
  if (!el) return;
  el.innerHTML = '';
  _importedLayers.forEach((il, idx) => {
    const div = document.createElement('div');
    div.className = 'layer-toggle';
    div.innerHTML = `<input type="checkbox" checked data-layer-idx="${idx}"><span>${escH(il.name)}</span>`;
    div.querySelector('input').addEventListener('change', function() {
      if (this.checked) _map.addLayer(il.layer);
      else _map.removeLayer(il.layer);
    });
    el.appendChild(div);
  });
  updateLegend();
}

/* ── Fit all markers ── */
function fitAll() {
  const bounds = L.latLngBounds([]);
  _meetingsLayer.eachLayer(l => {
    if (l.getLatLng) bounds.extend(l.getLatLng());
  });
  _usersLayer.eachLayer(l => {
    if (l.getLatLng) bounds.extend(l.getLatLng());
  });
  _importedLayers.forEach(il => {
    try { bounds.extend(il.layer.getBounds()); } catch(e) {}
  });
  if (bounds.isValid()) _map.fitBounds(bounds, { padding: [40, 40] });
}

/* ── Escape HTML ── */
function escH(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Event bindings ── */
document.getElementById('selTileLayer').addEventListener('change', function() {
  setTileLayer(this.value);
});

document.getElementById('btnLayers').addEventListener('click', function() {
  document.getElementById('mapLayersPanel').classList.toggle('open');
});

document.getElementById('btnImport').addEventListener('click', function() {
  document.getElementById('importOverlay').classList.add('open');
});

document.getElementById('btnDoImport').addEventListener('click', function() {
  const file = document.getElementById('importFile').files[0];
  if (file) importFile(file);
  document.getElementById('importOverlay').classList.remove('open');
});

document.getElementById('btnCancelImport').addEventListener('click', function() {
  document.getElementById('importOverlay').classList.remove('open');
});

document.getElementById('btnMeetings').addEventListener('click', function() {
  _showMeetings = !_showMeetings;
  this.classList.toggle('active', _showMeetings);
  if (_showMeetings) _map.addLayer(_meetingsLayer);
  else _map.removeLayer(_meetingsLayer);
});

document.getElementById('btnUsers').addEventListener('click', function() {
  _showUsers = !_showUsers;
  this.classList.toggle('active', _showUsers);
  if (_showUsers) _map.addLayer(_usersLayer);
  else _map.removeLayer(_usersLayer);
});

document.getElementById('btnFitAll').addEventListener('click', fitAll);

// Set initial active state
document.getElementById('btnMeetings').classList.add('active');
document.getElementById('btnUsers').classList.add('active');

/* ── Init ── */
syncTheme();
syncLanguage();
initMapProjection();

// Poll for theme/language changes
setInterval(function() { syncTheme(); syncLanguage(); }, 2000);
