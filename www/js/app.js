let map, userMarker, watchId;
let taggedPoints = [];
let taggedMarkers = [];
let savedRoutes = {};
let routeLine = null;
let pinMode = false;

// Dynamic route tracking
let dynamicRouteLine = null;
let dynamicRoutePoints = [];

// OSRM server URL
const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving/";

// Custom icons
// Custom icons
const redIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

const greenIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

// === Initialize app ===
document.addEventListener("deviceready", initApp);

function initApp() {
  initMap();
  requestCurrentLocation();

  watchId = navigator.geolocation.watchPosition(
    pos => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      updateUserMarker(latlng);
      updateDynamicRoute(latlng);
    },
    geoError,
    { enableHighAccuracy: true }
  );

  document.getElementById("btnGetLocation").addEventListener("click", requestCurrentLocation);
  document.getElementById("btnTagLocation").addEventListener("click", tagCurrentLocation);
  document.getElementById("btnClearTags").addEventListener("click", clearTaggedLocations);
  document.getElementById("btnSaveRoute").addEventListener("click", saveCurrentRoute);
  document.getElementById("savedRoutesDropdown").addEventListener("change", loadRoute);
  document.getElementById("btnStartRoute").addEventListener("click", drawTSPRoute);

  document.getElementById("pinModeBtn").addEventListener("click", () => {
    pinMode = !pinMode;
    document.getElementById("pinModeBtn").textContent = pinMode ? "Disable Pin Mode" : "Enable Pin Mode";
  });

  document.getElementById("toggleControlsBtn").addEventListener("click", () => {
    document.getElementById("controlsPanel").classList.toggle("hidden");
  });
  document.getElementById("btnRecenter").addEventListener("click", () => {
    if (userMarker) {
      map.hasMovedManually = false;
      map.setView(userMarker.getLatLng(), 15);
    }
  });
  

  loadSavedRoutes();
}

// Map initialization
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([13.0827, 80.2707], 15);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  // Track when user manually moves the map
  map.hasMovedManually = false;
  map.on("dragstart", function () {
    map.hasMovedManually = true;
  });

  map.on("click", function (e) {
    if (pinMode) {
      const latlng = [e.latlng.lat, e.latlng.lng];
      taggedPoints.push(latlng);
      const marker = L.marker(latlng, { icon: greenIcon })
        .addTo(map)
        .bindPopup("Tagged Point " + taggedPoints.length)
        .openPopup();
      taggedMarkers.push(marker);
    }
  });
}

// Current location
function requestCurrentLocation() {
  if (!navigator.geolocation) return alert("Geolocation not supported");
  navigator.geolocation.getCurrentPosition(
    pos => updateUserMarker([pos.coords.latitude, pos.coords.longitude]),
    geoError,
    { enableHighAccuracy: true }
  );
}

function updateUserMarker(latlng) {
  document.getElementById("latField").value = latlng[0].toFixed(6);
  document.getElementById("lngField").value = latlng[1].toFixed(6);

  if (userMarker) {
    userMarker.setLatLng(latlng);
  } else {
    userMarker = L.marker(latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup("You are here")
      .openPopup();
    map.setView(latlng, 15);
  }

  // Only auto-pan initially, not every time
  if (!map.hasMovedManually) {
    map.panTo(latlng);
  }
}


// Tagging
function tagCurrentLocation() {
  if (!userMarker) return alert("Current location not available");
  const latlng = [userMarker.getLatLng().lat, userMarker.getLatLng().lng];
  taggedPoints.push(latlng);

  const marker = L.marker(latlng, { icon: greenIcon })
    .addTo(map)
    .bindPopup("Tagged Point " + taggedPoints.length)
    .openPopup();
  taggedMarkers.push(marker);
}

// Clear
function clearTaggedLocations() {
  taggedPoints = [];
  taggedMarkers.forEach(m => map.removeLayer(m));
  taggedMarkers = [];
  if (routeLine) map.removeLayer(routeLine);
  if (dynamicRouteLine) map.removeLayer(dynamicRouteLine);
  routeLine = null;
  dynamicRouteLine = null;
  dynamicRoutePoints = [];
}

// Save/Load
function saveCurrentRoute() {
  const name = document.getElementById("routeNameInput").value.trim();
  if (!name) return alert("Enter a route name");
  if (taggedPoints.length < 2) return alert("Tag at least two points to save");

  savedRoutes[name] = taggedPoints.slice();
  localStorage.setItem("savedRoutes", JSON.stringify(savedRoutes));
  updateSavedRoutesDropdown();
  document.getElementById("routeNameInput").value = "";
  alert(`Route "${name}" saved`);
}

function loadSavedRoutes() {
  const saved = localStorage.getItem("savedRoutes");
  if (saved) savedRoutes = JSON.parse(saved);
  updateSavedRoutesDropdown();
}

function updateSavedRoutesDropdown() {
  const dropdown = document.getElementById("savedRoutesDropdown");
  dropdown.innerHTML = '<option value="">Select a saved route</option>';
  Object.keys(savedRoutes).forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    dropdown.appendChild(option);
  });
}

function loadRoute() {
  const name = document.getElementById("savedRoutesDropdown").value;
  if (!name) return;
  clearTaggedLocations();
  taggedPoints = savedRoutes[name].slice();
  taggedPoints.forEach((p, i) => {
    const marker = L.marker(p, { icon: greenIcon })
      .addTo(map)
      .bindPopup("Point " + (i + 1));
    taggedMarkers.push(marker);
  });
  drawTSPRoute();
}

// TSP
function solveTSP(points) {
  if (points.length <= 2) return points;

  const start = points[0];
  const rest = points.slice(1);

  let bestOrder = [];
  let bestDistance = Infinity;

  const permute = (arr, prefix = []) => {
    if (arr.length === 0) {
      const route = [start, ...prefix];
      const dist = totalDistance(route);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestOrder = route;
      }
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      permute([...arr.slice(0, i), ...arr.slice(i + 1)], [...prefix, arr[i]]);
    }
  };

  permute(rest);
  return bestOrder;
}

function totalDistance(route) {
  let sum = 0;
  for (let i = 0; i < route.length - 1; i++) {
    sum += haversineDistance(route[i], route[i + 1]);
  }
  return sum;
}

function haversineDistance(a, b) {
  const R = 6371e3;
  const toRad = deg => deg * Math.PI / 180;
  const φ1 = toRad(a[0]), φ2 = toRad(b[0]);
  const Δφ = toRad(b[0] - a[0]), Δλ = toRad(b[1] - a[1]);
  const sa = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
  return R * c;
}

// Draw TSP route
async function drawTSPRoute() {
  if (!userMarker || taggedPoints.length < 1) {
    alert("Please tag at least one destination point first");
    return;
  }

  const currentLoc = [userMarker.getLatLng().lat, userMarker.getLatLng().lng];
  const points = [currentLoc, ...taggedPoints];

  // Convert to OSRM format (lng,lat)
  const coords = points.map(p => `${p[1]},${p[0]}`).join(";");

  const url = `${OSRM_BASE}${coords}?overview=full&geometries=geojson&steps=true`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (!data.routes || !data.routes.length) {
      alert("No route found");
      return;
    }

    // Remove old line if exists
    if (routeLine) map.removeLayer(routeLine);

    // Draw actual road route
    routeLine = L.geoJSON(data.routes[0].geometry, {
      color: "blue",
      weight: 5
    }).addTo(map);

    map.fitBounds(routeLine.getBounds());

    // Optional: show total distance/time
    const distance = (data.routes[0].distance / 1000).toFixed(2);
    const duration = Math.round(data.routes[0].duration / 60);
    alert(`Route ready: ${distance} km, ${duration} min`);
  } catch (err) {
    console.error(err);
    alert("Error fetching road-based route");
  }
}

// Update dynamic route
function updateDynamicRoute(currentLoc) {
  if (!dynamicRoutePoints.length || !dynamicRouteLine) return;

  while (dynamicRoutePoints.length > 0) {
    const nextPoint = dynamicRoutePoints[0];
    const distance = haversineDistance(currentLoc, nextPoint);
    if (distance < 20) {
      dynamicRoutePoints.shift();
    } else {
      break;
    }
  }

  if (dynamicRouteLine) map.removeLayer(dynamicRouteLine);
  if (dynamicRoutePoints.length > 1) {
    dynamicRouteLine = L.polyline(dynamicRoutePoints, { color: "blue", weight: 5 }).addTo(map);
  }
}

function geoError(err) {
  console.error("Geolocation error:", err);
  alert("Error getting location: " + err.message);
}
