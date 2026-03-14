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
    var op = getOpener();
    const lang = op?.state?.preferences?.language || 'en';
    const TR = op?.TRANSLATIONS;
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
    var op = getOpener();
    const t = op?.state?.preferences?.theme || 'dark';
    _themeClasses.forEach(c => document.body.classList.remove(c));
    document.body.classList.add('theme-' + t);
  } catch(e) {}
}

/* ── Language sync ── */
let _lastLang = '';
function syncLanguage() {
  try {
    var op = getOpener();
    const lang = op?.state?.preferences?.language || 'en';
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

/* ── Safe opener access ── */
function getOpener() {
  try { return window.opener && !window.opener.closed ? window.opener : null; } catch(e) { return null; }
}

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
let _showRooms = true;
let _showBuildings = true;
let _showComputers = true;
let _showDataCenters = true;

/* ── Map resource / overlay state ── */
let _mapResources = [];
let _currentMapResourceId = '';  // '' = OSM live
let _currentMapResource = null;
let _imageOverlayLayer = null;
let _geojsonOverlayLayer = null;
let _overlayItemsLayer = null;   // Leaflet layer group for overlay items
let _currentOverlay = null;
let _isImageMap = false;
let _originalCRS = null;

/* ── Initialize map ── */
function initMapProjection() {
  _map = L.map('mapProjection', { zoomControl: true }).setView([51.505, -0.09], 4);
  setTileLayer('osm');

  // Meetings layer
  _meetingsLayer = L.layerGroup().addTo(_map);
  // Users layer
  _usersLayer = L.layerGroup().addTo(_map);
  // Resource layers — added to map by default
  _roomsLayer = L.layerGroup().addTo(_map);
  _buildingsLayer = L.layerGroup().addTo(_map);
  _computersLayer = L.layerGroup().addTo(_map);
  _dataCentersLayer = L.layerGroup().addTo(_map);

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
async function loadMeetings() {
  try {
    var op = getOpener();
    var events = op?.state?.events;
    // Fallback to API if opener is not available
    if (!events) {
      try {
        const res = await fetch('/api/events');
        if (res.ok) events = await res.json();
      } catch(e) {}
    }
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
async function loadUsers() {
  try {
    var op = getOpener();
    var users = op?.state?.users;
    // Fallback to API if opener is not available
    if (!users) {
      try {
        const res = await fetch('/api/users');
        if (res.ok) users = await res.json();
      } catch(e) {}
    }
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
    const iconMap = {room: '🏠', building: '🏢', computer_service: '💻', data_center: '🖥', vehicle: '🚗', equipment: '🔧'};
    Object.values(layerMap).forEach(l => l.clearLayers());
    (rooms || []).forEach(r => {
      if (!r.location) return;
      const coords = geocodeSync(r.location);
      if (!coords) return;
      const layer = layerMap[r.type] || _roomsLayer;
      const color = colorMap[r.type] || '#27ae60';
      const icon = r.icon || iconMap[r.type] || '🏠';
      const markerHtml = r.image_name
        ? `<div style="width:32px;height:32px;border-radius:50%;border:2px solid ${color};overflow:hidden"><img src="/api/rooms/${r.id}/image" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px">${icon}</div>`;
      const marker = L.marker(coords, {
        icon: L.divIcon({
          className: 'resource-marker',
          html: markerHtml,
          iconSize: [32, 32], iconAnchor: [16, 16]
        })
      });
      const popupImg = r.image_name ? `<img src="/api/rooms/${r.id}/image" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;margin-bottom:4px">` : '';
      marker.bindPopup(`${popupImg}<b>${icon} ${escH(r.name)}</b><br>${escH(r.type)}<br>${escH(r.location||'')}${r.capacity ? '<br>Capacity: '+r.capacity : ''}${r.description ? '<br><em>'+escH(r.description)+'</em>' : ''}`);
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

// Set initial active state for all layers
document.getElementById('btnMeetings').classList.add('active');
document.getElementById('btnUsers').classList.add('active');
document.getElementById('btnRooms').classList.add('active');
document.getElementById('btnBuildings').classList.add('active');
document.getElementById('btnComputers').classList.add('active');
document.getElementById('btnDataCenters').classList.add('active');

/* ── BroadcastChannel theme sync ── */
try {
  var _mapBC = new BroadcastChannel('tidslinjal-sync');
  _mapBC.onmessage = function(e) {
    if (e.data && e.data.type === 'theme') {
      _themeClasses.forEach(c => document.body.classList.remove(c));
      document.body.classList.add('theme-' + (e.data.theme || 'dark'));
    }
  };
} catch(e) {}

/* ── Multi-map tabs ── */
let _openMaps = [{ id: '', label: '🗺 OSM' }]; // tabs currently open
let _activeTabId = '';

function _renderMapTabs() {
  const container = document.getElementById('mapTabs');
  if (!container) return;
  container.innerHTML = '';
  _openMaps.forEach(tab => {
    const div = document.createElement('div');
    div.className = 'map-tab' + (tab.id === _activeTabId ? ' active' : '');
    div.dataset.mapId = tab.id;
    div.title = tab.label;
    div.innerHTML = escH(tab.label) +
      '<span class="tab-detach" data-detach-tab="' + tab.id + '" title="' + (_t('map_detach_tab') || 'Detach to new window') + '"> ⧉</span>' +
      (tab.id ? '<span class="tab-close" data-close-tab="' + tab.id + '"> ×</span>' : '');
    div.addEventListener('click', (e) => {
      if (e.target.dataset.closeTab !== undefined) return;
      if (e.target.dataset.detachTab !== undefined) return;
      _activeTabId = tab.id;
      switchMap(tab.id);
      _renderMapTabs();
    });
    const detachBtn = div.querySelector('[data-detach-tab]');
    if (detachBtn) {
      detachBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _detachMapTab(tab);
      });
    }
    const closeBtn = div.querySelector('[data-close-tab]');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _openMaps = _openMaps.filter(t => t.id !== tab.id);
        if (_activeTabId === tab.id) {
          _activeTabId = _openMaps.length > 0 ? _openMaps[0].id : '';
          switchMap(_activeTabId);
        }
        _renderMapTabs();
      });
    }
    container.appendChild(div);
  });
}

// Override map selector to open new tabs instead of replacing
document.getElementById('mapSelector').removeEventListener('change', function(){});
document.getElementById('mapSelector').addEventListener('change', function() {
  const mapId = this.value;
  // Add tab if not already open
  if (!_openMaps.find(t => t.id === String(mapId))) {
    const mr = (_mapResources || []).find(m => String(m.id) === String(mapId));
    _openMaps.push({ id: String(mapId), label: mr ? mr.name : 'Map' });
  }
  _activeTabId = String(mapId);
  switchMap(mapId);
  _renderMapTabs();
});

/* ── Detach a map tab into its own window ── */
function _detachMapTab(tab) {
  const w = Math.min(window.screen.availWidth, 900);
  const h = Math.min(window.screen.availHeight - 100, 650);
  const mapUrl = '/static/map-popup.html' + (tab.id ? '?mapId=' + encodeURIComponent(tab.id) : '');
  window.open(mapUrl, 'tidslinjal-map-' + (tab.id || 'osm'),
    'width=' + w + ',height=' + h + ',resizable=yes,scrollbars=yes');
}

/* ── On load: check URL params for specific map to show ── */
(function() {
  const params = new URLSearchParams(window.location.search);
  const mapId = params.get('mapId');
  if (mapId) {
    // Wait for map resources to load, then switch to the specified map
    const _waitAndSwitch = setInterval(() => {
      if (typeof switchMap === 'function' && _map) {
        clearInterval(_waitAndSwitch);
        _activeTabId = mapId;
        switchMap(mapId);
        _renderMapTabs();
      }
    }, 200);
    setTimeout(() => clearInterval(_waitAndSwitch), 10000);
  }
})();

/* ── Legend toggle ── */
let _legendVisible = true;
document.getElementById('btnToggleLegend').addEventListener('click', function() {
  _legendVisible = !_legendVisible;
  const legend = document.getElementById('mapLegend');
  if (legend) legend.style.display = _legendVisible ? '' : 'none';
  this.classList.toggle('active', _legendVisible);
});

/* ── Legend drag-to-reposition ── */
(function() {
  const legend = document.getElementById('mapLegend');
  if (!legend) return;
  let _dragOffsetX = 0, _dragOffsetY = 0, _dragging = false;
  legend.addEventListener('mousedown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    _dragging = true;
    legend.classList.add('dragging');
    const rect = legend.getBoundingClientRect();
    _dragOffsetX = e.clientX - rect.left;
    _dragOffsetY = e.clientY - rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!_dragging) return;
    legend.style.left = (e.clientX - _dragOffsetX) + 'px';
    legend.style.top = (e.clientY - _dragOffsetY) + 'px';
    legend.style.right = 'auto';
    legend.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', function() {
    if (_dragging) {
      _dragging = false;
      legend.classList.remove('dragging');
    }
  });
})();

/* ── Enhanced zoom for image maps ── */
function _enhanceZoom() {
  if (!_map) return;
  // Allow more zoom levels for image maps
  if (_isImageMap) {
    _map.setMinZoom(-3);
    _map.setMaxZoom(8);
  }
}

/* ── PDF controls ── */
let _pdfScale = 1;
document.getElementById('pdfZoomIn').addEventListener('click', function() {
  _pdfScale = Math.min(_pdfScale + 0.25, 4);
  _applyPdfZoom();
});
document.getElementById('pdfZoomOut').addEventListener('click', function() {
  _pdfScale = Math.max(_pdfScale - 0.25, 0.25);
  _applyPdfZoom();
});
document.getElementById('pdfFitWidth').addEventListener('click', function() {
  _pdfScale = 1;
  _applyPdfZoom();
});
document.getElementById('pdfOpenNew').addEventListener('click', function() {
  const frame = document.getElementById('pdfFrame');
  if (frame && frame.src) window.open(frame.src, '_blank');
});
function _applyPdfZoom() {
  const frame = document.getElementById('pdfFrame');
  if (frame) {
    frame.style.transform = 'scale(' + _pdfScale + ')';
    frame.style.transformOrigin = 'top left';
    frame.style.width = (100 / _pdfScale) + '%';
    frame.style.height = (100 / _pdfScale) + '%';
  }
}

/* ── Drawing tools state ── */
let _drawMode = null; // null | 'pen' | 'line' | 'rect' | 'circle' | 'highlight' | 'needle' | 'symbol' | 'erase'
let _drawingsLayer = null; // L.layerGroup for drawings
let _drawHistory = []; // for undo
let _drawColor = '#FF0000';
let _drawWidth = 3;
let _tempDrawPath = null;
let _drawStart = null;
let _isDrawing = false;

function _initDrawingLayer() {
  if (!_drawingsLayer) {
    _drawingsLayer = L.layerGroup().addTo(_map);
  }
}

document.getElementById('btnToggleDraw').addEventListener('click', function() {
  const toolbar = document.getElementById('drawToolbar');
  const vis = toolbar.style.display === 'none';
  toolbar.style.display = vis ? 'flex' : 'none';
  this.classList.toggle('active', vis);
  if (!vis) _setDrawMode(null);
});

function _setDrawMode(mode) {
  _drawMode = mode;
  ['btnDrawPen','btnDrawLine','btnDrawRect','btnDrawCircle','btnDrawHighlight','btnDropNeedle','btnDropSymbol','btnDrawErase'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', false);
  });
  const modeMap = { pen:'btnDrawPen', line:'btnDrawLine', rect:'btnDrawRect', circle:'btnDrawCircle',
    highlight:'btnDrawHighlight', needle:'btnDropNeedle', symbol:'btnDropSymbol', erase:'btnDrawErase' };
  if (mode && modeMap[mode]) document.getElementById(modeMap[mode])?.classList.add('active');

  // Toggle map dragging
  if (_map) {
    if (mode && mode !== 'erase') {
      _map.dragging.disable();
      document.getElementById('mapProjection').style.cursor = 'crosshair';
    } else {
      _map.dragging.enable();
      document.getElementById('mapProjection').style.cursor = '';
    }
  }
}

document.getElementById('btnDrawPen').addEventListener('click', () => _setDrawMode(_drawMode === 'pen' ? null : 'pen'));
document.getElementById('btnDrawLine').addEventListener('click', () => _setDrawMode(_drawMode === 'line' ? null : 'line'));
document.getElementById('btnDrawRect').addEventListener('click', () => _setDrawMode(_drawMode === 'rect' ? null : 'rect'));
document.getElementById('btnDrawCircle').addEventListener('click', () => _setDrawMode(_drawMode === 'circle' ? null : 'circle'));
document.getElementById('btnDrawHighlight').addEventListener('click', () => _setDrawMode(_drawMode === 'highlight' ? null : 'highlight'));
document.getElementById('btnDropNeedle').addEventListener('click', () => _setDrawMode(_drawMode === 'needle' ? null : 'needle'));
document.getElementById('btnDropSymbol').addEventListener('click', () => _setDrawMode(_drawMode === 'symbol' ? null : 'symbol'));
document.getElementById('btnDrawErase').addEventListener('click', () => _setDrawMode(_drawMode === 'erase' ? null : 'erase'));
document.getElementById('btnDrawOff').addEventListener('click', () => _setDrawMode(null));
document.getElementById('drawColor').addEventListener('input', function() { _drawColor = this.value; });
document.getElementById('drawWidth').addEventListener('input', function() { _drawWidth = parseInt(this.value, 10); });

document.getElementById('btnDrawUndo').addEventListener('click', function() {
  if (_drawHistory.length === 0) return;
  const last = _drawHistory.pop();
  if (_drawingsLayer) _drawingsLayer.removeLayer(last);
  _saveDrawings();
});

// Drawing event handlers on the map
function _initDrawEvents() {
  _initDrawingLayer();
  let penPoints = [];

  _map.on('mousedown', function(e) {
    if (!_drawMode) return;
    _isDrawing = true;
    _drawStart = e.latlng;

    if (_drawMode === 'pen' || _drawMode === 'highlight') {
      penPoints = [e.latlng];
      const opts = { color: _drawColor, weight: _drawMode === 'highlight' ? _drawWidth * 3 : _drawWidth, opacity: _drawMode === 'highlight' ? 0.4 : 1 };
      _tempDrawPath = L.polyline(penPoints, opts).addTo(_drawingsLayer);
    }
    if (_drawMode === 'needle') {
      const marker = L.marker(e.latlng, {
        icon: L.divIcon({
          className: 'draw-pin',
          html: '<div style="font-size:24px;text-shadow:0 1px 3px rgba(0,0,0,.5)">📌</div>',
          iconSize: [24, 24], iconAnchor: [4, 24]
        })
      });
      marker.addTo(_drawingsLayer);
      marker.on('click', function() {
        if (_drawMode === 'erase') { _drawingsLayer.removeLayer(marker); _saveDrawings(); }
      });
      _drawHistory.push(marker);
      _isDrawing = false;
      _saveDrawings();
    }
    if (_drawMode === 'symbol') {
      const symIcon = document.getElementById('itemIcon')?.value || '📍';
      const marker = L.marker(e.latlng, {
        icon: L.divIcon({
          className: 'draw-symbol',
          html: '<div style="font-size:20px;text-shadow:0 1px 2px rgba(0,0,0,.4)">' + symIcon + '</div>',
          iconSize: [24, 24], iconAnchor: [12, 12]
        })
      });
      marker.addTo(_drawingsLayer);
      marker.on('click', function() {
        if (_drawMode === 'erase') { _drawingsLayer.removeLayer(marker); _saveDrawings(); }
      });
      _drawHistory.push(marker);
      _isDrawing = false;
      _saveDrawings();
    }
    if (_drawMode === 'erase') {
      _isDrawing = false;
    }
  });

  _map.on('mousemove', function(e) {
    if (!_isDrawing || !_drawMode) return;
    if ((_drawMode === 'pen' || _drawMode === 'highlight') && _tempDrawPath) {
      penPoints.push(e.latlng);
      _tempDrawPath.setLatLngs(penPoints);
    }
  });

  _map.on('mouseup', function(e) {
    if (!_isDrawing || !_drawMode) return;
    _isDrawing = false;

    if ((_drawMode === 'pen' || _drawMode === 'highlight') && _tempDrawPath) {
      _drawHistory.push(_tempDrawPath);
      _tempDrawPath = null;
      _saveDrawings();
    }
    if (_drawMode === 'line' && _drawStart) {
      const line = L.polyline([_drawStart, e.latlng], { color: _drawColor, weight: _drawWidth }).addTo(_drawingsLayer);
      line.on('click', function() { if (_drawMode === 'erase') { _drawingsLayer.removeLayer(line); _saveDrawings(); } });
      _drawHistory.push(line);
      _drawStart = null;
      _saveDrawings();
    }
    if (_drawMode === 'rect' && _drawStart) {
      const bounds = L.latLngBounds(_drawStart, e.latlng);
      const rect = L.rectangle(bounds, { color: _drawColor, weight: _drawWidth, fillOpacity: 0.1 }).addTo(_drawingsLayer);
      rect.on('click', function() { if (_drawMode === 'erase') { _drawingsLayer.removeLayer(rect); _saveDrawings(); } });
      _drawHistory.push(rect);
      _drawStart = null;
      _saveDrawings();
    }
    if (_drawMode === 'circle' && _drawStart) {
      const radius = _drawStart.distanceTo(e.latlng);
      const circle = L.circle(_drawStart, { radius: Math.max(radius, 10), color: _drawColor, weight: _drawWidth, fillOpacity: 0.1 }).addTo(_drawingsLayer);
      circle.on('click', function() { if (_drawMode === 'erase') { _drawingsLayer.removeLayer(circle); _saveDrawings(); } });
      _drawHistory.push(circle);
      _drawStart = null;
      _saveDrawings();
    }
  });
}

/* ── Save / Load drawings ── */
async function _saveDrawings() {
  if (!_currentMapResource || !_drawingsLayer) return;
  const drawings = [];
  _drawingsLayer.eachLayer(layer => {
    if (layer instanceof L.Marker) {
      const ll = layer.getLatLng();
      const html = layer.options.icon?.options?.html || '';
      drawings.push({ type: 'marker', lat: ll.lat, lng: ll.lng, html: html });
    } else if (layer instanceof L.Rectangle) {
      const b = layer.getBounds();
      drawings.push({ type: 'rect', bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]], color: layer.options.color, weight: layer.options.weight });
    } else if (layer instanceof L.Circle) {
      const ll = layer.getLatLng();
      drawings.push({ type: 'circle', lat: ll.lat, lng: ll.lng, radius: layer.getRadius(), color: layer.options.color, weight: layer.options.weight });
    } else if (layer instanceof L.Polyline) {
      drawings.push({ type: 'polyline', latlngs: layer.getLatLngs().map(p => [p.lat, p.lng]), color: layer.options.color, weight: layer.options.weight, opacity: layer.options.opacity || 1 });
    }
  });
  try {
    await fetch('/api/map-resources/' + _currentMapResource.id + '/drawings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(drawings)
    });
  } catch (e) { console.warn('[saveDrawings]', e); }
}

async function _loadDrawings(mapResource) {
  _initDrawingLayer();
  _drawingsLayer.clearLayers();
  _drawHistory = [];
  if (!mapResource) return;
  try {
    const res = await fetch('/api/map-resources/' + mapResource.id + '/drawings');
    if (!res.ok) return;
    const drawings = await res.json();
    (drawings || []).forEach(d => {
      let layer;
      if (d.type === 'marker') {
        layer = L.marker([d.lat, d.lng], {
          icon: L.divIcon({ className: 'draw-pin', html: d.html, iconSize: [24, 24], iconAnchor: [12, 12] })
        });
      } else if (d.type === 'polyline') {
        layer = L.polyline(d.latlngs, { color: d.color, weight: d.weight, opacity: d.opacity || 1 });
      } else if (d.type === 'rect') {
        layer = L.rectangle(d.bounds, { color: d.color, weight: d.weight, fillOpacity: 0.1 });
      } else if (d.type === 'circle') {
        layer = L.circle([d.lat, d.lng], { radius: d.radius, color: d.color, weight: d.weight, fillOpacity: 0.1 });
      }
      if (layer) {
        layer.addTo(_drawingsLayer);
        layer.on('click', function() { if (_drawMode === 'erase') { _drawingsLayer.removeLayer(layer); _saveDrawings(); } });
        _drawHistory.push(layer);
      }
    });
  } catch (e) { console.warn('[loadDrawings]', e); }
}

/* ── Map lock (whole map, not just overlay) ── */
let _mapLocked = false;

document.getElementById('btnLockMap').addEventListener('click', async function() {
  if (!_currentMapResource) return;
  try {
    const action = _mapLocked ? 'unlock' : 'lock';
    const res = await fetch('/api/map-resources/' + _currentMapResource.id + '/' + action, { method: 'POST' });
    if (res.ok) {
      _mapLocked = !_mapLocked;
      this.textContent = _mapLocked ? '🔓 Unlock' : '🔒 Lock';
      _applyMapLock();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Failed to toggle lock');
    }
  } catch (e) { console.warn('[lockMap]', e); }
});

function _applyMapLock() {
  const drawToolbar = document.getElementById('drawToolbar');
  const btnToggleDraw = document.getElementById('btnToggleDraw');
  const btnAddItem = document.getElementById('btnAddItem');
  if (_mapLocked) {
    if (drawToolbar) drawToolbar.style.display = 'none';
    if (btnToggleDraw) btnToggleDraw.style.display = 'none';
    if (btnAddItem) btnAddItem.style.display = 'none';
    _setDrawMode(null);
  } else {
    if (btnToggleDraw) btnToggleDraw.style.display = '';
    if (btnAddItem) btnAddItem.style.display = '';
  }
}

/* ── Per-map legend ── */
function updateLegendForMap(mr) {
  const el = document.getElementById('legendContent');
  if (!el) return;
  el.innerHTML = '';
  if (!mr) {
    // Default OSM legend
    updateLegend();
    return;
  }
  const items = [];
  // Add overlay items as legend entries
  (mr.overlays || []).forEach(ov => {
    items.push({ color: '#4A90D9', label: ov.name + (ov.locked ? ' 🔒' : '') });
    (ov.items || []).forEach(item => {
      items.push({ color: item.color || '#4A90D9', label: (item.icon || '📍') + ' ' + item.label });
    });
  });
  if (items.length === 0) {
    items.push({ color: '#888', label: 'No items on this map' });
  }
  items.forEach(it => {
    el.innerHTML += '<div class="legend-item"><span class="legend-dot" style="background:' + it.color + '"></span>' + escH(it.label) + '</div>';
  });
}

/* ── Init ── */
syncTheme();
syncLanguage();
initMapProjection();
loadMapResources();
_initDrawEvents();

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

/* ── Map Resources & Overlays ────────────────────────────────────────────── */

async function loadMapResources() {
  try {
    const res = await fetch('/api/map-resources');
    if (!res.ok) return;
    _mapResources = await res.json();
    const sel = document.getElementById('mapSelector');
    if (!sel) return;
    // Keep first "OpenStreetMap" option, remove the rest
    while (sel.options.length > 1) sel.remove(1);
    (_mapResources || []).forEach(mr => {
      const opt = document.createElement('option');
      opt.value = String(mr.id);
      opt.textContent = mr.name + ' (' + mr.map_type + ')';
      sel.appendChild(opt);
    });
  } catch (e) { console.warn('[loadMapResources]', e); }
}

document.getElementById('mapSelector').addEventListener('change', function() {
  switchMap(this.value);
});

function switchMap(mapResourceId) {
  _currentMapResourceId = mapResourceId;
  _currentOverlay = null;
  _clearOverlayItems();

  const overlayCtrl = document.getElementById('overlayControls');
  const pdfContainer = document.getElementById('pdfContainer');
  const mapEl = document.getElementById('mapProjection');
  const tileCtrl = document.getElementById('selTileLayer');

  if (!mapResourceId) {
    // Switch back to OSM live
    _currentMapResource = null;
    _isImageMap = false;
    if (_imageOverlayLayer) { _map.removeLayer(_imageOverlayLayer); _imageOverlayLayer = null; }
    if (_geojsonOverlayLayer) { _map.removeLayer(_geojsonOverlayLayer); _geojsonOverlayLayer = null; }
    pdfContainer.style.display = 'none';
    mapEl.style.display = '';
    tileCtrl.disabled = false;
    if (overlayCtrl) overlayCtrl.style.display = 'none';
    document.getElementById('btnLockMap').style.display = 'none';
    // Restore tile layer
    if (!_tileLayer) setTileLayer(document.getElementById('selTileLayer').value || 'osm');
    _map.invalidateSize();
    loadUsers();
    loadMeetings();
    // Clear drawings layer for OSM
    if (_drawingsLayer) _drawingsLayer.clearLayers();
    _drawHistory = [];
    updateLegend();
    return;
  }

  const mr = (_mapResources || []).find(m => String(m.id) === String(mapResourceId));
  if (!mr) return;
  _currentMapResource = mr;
  const fileUrl = '/api/map-resources/' + mr.id + '/file';
  const ct = (mr.content_type || '').toLowerCase();

  if (ct === 'application/pdf') {
    // Show PDF in iframe
    mapEl.style.display = 'none';
    pdfContainer.style.display = '';
    document.getElementById('pdfFrame').src = fileUrl;
    if (overlayCtrl) overlayCtrl.style.display = 'none';
    return;
  }

  // Image-based map (PNG, JPG, SVG)
  pdfContainer.style.display = 'none';
  mapEl.style.display = '';
  _map.invalidateSize();

  if (ct.startsWith('image/') || ct === 'image/svg+xml') {
    _showImageMap(fileUrl, mr);
  } else if (ct === 'application/json' || ct === 'application/geo+json' || mr.original_name.endsWith('.geojson')) {
    _showGeoJSONMap(fileUrl, mr);
  }

  // Show overlay controls for this map
  if (overlayCtrl) overlayCtrl.style.display = 'flex';
  _loadOverlays(mr);

  // Load drawings for this map
  _loadDrawings(mr);

  // Show lock button and update state
  document.getElementById('btnLockMap').style.display = '';
  _mapLocked = mr.locked || false;
  document.getElementById('btnLockMap').textContent = _mapLocked ? '🔓 Unlock' : '🔒 Lock';
  _applyMapLock();

  // Update per-map legend
  updateLegendForMap(mr);
}

function _showImageMap(url, mr) {
  _isImageMap = true;
  // Remove OSM tile layer and existing overlays
  if (_tileLayer) { _map.removeLayer(_tileLayer); _tileLayer = null; }
  if (_imageOverlayLayer) { _map.removeLayer(_imageOverlayLayer); _imageOverlayLayer = null; }
  _usersLayer.clearLayers();
  _meetingsLayer.clearLayers();

  const img = new Image();
  img.onload = function() {
    const h = img.naturalHeight || 800;
    const w = img.naturalWidth || 1200;
    const bounds = [[0, 0], [h, w]];
    // Reinitialize map with CRS.Simple
    _map.options.crs = L.CRS.Simple;
    // Allow generous zoom range for large images
    _map.setMinZoom(-5);
    _map.setMaxZoom(8);
    _map.setMaxBounds([[-h * 0.5, -w * 0.5], [h * 1.5, w * 1.5]]);
    _imageOverlayLayer = L.imageOverlay(url, bounds).addTo(_map);
    _map.fitBounds(bounds);
    // Re-init overlay items layer
    if (!_overlayItemsLayer) {
      _overlayItemsLayer = L.layerGroup().addTo(_map);
    }
  };
  img.src = url;
  document.getElementById('selTileLayer').disabled = true;
}

function _showGeoJSONMap(url, mr) {
  _isImageMap = false;
  if (_geojsonOverlayLayer) { _map.removeLayer(_geojsonOverlayLayer); _geojsonOverlayLayer = null; }
  // Restore tile layer if removed
  if (!_tileLayer) setTileLayer(document.getElementById('selTileLayer').value || 'osm');
  fetch(url).then(r => r.json()).then(data => {
    _geojsonOverlayLayer = L.geoJSON(data, {
      style: { color: '#3498DB', weight: 2, fillOpacity: 0.2 }
    }).addTo(_map);
    _map.fitBounds(_geojsonOverlayLayer.getBounds());
  }).catch(e => console.warn('[GeoJSON load]', e));
}

function _loadOverlays(mr) {
  const sel = document.getElementById('overlaySelector');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  (mr.overlays || []).forEach(ov => {
    const opt = document.createElement('option');
    opt.value = ov.id;
    opt.textContent = ov.name + (ov.locked ? ' [locked]' : '');
    sel.appendChild(opt);
  });
  sel.value = '';
}

document.getElementById('overlaySelector').addEventListener('change', function() {
  _selectOverlay(this.value);
});

function _selectOverlay(overlayId) {
  _clearOverlayItems();
  if (!_currentMapResource || !overlayId) {
    _currentOverlay = null;
    document.getElementById('btnLockOverlay').style.display = 'none';
    document.getElementById('btnAddItem').style.display = 'none';
    return;
  }
  _currentOverlay = (_currentMapResource.overlays || []).find(o => o.id === overlayId) || null;
  if (!_currentOverlay) return;

  document.getElementById('btnLockOverlay').style.display = '';
  document.getElementById('btnLockOverlay').textContent = _currentOverlay.locked ? 'Unlock' : 'Lock';
  document.getElementById('btnAddItem').style.display = _currentOverlay.locked ? 'none' : '';

  _renderOverlayItems(_currentOverlay);
}

function _clearOverlayItems() {
  if (_overlayItemsLayer) _overlayItemsLayer.clearLayers();
}

function _renderOverlayItems(overlay) {
  _clearOverlayItems();
  if (!_overlayItemsLayer) {
    _overlayItemsLayer = L.layerGroup().addTo(_map);
  }
  (overlay.items || []).forEach(item => {
    const typeIcons = { user: '👤', group: '👥', building: '🏢', service: '💻', custom: '📍' };
    const icon = item.icon || typeIcons[item.type] || '📍';
    const marker = L.marker([item.y, item.x], {
      draggable: !overlay.locked,
      icon: L.divIcon({
        className: 'map-overlay-item',
        html: '<div style="background:' + (item.color || '#4A90D9') + ';padding:3px 8px;border-radius:4px;color:#fff;white-space:nowrap;font-size:11px;display:inline-flex;align-items:center;gap:4px;box-shadow:0 1px 4px rgba(0,0,0,.3)">' +
          icon + ' ' + escH(item.label) +
          (item.notes ? '<br><small style="opacity:.8">' + escH(item.notes) + '</small>' : '') +
          '</div>',
        iconSize: null,
        iconAnchor: [0, 0]
      })
    });

    if (!overlay.locked) {
      marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        item.x = pos.lng;
        item.y = pos.lat;
        _saveOverlay();
      });
    }

    // Click to select (for bulk ops)
    marker.on('click', function(e) {
      if (_drawMode === 'erase') return;
      if (e.originalEvent && e.originalEvent.ctrlKey) {
        _toggleSelectItem(item.id);
        _renderBulkOpsBar();
        return;
      }
    });

    // Right-click to edit/delete/move
    marker.on('contextmenu', function(e) {
      L.DomEvent.stopPropagation(e);
      const isSelected = _selectedItems.has(item.id);
      const popup = L.popup({ closeButton: true, className: 'overlay-item-popup' })
        .setLatLng(e.latlng)
        .setContent(
          '<div style="font-size:11px">' +
          '<b>' + escH(item.label) + '</b>' +
          (item.notes ? '<br>' + escH(item.notes) : '') +
          '<br><br>' +
          (overlay.locked ? '' : '<a href="#" onclick="event.preventDefault();_editOverlayItem(\'' + item.id + '\')">Edit</a> | ') +
          (overlay.locked ? '' : '<a href="#" onclick="event.preventDefault();_deleteOverlayItem(\'' + item.id + '\')">Delete</a> | ') +
          (overlay.locked ? '' : '<a href="#" onclick="event.preventDefault();_moveItemToOverlay(\'' + item.id + '\')">Move to Layer</a> | ') +
          (overlay.locked ? '' : '<a href="#" onclick="event.preventDefault();_moveItemToMap(\'' + item.id + '\')">Move to Map</a>') +
          (item.group_items ? '<br><a href="#" onclick="event.preventDefault();_ungroupItem(\'' + item.id + '\')">Ungroup</a>' : '') +
          '<br><a href="#" onclick="event.preventDefault();_toggleSelectItem(\'' + item.id + '\');_renderBulkOpsBar();_map.closePopup()">' + (isSelected ? 'Deselect' : 'Select') + '</a>' +
          '<br><small style="color:#888">Ctrl+Click to multi-select</small>' +
          '</div>'
        )
        .openOn(_map);
    });

    marker.addTo(_overlayItemsLayer);
  });
}

async function _saveOverlay() {
  if (!_currentMapResource || !_currentOverlay) return;
  try {
    const overlays = _currentMapResource.overlays || [];
    const idx = overlays.findIndex(o => o.id === _currentOverlay.id);
    if (idx >= 0) overlays[idx] = _currentOverlay;
    await fetch('/api/map-resources/' + _currentMapResource.id + '/overlays', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(overlays)
    });
  } catch (e) { console.warn('[saveOverlay]', e); }
}

/* ── Upload map ── */
document.getElementById('btnUploadMap').addEventListener('click', function() {
  document.getElementById('uploadMapDialog').classList.add('open');
});
document.getElementById('btnCancelUploadMap').addEventListener('click', function() {
  document.getElementById('uploadMapDialog').classList.remove('open');
});
document.getElementById('btnDoUploadMap').addEventListener('click', async function() {
  const name = document.getElementById('uploadMapName').value.trim();
  const file = document.getElementById('uploadMapFile').files[0];
  if (!name || !file) { alert('Name and file are required'); return; }
  const fd = new FormData();
  fd.append('file', file);
  fd.append('name', name);
  fd.append('description', document.getElementById('uploadMapDesc').value.trim());
  fd.append('map_type', document.getElementById('uploadMapType').value);
  try {
    const res = await fetch('/api/map-resources', { method: 'POST', body: fd });
    if (!res.ok) { const t = await res.text(); alert('Upload failed: ' + t); return; }
    document.getElementById('uploadMapDialog').classList.remove('open');
    document.getElementById('uploadMapName').value = '';
    document.getElementById('uploadMapDesc').value = '';
    document.getElementById('uploadMapFile').value = '';
    await loadMapResources();
  } catch (e) { alert('Upload error: ' + e.message); }
});

/* ── New overlay ── */
document.getElementById('btnAddOverlay').addEventListener('click', function() {
  if (!_currentMapResource) return;
  document.getElementById('newOverlayDialog').classList.add('open');
});
document.getElementById('btnCancelNewOverlay').addEventListener('click', function() {
  document.getElementById('newOverlayDialog').classList.remove('open');
});
document.getElementById('btnDoNewOverlay').addEventListener('click', async function() {
  const name = document.getElementById('newOverlayName').value.trim();
  if (!name) { alert('Name required'); return; }
  const newOv = { id: 'ov_' + Date.now(), name: name, locked: false, locked_by: 0, items: [] };
  if (!_currentMapResource.overlays) _currentMapResource.overlays = [];
  _currentMapResource.overlays.push(newOv);
  await _saveOverlays();
  document.getElementById('newOverlayDialog').classList.remove('open');
  document.getElementById('newOverlayName').value = '';
  _loadOverlays(_currentMapResource);
  document.getElementById('overlaySelector').value = newOv.id;
  _selectOverlay(newOv.id);
});

async function _saveOverlays() {
  if (!_currentMapResource) return;
  try {
    await fetch('/api/map-resources/' + _currentMapResource.id + '/overlays', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_currentMapResource.overlays || [])
    });
  } catch (e) { console.warn('[saveOverlays]', e); }
}

/* ── Lock/Unlock overlay ── */
document.getElementById('btnLockOverlay').addEventListener('click', async function() {
  if (!_currentMapResource || !_currentOverlay) return;
  var action = _currentOverlay.locked ? 'unlock' : 'lock';
  try {
    const res = await fetch('/api/map-resources/' + _currentMapResource.id + '/overlays/' + _currentOverlay.id + '/' + action, {
      method: 'POST'
    });
    if (res.ok) {
      _currentOverlay.locked = !_currentOverlay.locked;
      this.textContent = _currentOverlay.locked ? 'Unlock' : 'Lock';
      document.getElementById('btnAddItem').style.display = _currentOverlay.locked ? 'none' : '';
      _renderOverlayItems(_currentOverlay);
    } else {
      var err = await res.json().catch(function() { return {}; });
      alert(err.error || 'Failed to toggle lock');
    }
  } catch (e) { console.warn('[toggleLock]', e); }
});

/* ── Add item to overlay ── */
document.getElementById('btnAddItem').addEventListener('click', function() {
  if (!_currentOverlay || _currentOverlay.locked) return;
  _populateItemRefSelector(document.getElementById('itemType').value);
  document.getElementById('addItemDialog').classList.add('open');
});
document.getElementById('btnCancelAddItem').addEventListener('click', function() {
  document.getElementById('addItemDialog').classList.remove('open');
});
document.getElementById('itemType').addEventListener('change', function() {
  _populateItemRefSelector(this.value);
});

async function _populateItemRefSelector(type) {
  const sel = document.getElementById('itemRef');
  sel.innerHTML = '<option value="">-- select --</option>';
  try {
    if (type === 'user') {
      const res = await fetch('/api/users');
      if (res.ok) {
        const users = await res.json();
        (users || []).forEach(u => {
          const opt = document.createElement('option');
          opt.value = String(u.id);
          opt.textContent = u.display_name || u.username;
          sel.appendChild(opt);
        });
      }
    } else if (type === 'group') {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const groups = await res.json();
        (groups || []).forEach(g => {
          const opt = document.createElement('option');
          opt.value = String(g.id);
          opt.textContent = g.name;
          sel.appendChild(opt);
        });
      }
    }
  } catch (e) { console.warn('[populateRef]', e); }
}

// Populate symbol set picker
(function() {
  const sel = document.getElementById('symbolSetPicker');
  if (!sel) return;
  Object.keys(MAP_SYMBOL_SETS).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = MAP_SYMBOL_SETS[key].label;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', function() {
    const grid = document.getElementById('symbolGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const set = MAP_SYMBOL_SETS[this.value];
    if (!set) return;
    set.symbols.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = s.label;
      btn.textContent = s.icon;
      btn.style.cssText = 'width:28px;height:28px;font-size:16px;border:1px solid var(--border);border-radius:3px;background:var(--bg2);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0';
      btn.addEventListener('click', () => {
        document.getElementById('itemIcon').value = s.icon;
        if (!document.getElementById('itemLabel').value.trim()) {
          document.getElementById('itemLabel').value = s.label;
        }
      });
      grid.appendChild(btn);
    });
  });
})();

document.getElementById('btnPlaceItem').addEventListener('click', function() {
  if (!_currentOverlay || _currentOverlay.locked) return;
  const label = document.getElementById('itemLabel').value.trim();
  if (!label) { alert('Label is required'); return; }
  const center = _map.getCenter();
  const newItem = {
    id: 'item_' + Date.now(),
    type: document.getElementById('itemType').value,
    ref_id: document.getElementById('itemRef').value,
    label: label,
    x: center.lng,
    y: center.lat,
    icon: document.getElementById('itemIcon').value.trim(),
    color: document.getElementById('itemColor').value,
    notes: document.getElementById('itemNotes').value.trim()
  };
  if (!_currentOverlay.items) _currentOverlay.items = [];
  _currentOverlay.items.push(newItem);
  _saveOverlay();
  _renderOverlayItems(_currentOverlay);
  document.getElementById('addItemDialog').classList.remove('open');
  // Reset form
  document.getElementById('itemLabel').value = '';
  document.getElementById('itemIcon').value = '';
  document.getElementById('itemNotes').value = '';
});

/* ── Comprehensive Symbol Datasets for Map Items ── */
const MAP_SYMBOL_SETS = {
  nato_common: {
    label: 'NATO Common',
    symbols: [
      // Unit types / function symbols represented with text labels
      { icon: '⬡', label: 'HQ' }, { icon: '⬢', label: 'Unit' },
      { icon: '⊕', label: 'Friendly' }, { icon: '◇', label: 'Hostile' },
      { icon: '□', label: 'Neutral' }, { icon: '△', label: 'Unknown' },
      { icon: '⬠', label: 'Assumed Friendly' },
      // Infantry & ground
      { icon: '🔫', label: 'Infantry' }, { icon: '🎯', label: 'Target' },
      { icon: '💣', label: 'Explosive' }, { icon: '🛡', label: 'Defence' },
      { icon: '⚔', label: 'Combat' }, { icon: '🗡', label: 'Attack' },
      // Movement & logistics
      { icon: '➡', label: 'Advance' }, { icon: '⬆', label: 'Move North' },
      { icon: '⬇', label: 'Move South' }, { icon: '⬅', label: 'Move West' },
      { icon: '↗', label: 'Move NE' }, { icon: '↘', label: 'Move SE' },
      { icon: '🔄', label: 'Rotate' }, { icon: '⏹', label: 'Halt' },
      { icon: '🏳', label: 'Surrender' }, { icon: '🚩', label: 'Flag' },
      // Support
      { icon: '🏥', label: 'Medical' }, { icon: '⛽', label: 'Supply' },
      { icon: '📡', label: 'Signal' }, { icon: '🔧', label: 'Maintenance' },
      { icon: '🛞', label: 'Transport' }, { icon: '🪖', label: 'Military' },
    ]
  },
  nato_military: {
    label: 'NATO Military Map',
    symbols: [
      // Obstacles & engineering
      { icon: '🚧', label: 'Roadblock' }, { icon: '⛔', label: 'No Entry' },
      { icon: '🪤', label: 'Minefield' }, { icon: '🌉', label: 'Bridge' },
      { icon: '🏗', label: 'Engineering' }, { icon: '💥', label: 'IED/Mine' },
      // Boundaries
      { icon: '═══', label: 'Boundary' }, { icon: '---', label: 'Phase Line' },
      { icon: '···', label: 'LoD' }, { icon: '▬▬▬', label: 'FEBA' },
      // Air & naval
      { icon: '✈', label: 'Fixed Wing' }, { icon: '🚁', label: 'Rotary Wing' },
      { icon: '🛩', label: 'UAV' }, { icon: '🚀', label: 'Missile' },
      { icon: '⚓', label: 'Naval' }, { icon: '🚢', label: 'Ship' },
      { icon: '🛟', label: 'SAR' },
      // C2 & intelligence
      { icon: '🎖', label: 'Command' }, { icon: '📋', label: 'Orders' },
      { icon: '👁', label: 'Observation' }, { icon: '🔍', label: 'Recon' },
      { icon: '📍', label: 'Waypoint' }, { icon: '⭐', label: 'Key Terrain' },
      { icon: '🏴', label: 'Enemy' }, { icon: '🟦', label: 'Friendly Force' },
      { icon: '🟥', label: 'Enemy Force' }, { icon: '🟨', label: 'Neutral' },
      { icon: '🟩', label: 'Civilian' },
    ]
  },
  swedish_military: {
    label: 'Swedish Military',
    symbols: [
      { icon: '🇸🇪', label: 'Swedish' },
      { icon: '⊞', label: 'Förband' }, { icon: '⊟', label: 'Stab' },
      { icon: '🛡', label: 'Försvar' }, { icon: '⚔', label: 'Anfall' },
      { icon: '🏥', label: 'Sjukvård' }, { icon: '📡', label: 'Signal' },
      { icon: '🔧', label: 'Underhåll' }, { icon: '🚛', label: 'Transport' },
      { icon: '🔫', label: 'Infanteri' }, { icon: '🎯', label: 'Artilleri' },
      { icon: '🪖', label: 'Soldat' }, { icon: '🏴', label: 'Fiende' },
      { icon: '🚧', label: 'Hinder' }, { icon: '🌉', label: 'Bro' },
      { icon: '💥', label: 'Minor' }, { icon: '⛽', label: 'Drivmedel' },
      { icon: '🏕', label: 'Förläggning' }, { icon: '📍', label: 'Samlingsplats' },
      { icon: '👁', label: 'Spaning' }, { icon: '🔭', label: 'Observation' },
      { icon: '🚁', label: 'Helikopter' }, { icon: '⚓', label: 'Marin' },
    ]
  },
  cyber_security: {
    label: 'Cyber Security',
    symbols: [
      // Network
      { icon: '🖥', label: 'Server' }, { icon: '💻', label: 'Workstation' },
      { icon: '📡', label: 'Network' }, { icon: '🌐', label: 'Internet' },
      { icon: '🛜', label: 'WiFi' }, { icon: '📶', label: 'Signal' },
      { icon: '🔌', label: 'Connection' }, { icon: '🖧', label: 'Switch' },
      // Security
      { icon: '🔒', label: 'Secured' }, { icon: '🔓', label: 'Unsecured' },
      { icon: '🔐', label: 'Encrypted' }, { icon: '🔑', label: 'Key/Auth' },
      { icon: '🛡', label: 'Firewall' }, { icon: '⚠', label: 'Alert' },
      { icon: '🚨', label: 'Incident' }, { icon: '💀', label: 'Compromised' },
      { icon: '🐛', label: 'Malware' }, { icon: '🕷', label: 'Threat' },
      { icon: '🦠', label: 'Virus' }, { icon: '🎣', label: 'Phishing' },
      { icon: '🕵', label: 'Attacker' }, { icon: '👤', label: 'User' },
      // Infrastructure
      { icon: '☁', label: 'Cloud' }, { icon: '🗄', label: 'Database' },
      { icon: '💾', label: 'Storage' }, { icon: '📧', label: 'Email' },
      { icon: '🔗', label: 'Link' }, { icon: '📊', label: 'SIEM' },
      { icon: '🧰', label: 'Tools' }, { icon: '📋', label: 'Log' },
      { icon: '🤖', label: 'Bot/Auto' }, { icon: '🧠', label: 'AI/ML' },
      // Status
      { icon: '✅', label: 'Patched' }, { icon: '❌', label: 'Vulnerable' },
      { icon: '🟢', label: 'Online' }, { icon: '🔴', label: 'Offline' },
      { icon: '🟡', label: 'Degraded' }, { icon: '⏳', label: 'Pending' },
    ]
  },
  people: {
    label: 'People & Roles',
    symbols: [
      { icon: '👤', label: 'Person' }, { icon: '👥', label: 'Group' },
      { icon: '🧑‍✈️', label: 'Pilot' }, { icon: '🧑‍🚒', label: 'Firefighter' },
      { icon: '👮', label: 'Police' }, { icon: '🧑‍⚕️', label: 'Medic' },
      { icon: '🧑‍🔧', label: 'Engineer' }, { icon: '🧑‍💻', label: 'IT Specialist' },
      { icon: '🧑‍🏫', label: 'Instructor' }, { icon: '🧑‍🔬', label: 'Scientist' },
      { icon: '💂', label: 'Guard' }, { icon: '🪖', label: 'Soldier' },
      { icon: '🎖', label: 'Officer' }, { icon: '👷', label: 'Worker' },
      { icon: '🧑‍🦽', label: 'Casualty' }, { icon: '🏃', label: 'Runner' },
      { icon: '🤝', label: 'Meeting' }, { icon: '📢', label: 'Briefing' },
      { icon: '🙋', label: 'Volunteer' }, { icon: '🕵', label: 'Intelligence' },
    ]
  },
  emojis_general: {
    label: 'General Symbols',
    symbols: [
      { icon: '📍', label: 'Location' }, { icon: '🏠', label: 'House' },
      { icon: '🏢', label: 'Building' }, { icon: '🏭', label: 'Factory' },
      { icon: '⛪', label: 'Church' }, { icon: '🏫', label: 'School' },
      { icon: '🏥', label: 'Hospital' }, { icon: '🏛', label: 'Government' },
      { icon: '🏟', label: 'Stadium' }, { icon: '🌳', label: 'Forest' },
      { icon: '⛰', label: 'Mountain' }, { icon: '🌊', label: 'Water' },
      { icon: '🌉', label: 'Bridge' }, { icon: '🛤', label: 'Rail' },
      { icon: '🛣', label: 'Highway' }, { icon: '✈', label: 'Airport' },
      { icon: '🚉', label: 'Station' }, { icon: '⚡', label: 'Power' },
      { icon: '🔥', label: 'Fire' }, { icon: '💧', label: 'Water Supply' },
      { icon: '🌡', label: 'Temperature' }, { icon: '🌤', label: 'Weather' },
      { icon: '⏰', label: 'Time' }, { icon: '📞', label: 'Communication' },
      { icon: '🔔', label: 'Alert' }, { icon: '❗', label: 'Urgent' },
      { icon: '❓', label: 'Unknown' }, { icon: '✓', label: 'Verified' },
      { icon: '🚩', label: 'Flag' }, { icon: '⭐', label: 'Important' },
      { icon: '💎', label: 'High Value' }, { icon: '🗺', label: 'Map' },
    ]
  },
  vehicles_transport: {
    label: 'Vehicles & Transport',
    symbols: [
      { icon: '🚗', label: 'Car' }, { icon: '🚙', label: 'SUV' },
      { icon: '🚐', label: 'Van' }, { icon: '🚌', label: 'Bus' },
      { icon: '🚑', label: 'Ambulance' }, { icon: '🚒', label: 'Fire Truck' },
      { icon: '🚓', label: 'Police Car' }, { icon: '🚔', label: 'Patrol' },
      { icon: '🛻', label: 'Pickup' }, { icon: '🚚', label: 'Truck' },
      { icon: '🚛', label: 'Semi' }, { icon: '🚜', label: 'Tractor' },
      { icon: '🏍', label: 'Motorcycle' }, { icon: '🚲', label: 'Bicycle' },
      { icon: '✈', label: 'Airplane' }, { icon: '🛩', label: 'Light Aircraft' },
      { icon: '🚁', label: 'Helicopter' }, { icon: '🚀', label: 'Rocket' },
      { icon: '🚂', label: 'Train' }, { icon: '🚢', label: 'Ship' },
      { icon: '⛵', label: 'Sailboat' }, { icon: '🚤', label: 'Speedboat' },
      { icon: '🛥', label: 'Motor Boat' }, { icon: '⛴', label: 'Ferry' },
      { icon: '🛶', label: 'Canoe' }, { icon: '🚧', label: 'Roadblock' },
    ]
  }
};

/* ── Edit/Delete overlay items (called from popup links) ── */
function _editOverlayItem(itemId) {
  if (!_currentOverlay) return;
  const item = (_currentOverlay.items || []).find(i => i.id === itemId);
  if (!item) return;
  _map.closePopup();
  const newLabel = prompt('Label:', item.label);
  if (newLabel === null) return;
  item.label = newLabel;
  const newNotes = prompt('Notes:', item.notes || '');
  if (newNotes !== null) item.notes = newNotes;
  const newIcon = prompt('Icon:', item.icon || '');
  if (newIcon !== null) item.icon = newIcon;
  _saveOverlay();
  _renderOverlayItems(_currentOverlay);
}

function _deleteOverlayItem(itemId) {
  if (!_currentOverlay) return;
  if (!confirm('Delete this item?')) return;
  _map.closePopup();
  _currentOverlay.items = (_currentOverlay.items || []).filter(i => i.id !== itemId);
  _saveOverlay();
  _renderOverlayItems(_currentOverlay);
}

/* ── Item group selection for bulk operations ── */
let _selectedItems = new Set();

function _toggleSelectItem(itemId) {
  if (_selectedItems.has(itemId)) _selectedItems.delete(itemId);
  else _selectedItems.add(itemId);
  _renderOverlayItems(_currentOverlay);
}

function _deleteSelectedItems() {
  if (!_currentOverlay || _selectedItems.size === 0) return;
  if (!confirm('Delete ' + _selectedItems.size + ' selected items?')) return;
  _currentOverlay.items = (_currentOverlay.items || []).filter(i => !_selectedItems.has(i.id));
  _selectedItems.clear();
  _saveOverlay();
  _renderOverlayItems(_currentOverlay);
}

function _groupSelectedItems() {
  if (!_currentOverlay || _selectedItems.size < 2) { alert('Select at least 2 items to group'); return; }
  const groupName = prompt('Group name:', 'Group');
  if (!groupName) return;
  const items = (_currentOverlay.items || []).filter(i => _selectedItems.has(i.id));
  // Calculate center position
  const avgX = items.reduce((s, i) => s + i.x, 0) / items.length;
  const avgY = items.reduce((s, i) => s + i.y, 0) / items.length;
  // Create group item
  const groupItem = {
    id: 'grp_' + Date.now(),
    type: 'group',
    label: groupName,
    x: avgX, y: avgY,
    icon: '📦',
    color: '#8E44AD',
    notes: 'Group of: ' + items.map(i => i.label).join(', '),
    group_items: items.map(i => i.id)
  };
  // Remove individual items, add group
  _currentOverlay.items = (_currentOverlay.items || []).filter(i => !_selectedItems.has(i.id));
  _currentOverlay.items.push(groupItem);
  _selectedItems.clear();
  _saveOverlay();
  _renderOverlayItems(_currentOverlay);
}

function _ungroupItem(itemId) {
  if (!_currentOverlay) return;
  const item = (_currentOverlay.items || []).find(i => i.id === itemId);
  if (!item || !item.group_items) return;
  // Ungroup is a notification only - items were already removed
  alert('Group "' + item.label + '" ungrouped. The original items were merged into this group.');
  _map.closePopup();
}

function _moveItemToOverlay(itemId) {
  if (!_currentOverlay || !_currentMapResource) return;
  const overlays = (_currentMapResource.overlays || []).filter(o => o.id !== _currentOverlay.id);
  if (overlays.length === 0) { alert('No other overlays available'); return; }
  const names = overlays.map((o, i) => (i + 1) + '. ' + o.name).join('\n');
  const choice = prompt('Move to overlay:\n' + names + '\n\nEnter number:', '1');
  if (!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= overlays.length) { alert('Invalid selection'); return; }
  const targetOverlay = overlays[idx];
  const item = (_currentOverlay.items || []).find(i => i.id === itemId);
  if (!item) return;
  _map.closePopup();
  // Remove from current overlay
  _currentOverlay.items = (_currentOverlay.items || []).filter(i => i.id !== itemId);
  // Add to target overlay
  if (!targetOverlay.items) targetOverlay.items = [];
  targetOverlay.items.push(item);
  _saveOverlays();
  _renderOverlayItems(_currentOverlay);
}

function _moveItemToMap(itemId) {
  if (!_currentOverlay || !_currentMapResource) return;
  const otherMaps = (_mapResources || []).filter(m => String(m.id) !== String(_currentMapResource.id));
  if (otherMaps.length === 0) { alert('No other maps available'); return; }
  const names = otherMaps.map((m, i) => (i + 1) + '. ' + m.name).join('\n');
  const choice = prompt('Move to map:\n' + names + '\n\nEnter number:', '1');
  if (!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= otherMaps.length) { alert('Invalid selection'); return; }
  const targetMap = otherMaps[idx];
  const item = (_currentOverlay.items || []).find(i => i.id === itemId);
  if (!item) return;
  _map.closePopup();
  // Remove from current overlay
  _currentOverlay.items = (_currentOverlay.items || []).filter(i => i.id !== itemId);
  // Add to first overlay of target map (or create one)
  if (!targetMap.overlays || targetMap.overlays.length === 0) {
    targetMap.overlays = [{ id: 'ov_' + Date.now(), name: 'Default', locked: false, locked_by: 0, items: [item] }];
  } else {
    if (!targetMap.overlays[0].items) targetMap.overlays[0].items = [];
    targetMap.overlays[0].items.push(item);
  }
  // Save both maps
  _saveOverlays();
  fetch('/api/map-resources/' + targetMap.id + '/overlays', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(targetMap.overlays)
  }).catch(e => console.warn('[moveItemToMap]', e));
  _renderOverlayItems(_currentOverlay);
}

/* ── Bulk operations bar ── */
function _renderBulkOpsBar() {
  let bar = document.getElementById('bulkOpsBar');
  if (_selectedItems.size === 0) {
    if (bar) bar.style.display = 'none';
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'bulkOpsBar';
    bar.style.cssText = 'position:absolute;bottom:60px;left:50%;transform:translateX(-50%);z-index:1002;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:6px 12px;display:flex;gap:6px;align-items:center;font-size:11px';
    document.body.appendChild(bar);
  }
  bar.style.display = 'flex';
  bar.innerHTML = '<span>' + _selectedItems.size + ' selected</span>' +
    '<button class="btn-map" onclick="_groupSelectedItems()">Group</button>' +
    '<button class="btn-map" onclick="_deleteSelectedItems()">Delete</button>' +
    '<button class="btn-map" onclick="_selectedItems.clear();_renderOverlayItems(_currentOverlay)">Clear</button>';
}
