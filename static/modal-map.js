/* ── Map Integration ── */
// ── Map Integration ────────────────────────────────────────────────────────────

let _map = null;
let _mapMarker = null;
let _mapCallback = null; // function(lat, lng, locationName) called on save

function openMapForEvent() {
  const lat = parseFloat(document.getElementById('eventLatitude')?.value) || null;
  const lng = parseFloat(document.getElementById('eventLongitude')?.value) || null;
  const loc = document.getElementById('eventPhysicalLocation')?.value || '';

  _mapCallback = (lat, lng, locationName) => {
    const latEl = document.getElementById('eventLatitude');
    const lngEl = document.getElementById('eventLongitude');
    const coordEl = document.getElementById('physicalMapCoords');
    const locEl = document.getElementById('eventPhysicalLocation');
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);
    if (coordEl) coordEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    if (locEl && locationName) locEl.value = locationName;
  };

  openModal('mapModal');
  document.getElementById('mapLocationName').value = loc;
  document.getElementById('mapLat').value = lat || '';
  document.getElementById('mapLng').value = lng || '';

  // Initialize map after modal is visible
  setTimeout(() => initMap(lat, lng), 100);
}

function initMap(lat, lng) {
  loadLeaflet(() => {
    const container = document.getElementById('mapContainer');
    if (!container) return;

    if (_map) { _map.remove(); _map = null; _mapMarker = null; }

    const center = (lat && lng) ? [lat, lng] : [51.505, -0.09];
    _map = L.map('mapContainer').setView(center, lat ? 13 : 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(_map);

    if (lat && lng) {
      _mapMarker = L.marker([lat, lng]).addTo(_map);
    }

    _map.on('click', function(e) {
      const { lat, lng } = e.latlng;
      document.getElementById('mapLat').value = lat.toFixed(6);
      document.getElementById('mapLng').value = lng.toFixed(6);
      if (_mapMarker) { _mapMarker.setLatLng(e.latlng); }
      else { _mapMarker = L.marker(e.latlng).addTo(_map); }
    });
  });
}

function saveMapLocation() {
  const lat = parseFloat(document.getElementById('mapLat')?.value);
  const lng = parseFloat(document.getElementById('mapLng')?.value);
  const name = document.getElementById('mapLocationName')?.value?.trim() || '';
  if (isNaN(lat) || isNaN(lng)) { showError('Please select a location on the map or enter coordinates'); return; }
  if (_mapCallback) _mapCallback(lat, lng, name);
  closeModal('mapModal');
}
