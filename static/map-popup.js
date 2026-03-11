'use strict';

/* ── Country name → capital city coordinates ── */
const COUNTRY_CAPITALS = {
  'afghanistan':[34.5553,69.2075],'albania':[41.3275,19.8187],'algeria':[36.7538,3.0588],
  'argentina':[-34.6037,-58.3816],'armenia':[40.1792,44.4991],'australia':[-35.2809,149.1300],
  'austria':[48.2082,16.3738],'azerbaijan':[40.4093,49.8671],'bangladesh':[23.8103,90.4125],
  'belarus':[53.9045,27.5615],'belgium':[50.8503,4.3517],'bolivia':[-16.4897,-68.1193],
  'bosnia':[43.8563,18.4131],'brazil':[-15.7975,-47.8919],'bulgaria':[42.6977,23.3219],
  'cambodia':[11.5564,104.9282],'cameroon':[3.8480,11.5021],'canada':[45.4215,-75.6972],
  'chile':[-33.4489,-70.6693],'china':[39.9042,116.4074],'colombia':[4.7110,-74.0721],
  'costa rica':[9.9281,-84.0907],'croatia':[45.8150,15.9819],'cuba':[23.1136,-82.3666],
  'cyprus':[35.1856,33.3823],'czech republic':[50.0755,14.4378],'czechia':[50.0755,14.4378],
  'denmark':[55.6761,12.5683],'ecuador':[-0.1807,-78.4678],'egypt':[30.0444,31.2357],
  'estonia':[59.4370,24.7536],'ethiopia':[9.0250,38.7469],'finland':[60.1699,24.9384],
  'france':[48.8566,2.3522],'georgia':[41.7151,44.8271],'germany':[52.5200,13.4050],
  'ghana':[5.6037,-0.1870],'greece':[37.9838,23.7275],'guatemala':[14.6349,-90.5069],
  'hungary':[47.4979,19.0402],'iceland':[64.1466,-21.9426],'india':[28.6139,77.2090],
  'indonesia':[-6.2088,106.8456],'iran':[35.6892,51.3890],'iraq':[33.3128,44.3615],
  'ireland':[53.3498,-6.2603],'israel':[31.7683,35.2137],'italy':[41.9028,12.4964],
  'japan':[35.6762,139.6503],'jordan':[31.9454,35.9284],'kazakhstan':[51.1694,71.4491],
  'kenya':[-1.2921,36.8219],'kosovo':[42.6629,21.1655],'kuwait':[29.3759,47.9774],
  'latvia':[56.9496,24.1052],'lebanon':[33.8938,35.5018],'libya':[32.8872,13.1913],
  'lithuania':[54.6872,25.2797],'luxembourg':[49.6116,6.1319],'malaysia':[3.1390,101.6869],
  'mali':[12.6392,-8.0029],'mexico':[19.4326,-99.1332],'moldova':[47.0105,28.8638],
  'mongolia':[47.8864,106.9057],'montenegro':[42.4304,19.2594],'morocco':[33.9716,-6.8498],
  'mozambique':[-25.9692,32.5732],'myanmar':[19.7633,96.0785],'nepal':[27.7172,85.3240],
  'netherlands':[52.3676,4.9041],'new zealand':[-41.2865,174.7762],'nicaragua':[12.1150,-86.2362],
  'niger':[13.5116,2.1254],'nigeria':[9.0579,7.4951],'north korea':[39.0392,125.7625],
  'north macedonia':[41.9981,21.4254],'norway':[59.9139,10.7522],'oman':[23.5880,58.3829],
  'pakistan':[33.6844,73.0479],'palestine':[31.9522,35.2332],'panama':[8.9824,-79.5199],
  'paraguay':[-25.2637,-57.5759],'peru':[-12.0464,-77.0428],'philippines':[14.5995,120.9842],
  'poland':[52.2297,21.0122],'portugal':[38.7223,-9.1393],'qatar':[25.2854,51.5310],
  'romania':[44.4268,26.1025],'russia':[55.7558,37.6173],'rwanda':[-1.9403,29.8739],
  'saudi arabia':[24.7136,46.6753],'senegal':[14.7167,-17.4677],'serbia':[44.7866,20.4489],
  'singapore':[1.3521,103.8198],'slovakia':[48.1486,17.1077],'slovenia':[46.0569,14.5058],
  'somalia':[2.0469,45.3182],'south africa':[-25.7479,28.2293],'south korea':[37.5665,126.9780],
  'spain':[40.4168,-3.7038],'sri lanka':[6.9271,79.8612],'sudan':[15.5007,32.5599],
  'sweden':[59.3293,18.0686],'switzerland':[46.9480,7.4474],'syria':[33.5138,36.2765],
  'taiwan':[25.0330,121.5654],'tajikistan':[38.5598,68.7740],'tanzania':[-6.7924,39.2083],
  'thailand':[13.7563,100.5018],'tunisia':[36.8065,10.1815],'turkey':[39.9334,32.8597],
  'turkmenistan':[37.9601,58.3261],'uganda':[0.3476,32.5825],'ukraine':[50.4501,30.5234],
  'united arab emirates':[24.4539,54.3773],'uae':[24.4539,54.3773],
  'united kingdom':[51.5074,-0.1278],'uk':[51.5074,-0.1278],'great britain':[51.5074,-0.1278],
  'united states':[38.9072,-77.0369],'usa':[38.9072,-77.0369],'us':[38.9072,-77.0369],
  'uruguay':[-34.9011,-56.1645],'uzbekistan':[41.2995,69.2401],'venezuela':[10.4806,-66.9036],
  'vietnam':[21.0278,105.8342],'yemen':[15.3694,44.1910],'zambia':[-15.3875,28.3228],
  'zimbabwe':[-17.8252,31.0335]
};

function resolveCountryCoords(locationStr) {
  if (!locationStr) return null;
  const lower = locationStr.trim().toLowerCase();
  // Direct country match
  if (COUNTRY_CAPITALS[lower]) return COUNTRY_CAPITALS[lower];
  // Try extracting last word after comma (e.g. "Paris, France")
  const parts = lower.split(',').map(s => s.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    if (COUNTRY_CAPITALS[parts[i]]) return COUNTRY_CAPITALS[parts[i]];
  }
  return null;
}

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
let _roomsLayer = null;
let _buildingsLayer = null;
let _computersLayer = null;
let _dataCentersLayer = null;
let _showRooms = false;
let _showBuildings = false;
let _showComputers = false;
let _showDataCenters = false;

/* ── Initialize map ── */
function initMapProjection() {
  _map = L.map('mapProjection', { zoomControl: true }).setView([51.505, -0.09], 4);
  setTileLayer('osm');

  // Meetings layer
  _meetingsLayer = L.layerGroup().addTo(_map);
  // Users layer
  _usersLayer = L.layerGroup().addTo(_map);
  // Resource layers
  _roomsLayer = L.layerGroup();
  _buildingsLayer = L.layerGroup();
  _computersLayer = L.layerGroup();
  _dataCentersLayer = L.layerGroup();

  loadMeetings();
  loadUsers();
  loadResourceLayers();
  updateLegend();

  // Poll for data updates every 30s
  setInterval(() => {
    loadMeetings();
    loadUsers();
    loadResourceLayers();
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
      let lat = u.latitude, lng = u.longitude;
      // Fallback: resolve generic country name to capital coordinates
      if ((!lat || !lng) && u.location) {
        const resolved = resolveCountryCoords(u.location);
        if (resolved) { lat = resolved[0]; lng = resolved[1]; }
      }
      if (lat && lng) {
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'user-marker',
            html: `<div style="background:var(--accent,#4a9eff);width:24px;height:24px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700">${(u.display_name||'?')[0]}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        });
        const locInfo = u.location ? '<br>' + escH(u.location) : '';
        marker.bindPopup(`<b>${escH(u.display_name)}</b><br>${escH(u.role||'')}${locInfo}<br>${(u.nato_designations||[]).join(', ')}`);
        marker.bindTooltip(u.display_name, { direction: 'top', offset: [0, -12] });
        _usersLayer.addLayer(marker);
      }
    });
  } catch(e) {}
}

/* ── Load resource layers (rooms, buildings, IT, data centers) ── */
async function loadResourceLayers() {
  try {
    const rooms = await fetch('/api/rooms').then(r => r.ok ? r.json() : []);
    const layerMap = {room: _roomsLayer, building: _buildingsLayer, computer_service: _computersLayer, data_center: _dataCentersLayer};
    const colorMap = {room: '#27ae60', building: '#8e44ad', computer_service: '#e67e22', data_center: '#2980b9'};
    const iconMap = {room: '🏠', building: '🏢', computer_service: '💻', data_center: '🖥'};
    Object.values(layerMap).forEach(l => l.clearLayers());
    (rooms || []).forEach(r => {
      if (!r.location) return;
      const coords = geocodeSync(r.location);
      if (!coords) return;
      const layer = layerMap[r.type] || _roomsLayer;
      const color = colorMap[r.type] || '#27ae60';
      const icon = iconMap[r.type] || '🏠';
      const marker = L.marker(coords, {
        icon: L.divIcon({
          className: 'resource-marker',
          html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px">${icon}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14]
        })
      });
      marker.bindPopup(`<b>${escH(r.name)}</b><br>${escH(r.type)}<br>${escH(r.location||'')}${r.capacity ? '<br>Capacity: '+r.capacity : ''}`);
      marker.bindTooltip(r.name, { direction: 'top', offset: [0, -14] });
      layer.addLayer(marker);
    });
    updateLegend();
  } catch(e) {}
}

function geocodeSync(location) {
  // Try to parse "lat,lng" format
  const parts = location.split(',').map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts;
  // Try country lookup
  const lower = location.toLowerCase().trim();
  if (COUNTRY_CAPITALS[lower]) return COUNTRY_CAPITALS[lower];
  return null;
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
    { color: '#D35400', label: _t('map_meetings_layer') || 'Meetings' },
    { color: '#4a9eff', label: _t('map_users_layer') || 'Users' },
    { color: '#27ae60', label: _t('map_rooms') || 'Rooms' },
    { color: '#8e44ad', label: _t('map_buildings') || 'Buildings' },
    { color: '#e67e22', label: _t('map_computer_services') || 'IT Services' },
    { color: '#2980b9', label: _t('map_data_centers') || 'Data Centers' },
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
  [_roomsLayer, _buildingsLayer, _computersLayer, _dataCentersLayer].forEach(layer => {
    if (layer) layer.eachLayer(l => { if (l.getLatLng) bounds.extend(l.getLatLng()); });
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

document.getElementById('btnRooms').addEventListener('click', function() {
  _showRooms = !_showRooms;
  this.classList.toggle('active', _showRooms);
  if (_showRooms) _map.addLayer(_roomsLayer); else _map.removeLayer(_roomsLayer);
});
document.getElementById('btnBuildings').addEventListener('click', function() {
  _showBuildings = !_showBuildings;
  this.classList.toggle('active', _showBuildings);
  if (_showBuildings) _map.addLayer(_buildingsLayer); else _map.removeLayer(_buildingsLayer);
});
document.getElementById('btnComputers').addEventListener('click', function() {
  _showComputers = !_showComputers;
  this.classList.toggle('active', _showComputers);
  if (_showComputers) _map.addLayer(_computersLayer); else _map.removeLayer(_computersLayer);
});
document.getElementById('btnDataCenters').addEventListener('click', function() {
  _showDataCenters = !_showDataCenters;
  this.classList.toggle('active', _showDataCenters);
  if (_showDataCenters) _map.addLayer(_dataCentersLayer); else _map.removeLayer(_dataCentersLayer);
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

/* ── Address search / geocoding ── */
let _searchMarker = null;

async function searchAddress(query) {
  if (!query || !query.trim()) return;
  query = query.trim();
  try {
    // Use Nominatim (OpenStreetMap) for geocoding — free, no API key required
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) { console.warn('Geocoding request failed:', res.status); return; }
    const data = await res.json();
    if (!data || data.length === 0) {
      alert('Address not found: ' + query);
      return;
    }
    const result = data[0];
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    // Remove previous search marker
    if (_searchMarker) _map.removeLayer(_searchMarker);

    // Add marker and zoom
    _searchMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: 'search-marker',
        html: '<div style="background:#E74C3C;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:12px;color:#fff;font-weight:700">📍</span></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 28]
      })
    }).addTo(_map);

    _searchMarker.bindPopup('<b>' + escH(result.display_name) + '</b>').openPopup();
    _map.setView([lat, lon], 15);
  } catch(e) {
    console.error('Geocoding error:', e);
  }
}

document.getElementById('btnSearch').addEventListener('click', function() {
  const q = document.getElementById('addressSearch')?.value;
  searchAddress(q);
});

document.getElementById('addressSearch').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    searchAddress(this.value);
  }
});
