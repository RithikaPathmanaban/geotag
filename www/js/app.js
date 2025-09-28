let map;
let currentMarker = null;
let pinMode = false;
let pins = []; // { marker, lat, lng }
let routePolyline = null;

const latField = document.getElementById('lat');
const lngField = document.getElementById('lng');

function initMap() {
  map = L.map('map').setView([0, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      latField.value = lat.toFixed(6);
      lngField.value = lng.toFixed(6);

      map.setView([lat, lng], 15);

      currentMarker = L.marker([lat, lng], { icon: greenIcon() }).addTo(map)
        .bindPopup('Current Location')
        .openPopup();
    }, () => {
      alert('Geolocation failed.');
    });
  }
}

document.getElementById('pinModeBtn').onclick = () => {
  pinMode = !pinMode;
  document.getElementById('pinModeBtn').innerText = pinMode ? 'Disable Pin Mode' : 'Enable Pin Mode';
};

document.getElementById('clearBtn').onclick = () => {
  pins.forEach(p => map.removeLayer(p.marker));
  pins = [];
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
};

document.getElementById('saveRouteBtn').onclick = () => {
  const name = document.getElementById('routeName').value.trim();
  if (!name) return alert('Enter a route name');

  const saved = JSON.parse(localStorage.getItem('routes') || '{}');
  saved[name] = pins.map(p => ({ lat: p.lat, lng: p.lng }));
  localStorage.setItem('routes', JSON.stringify(saved));
  loadRoutes();
};

document.getElementById('routeSelect').onchange = (e) => {
  const name = e.target.value;
  if (!name) return;

  const saved = JSON.parse(localStorage.getItem('routes') || '{}');
  const coords = saved[name] || [];

  // Clear existing
  pins.forEach(p => map.removeLayer(p.marker));
  if (routePolyline) map.removeLayer(routePolyline);
  pins = [];

  coords.forEach(coord => {
    const marker = L.marker([coord.lat, coord.lng]).addTo(map);
    pins.push({ marker, lat: coord.lat, lng: coord.lng });
  });

  drawRoute();
};

document.getElementById('optimizeBtn').onclick = () => {
  if (pins.length < 3) return alert('Add at least 3 pins.');

  const start = pins[0];
  const unvisited = pins.slice(1);
  const optimized = [start];

  let current = start;
  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDist = haversine(current, unvisited[0]);
    for (let i = 1; i < unvisited.length; i++) {
      const dist = haversine(current, unvisited[i]);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = i;
      }
    }
    current = unvisited.splice(nearestIdx, 1)[0];
    optimized.push(current);
  }

  // Reorder pins
  pins = optimized;
  drawRoute();
};

document.getElementById('navBtn').onclick = () => {
  if (!currentMarker || pins.length < 1) return alert('Not enough points.');

  const origin = currentMarker.getLatLng();
  const destination = pins[pins.length - 1];
  const waypoints = pins.slice(0, -1)
    .map(p => `${p.lat},${p.lng}`)
    .join('|');

  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&waypoints=${waypoints}&travelmode=driving`;
  window.open(url, '_blank');
};

function drawRoute() {
  if (routePolyline) map.removeLayer(routePolyline);
  const latlngs = pins.map(p => [p.lat, p.lng]);
  routePolyline = L.polyline(latlngs, { color: 'blue' }).addTo(map);
}

function loadRoutes() {
  const select = document.getElementById('routeSelect');
  select.innerHTML = '<option value="">-- Select Saved Route --</option>';
  const saved = JSON.parse(localStorage.getItem('routes') || '{}');
  Object.keys(saved).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    select.appendChild(opt);
  });
}

function greenIcon() {
  return new L.Icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
    iconSize: [25, 41],
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png'
  });
}

function haversine(a, b) {
  const toRad = deg => deg * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const aVal = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
}

mapClickHandler = (e) => {
  if (!pinMode) return;
  const { lat, lng } = e.latlng;
  const marker = L.marker([lat, lng]).addTo(map);
  pins.push({ marker, lat, lng });
  drawRoute();
};

initMap();
map.on('click', mapClickHandler);
loadRoutes();
