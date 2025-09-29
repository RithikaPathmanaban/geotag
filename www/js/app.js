// www/js/app.js
// Cordova-friendly: works in browser too for testing
(function () {
  // --- App state ---
  let map;
  let currentPos = null; // {lat, lng}
  let currentMarker = null;
  let pinMode = false;
  let pinnedPoints = []; // {lat,lng,marker}
  let routeControl = null; // Leaflet Routing control instance
  let savedRoutes = []; // {id, name, points:[{lat,lng}]}
  let selectedRouteId = "";

  // DOM elements
  const latInput = document.getElementById("latInput");
  const lngInput = document.getElementById("lngInput");
  const pinModeCheckbox = document.getElementById("pinMode");
  const saveRouteBtn = document.getElementById("saveRoute");
  const clearPinsBtn = document.getElementById("clearPins");
  const savedRoutesSelect = document.getElementById("savedRoutes");
  const routeNameInput = document.getElementById("routeName");
  const deleteRouteBtn = document.getElementById("deleteRoute");
  const startNavBtn = document.getElementById("startNav");

  // --- Utilities ---
  function persistRoutes() {
    localStorage.setItem("geotag_saved_routes_v1", JSON.stringify(savedRoutes));
  }
  function loadPersistedRoutes() {
    const raw = localStorage.getItem("geotag_saved_routes_v1");
    if (raw) {
      try { savedRoutes = JSON.parse(raw); } catch(e){ savedRoutes = []; }
    } else savedRoutes = [];
    refreshSavedRoutesDropdown();
  }
  function refreshSavedRoutesDropdown() {
    savedRoutesSelect.innerHTML = '<option value="">-- Load saved route --</option>';
    savedRoutes.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.name;
      savedRoutesSelect.appendChild(opt);
    });
  }

  // Haversine distance (meters)
  function haversine(a, b) {
    const R = 6371e3;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const sa = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
    return R * c;
  }

  // TSP optimizer: exact for n<=8, else NN + 2-opt
  function optimizeRoute(startCoord, points) {
    const n = points.length;
    if (n === 0) return [];
    if (n <= 8) {
      // generate permutations
      function permute(arr) {
        const results = [];
        (function backtrack(temp, remaining) {
          if (remaining.length === 0) results.push(temp.slice());
          for (let i = 0; i < remaining.length; i++) {
            temp.push(remaining[i]);
            const next = remaining.slice(0, i).concat(remaining.slice(i + 1));
            backtrack(temp, next);
            temp.pop();
          }
        })([], arr);
        return results;
      }
      const perms = permute(points);
      let best = null, bestDist = Infinity;
      perms.forEach(order => {
        let d = 0, prev = startCoord;
        order.forEach(p => { d += haversine(prev, p); prev = p; });
        if (d < bestDist) { bestDist = d; best = order; }
      });
      return best;
    }

    // Nearest neighbor
    function nn() {
      const used = new Array(n).fill(false);
      const order = [];
      let curr = startCoord;
      for (let i = 0; i < n; i++) {
        let bestIdx = -1, bestD = Infinity;
        for (let j = 0; j < n; j++) {
          if (used[j]) continue;
          const d = haversine(curr, points[j]);
          if (d < bestD) { bestD = d; bestIdx = j; }
        }
        used[bestIdx] = true;
        order.push(points[bestIdx]);
        curr = points[bestIdx];
      }
      return order;
    }

    // 2-opt improvement
    function twoOpt(route) {
      let improved = true;
      const r = route.slice();
      while (improved) {
        improved = false;
        for (let i = 0; i < r.length - 1; i++) {
          for (let k = i + 1; k < r.length; k++) {
            // distances
            let d1 = 0, prev = startCoord; r.forEach(p => { d1 += haversine(prev, p); prev = p; });
            const newRoute = r.slice(0, i).concat(r.slice(i, k + 1).reverse(), r.slice(k + 1));
            let d2 = 0; prev = startCoord; newRoute.forEach(p => { d2 += haversine(prev, p); prev = p; });
            if (d2 + 1e-6 < d1) { r.splice(0, r.length, ...newRoute); improved = true; }
          }
        }
      }
      return r;
    }

    const initial = nn();
    return twoOpt(initial);
  }

  // --- Map & routing ---
  function initMap() {
    map = L.map('map', { zoomControl: true });

    // OSM tile layer (no key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // locate user (browser geolocation)
    map.locate({ setView: true, maxZoom: 16 });

    map.on('locationfound', function (e) {
      currentPos = { lat: e.latitude || e.latlng.lat, lng: e.longitude || e.latlng.lng };
      setCurrentMarker(currentPos);
      latInput.value = currentPos.lat.toFixed(6);
      lngInput.value = currentPos.lng.toFixed(6);
    });

    map.on('locationerror', function () {
      alert('Could not get current location. Please allow location or add pins manually.');
      // fallback center
      map.setView([20, 0], 2);
    });

    // click to pin (only if pin mode enabled)
    map.on('click', function (e) {
      if (!pinMode) return;
      addPin(e.latlng.lat, e.latlng.lng);
    });
  }

  function setCurrentMarker(pos) {
    if (currentMarker) currentMarker.remove();
    currentMarker = L.circleMarker([pos.lat, pos.lng], {
      radius: 8, fillColor: '#0ea5a4', color: '#fff', weight: 2, fillOpacity: 1
    }).addTo(map).bindPopup('Your current location');
  }

  function addPin(lat, lng) {
    const label = pinnedPoints.length + 1;
    const m = L.marker([lat, lng], { title: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }).addTo(map).bindPopup(`Pin ${label}`);
    pinnedPoints.push({ lat, lng, marker: m });
    fitMapToPins();
    renderRouteFromCurrent();
  }

  function fitMapToPins() {
    const bounds = L.latLngBounds([]);
    if (currentPos) bounds.extend([currentPos.lat, currentPos.lng]);
    pinnedPoints.forEach(p => bounds.extend([p.lat, p.lng]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
  }

  function clearPins() {
    pinnedPoints.forEach(p => { if (p.marker) p.marker.remove(); });
    pinnedPoints = [];
    if (routeControl) { routeControl.remove(); routeControl = null; }
  }

  // Build and render road-based route using OSRM via Leaflet Routing Machine
  function renderRouteFromCurrent() {
    if (!currentPos) return;
    if (pinnedPoints.length === 0) {
      if (routeControl) { routeControl.remove(); routeControl = null; }
      return;
    }

    // points array for optimization
    const points = pinnedPoints.map(p => ({ lat: p.lat, lng: p.lng }));
    const optimized = optimizeRoute({ lat: currentPos.lat, lng: currentPos.lng }, points);

    // waypoints for L.Routing: origin=currentPos, ...optimized
    const waypoints = [ L.latLng(currentPos.lat, currentPos.lng), ...optimized.map(p => L.latLng(p.lat, p.lng)) ];

    // remove old control
    if (routeControl) { routeControl.remove(); routeControl = null; }

    // create route control using OSRM public server
    routeControl = L.Routing.control({
      waypoints: waypoints,
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1'
      }),
      createMarker: function(i, wp, nWps) {
        // Keep markers numbered starting from 1 after origin:
        if (i === 0) return L.circleMarker(wp.latLng, { radius:6, fillColor:'#0ea5a4', color:'#fff', weight:2, fillOpacity:1 }).bindPopup('Start (current location)');
        const idx = i; // 1..n
        return L.marker(wp.latLng, { title: `Stop ${idx}` }).bindPopup(`Stop ${idx}`);
      },
      show: false,
      addWaypoints: false,
      routeWhileDragging: false,
      fitSelectedRoute: true,
      autoRoute: true
    }).addTo(map);

    // re-number pinned markers to match the optimized order (excluding origin)
    // remove old pin markers and recreate from optimized
    pinnedPoints.forEach(p => { if (p.marker) p.marker.remove(); });
    pinnedPoints = optimized.map((p, idx) => {
      const m = L.marker([p.lat, p.lng], { title: `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` }).addTo(map).bindPopup(`Pin ${idx+1}`);
      return { lat: p.lat, lng: p.lng, marker: m };
    });
  }

  // --- Save/load routes ---
  function saveCurrentRoute() {
    if (pinnedPoints.length === 0) { alert('No pinned points to save.'); return; }
    const name = (routeNameInput.value || '').trim();
    if (!name) { alert('Enter a route name'); return; }
    const points = pinnedPoints.map(p => ({ lat: p.lat, lng: p.lng }));
    const entry = { id: Date.now().toString(), name, points };
    savedRoutes.push(entry);
    persistRoutes();
    refreshSavedRoutesDropdown();
    savedRoutesSelect.value = entry.id;
    selectedRouteId = entry.id;
    deleteRouteBtn.style.display = 'inline-block';
    alert('Route saved.');
  }

  function loadRouteById(id) {
    const r = savedRoutes.find(s => s.id === id);
    if (!r) return;
    // clear existing pins
    pinnedPoints.forEach(p => p.marker && p.marker.remove());
    pinnedPoints = r.points.map((p, idx) => {
      const m = L.marker([p.lat, p.lng]).addTo(map).bindPopup(`Pin ${idx+1}`);
      return { lat: p.lat, lng: p.lng, marker: m };
    });
    selectedRouteId = id;
    deleteRouteBtn.style.display = 'inline-block';
    renderRouteFromCurrent();
  }

  function deleteRoute(id) {
    if (!confirm('Delete this saved route?')) return;
    savedRoutes = savedRoutes.filter(s => s.id !== id);
    persistRoutes();
    refreshSavedRoutesDropdown();
    selectedRouteId = '';
    deleteRouteBtn.style.display = 'none';
    clearPins();
  }

  // --- Start navigation in Google Maps ---
  function startNavigation() {
    if (!currentPos) { alert('Current position unknown.'); return; }
    if (pinnedPoints.length === 0) { alert('No pinned points to navigate.'); return; }
  
    // Ensure optimization before navigation
    const points = pinnedPoints.map(p => ({ lat: p.lat, lng: p.lng }));
    const optimized = optimizeRoute(currentPos, points);
  
    // Build route for Google Maps
    const origin = `${currentPos.lat},${currentPos.lng}`;
    const destination = `${optimized[optimized.length - 1].lat},${optimized[optimized.length - 1].lng}`;
    const waypoints = optimized.slice(0, optimized.length - 1)
      .map(p => `${p.lat},${p.lng}`)
      .join('|');
  
    const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
    if (waypoints) params.append('waypoints', waypoints);
    const url = `https://www.google.com/maps/dir/?${params.toString()}`;
  
    // Open in system maps app (Cordova) or browser
    if (window.cordova && cordova.InAppBrowser) {
      cordova.InAppBrowser.open(url, '_system');
    } else {
      window.open(url, '_blank');
    }
  }
  
  // --- Wire UI events ---
  function wireEvents() {
    pinModeCheckbox.addEventListener('change', (e) => { pinMode = e.target.checked; });

    saveRouteBtn.addEventListener('click', saveCurrentRoute);
    clearPinsBtn.addEventListener('click', () => {
      if (!confirm('Clear all pinned locations?')) return;
      clearPins();
    });

    savedRoutesSelect.addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id) { selectedRouteId = ''; deleteRouteBtn.style.display = 'none'; return; }
      loadRouteById(id);
    });

    deleteRouteBtn.addEventListener('click', () => {
      const id = savedRoutesSelect.value;
      if (!id) return;
      deleteRoute(id);
    });

    startNavBtn.addEventListener('click', startNavigation);

    // Retry location when app resumes (Cordova)
    document.addEventListener('resume', () => {
      if (map) map.locate({ setView: false, maxZoom: 16 });
    }, false);
  }

  // --- Init ---
  function initApp() {
    loadPersistedRoutes();
    wireEvents();
    initMap();
  }

  // Start on deviceready if Cordova exists else DOMContentLoaded for browser testing
  if (window.cordova) {
    document.addEventListener('deviceready', initApp, false);
  } else {
    document.addEventListener('DOMContentLoaded', initApp);
  }

})();
