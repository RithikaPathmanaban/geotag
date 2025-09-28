let map, routeLine, userMarker, watchId;
let taggedPoints = [];
let taggedRouteLine = null;
let taggedMarkers = [];


// Store saved routes as { routeName: [ [lat,lng], ... ] }
let savedRoutes = {};

// === 6 static route points around Chennai ===
const staticPoints = [
  { lat: 12.98052, lng: 80.24285 },
  { lat: 12.98025, lng: 80.24291 },
  { lat: 12.98061, lng: 80.24318 },
  { lat: 12.98053, lng: 80.24365 },
  { lat: 12.98025, lng: 80.24371 },
  { lat: 12.98001, lng: 80.24352 },
];

// Red icon: current user location
const redIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/1077/1077114.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Green custom icon: tagged locations
const taggedIcon = L.icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  shadowSize: [41, 41],
  shadowAnchor: [12, 41],
});

// Wait for device ready
document.addEventListener("deviceready", () => {
  const permissions = cordova.plugins.permissions;
  const perms = [
    permissions.ACCESS_FINE_LOCATION,
    permissions.ACCESS_COARSE_LOCATION,
  ];

  permissions.hasPermission(
    perms,
    function (status) {
      if (status.hasPermission) {
        console.log("Location permissions granted");
        initApp();
      } else {
        permissions.requestPermissions(
          perms,
          function (status) {
            if (status.hasPermission) {
              console.log("Permissions granted after request");
              initApp();
            } else {
              alert(
                "Location permissions denied. The app may not work properly."
              );
            }
          },
          function () {
            alert("Failed to request permissions");
          }
        );
      }
    },
    function () {
      alert("Failed to check permissions");
    }
  );
});

// Initialize after permissions
function initApp() {
  initMap();
  drawStaticRoute();

  document
    .getElementById("btnGetLocation")
    .addEventListener("click", updateCurrentLocation);
  document
    .getElementById("btnTagLocation")
    .addEventListener("click", tagCurrentLocation);
  document
    .getElementById("btnClearTags")
    .addEventListener("click", clearTaggedLocations);

  document
    .getElementById("btnSaveRoute")
    .addEventListener("click", saveCurrentRoute);
  document
    .getElementById("savedRoutesDropdown")
    .addEventListener("change", loadRoute);

  loadSavedRoutes();

  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      updateUserPosition,
      geoError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }
}

// Map setup
function initMap() {
  map = L.map("map").setView([staticPoints[0].lat, staticPoints[0].lng], 18);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);
}

// Draw static route (blue line)
function drawStaticRoute() {
  const latlngs = [];
  staticPoints.forEach((p, i) => {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const valid =
      isFinite(lat) &&
      isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180;
    if (valid) {
      latlngs.push([lat, lng]);
    } else {
      console.warn("Invalid coordinate at index", i, p);
    }
  });

  if (latlngs.length < 2) {
    console.error("Not enough valid points to draw route!");
    return;
  }

  routeLine = L.polyline(latlngs, { color: "blue", weight: 5 }).addTo(map);

  latlngs.forEach(([lat, lng], i) => {
    L.marker([lat, lng])
      .addTo(map)
      .bindPopup("Point " + (i + 1));
      taggedMarkers.push(marker);
  });

  try {
    const bounds = routeLine.getBounds();
    map.fitBounds(bounds, { padding: [20, 20] });
  } catch (e) {
    map.setView(latlngs[0], 18);
  }
}

// Get user location (manual button)
function updateCurrentLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      document.getElementById("latField").value = lat.toFixed(6);
      document.getElementById("lngField").value = lng.toFixed(6);

      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
        userMarker.setIcon(redIcon);
      } else {
        userMarker = L.marker([lat, lng], { icon: redIcon })
          .addTo(map)
          .bindPopup("You are here")
          .openPopup();
      }

      map.panTo([lat, lng]);
    },
    geoError,
    { enableHighAccuracy: true }
  );
}

// Update user marker automatically
function updateUserPosition(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;

  document.getElementById("latField").value = lat.toFixed(6);
  document.getElementById("lngField").value = lng.toFixed(6);

  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
    userMarker.setIcon(redIcon);
  } else {
    userMarker = L.marker([lat, lng], { icon: redIcon })
      .addTo(map)
      .bindPopup("You are here")
      .openPopup();
  }

  // After moving, trim the taggedPoints if the user has passed them
  if (isFollowingRoute) {
    trimCompletedRoute([lat, lng]);
  }
}

// Tag location with green icon and connect with polyline
function tagCurrentLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const latlng = [lat, lng];
      taggedPoints.push(latlng);

      const marker = L.marker(latlng, { icon: taggedIcon })
        .addTo(map)
        .bindPopup("Tagged Point " + taggedPoints.length);
      marker.openPopup();

      taggedMarkers.push(marker); // Save for later removal

      if (taggedPoints.length >= 2) {
        if (taggedRouteLine) {
          taggedRouteLine.setLatLngs(taggedPoints);
        } else {
          taggedRouteLine = L.polyline(taggedPoints, {
            color: "green",
            weight: 4,
          }).addTo(map);
        }
      }

      if (taggedRouteLine) {
        map.fitBounds(taggedRouteLine.getBounds(), { padding: [30, 30] });
      }
    },
    geoError,
    { enableHighAccuracy: true }
  );
}


// Clear all tagged points and line
function clearTaggedLocations(showAlert = true) {
  // Clear the array of coordinates
  taggedPoints = [];

  // Remove all tagged markers from the map
  taggedMarkers.forEach((marker) => {
    map.removeLayer(marker);
  });

  // Reset marker storage
  taggedMarkers = [];

  // Remove the green polyline if it exists
  if (taggedRouteLine) {
    map.removeLayer(taggedRouteLine);
    taggedRouteLine = null;
  }

  // Reset dropdown selection if any
  const dropdown = document.getElementById("savedRoutesDropdown");
  if (dropdown) {
    dropdown.value = "";
  }

  // Optional: Show alert
  if (showAlert) {
    alert("Tagged locations cleared.");
  }
}



// Save the current tagged route with a given name
function saveCurrentRoute() {
  const nameInput = document.getElementById("routeNameInput");
  const name = nameInput.value.trim();

  if (!name) {
    alert("Please enter a route name.");
    return;
  }

  if (!Array.isArray(taggedPoints) || taggedPoints.length < 2) {
    alert("Tag at least two points to save a route.");
    return;
  }
  

  savedRoutes[name] = taggedPoints.slice(); // clone the array
  localStorage.setItem("savedRoutes", JSON.stringify(savedRoutes));

  updateSavedRoutesDropdown();
  nameInput.value = "";
  alert(`Route "${name}" saved successfully.`);
}

// Load saved routes from localStorage on start
function loadSavedRoutes() {
  const saved = localStorage.getItem("savedRoutes");
  if (saved) {
    savedRoutes = JSON.parse(saved);
    updateSavedRoutesDropdown();
  }
}

// Update the dropdown options from savedRoutes object
function updateSavedRoutesDropdown() {
  const dropdown = document.getElementById("savedRoutesDropdown");
  dropdown.innerHTML = '<option value="">Select a saved route</option>';

  Object.keys(savedRoutes).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    dropdown.appendChild(option);
  });
}

// Load selected route from dropdown and display on map
function loadRoute() {
  const dropdown = document.getElementById("savedRoutesDropdown");
  const selectedName = dropdown.value;
  clearTaggedLocations(false);

  if (!selectedName) return;

  const points = savedRoutes[selectedName];
  if (!points || points.length < 1) return;

  // Get current user location (if available)
  let startLatLng;
  if (userMarker) {
    const latlng = userMarker.getLatLng();
    startLatLng = [latlng.lat, latlng.lng];
  } else {
    // fallback: start from first of points
    startLatLng = [points[0][0], points[0][1]];
  }

  // Sort the route so that it starts from current location
  const sorted = sortRouteFromStart(startLatLng, points);

  taggedPoints = sorted;

  taggedPoints.forEach((latlng, i) => {
    L.marker(latlng, { icon: taggedIcon })
      .addTo(map)
      .bindPopup("Point " + (i + 1));
  });

  taggedRouteLine = L.polyline(taggedPoints, {
    color: "green",
    weight: 4,
  }).addTo(map);

  map.fitBounds(taggedRouteLine.getBounds(), { padding: [30, 30] });
}

// Handle geolocation errors
function geoError(err) {
  console.error("Geolocation error:", err.message, err);
  alert("Error getting location: " + err.message);
}

function toggleControls() {
  const panel = document.getElementById("controlsPanel");
  panel.classList.toggle("hidden");
}

function trimCompletedRoute(currentLatLng) {
  if (!taggedRouteLine) return;

  // Compute distance to first point in taggedPoints
  if (taggedPoints.length === 0) return;

  const first = taggedPoints[0];
  const dist = haversineDistance(currentLatLng, first);

  const threshold = 20; // metres threshold to consider “reached” point
  if (dist < threshold) {
    // remove first point
    taggedPoints.shift();

    // redraw the upcoming route
    if (taggedRouteLine) {
      map.removeLayer(taggedRouteLine);
    }

    if (taggedPoints.length >= 1) {
      taggedRouteLine = L.polyline(taggedPoints, {
        color: "green",
        weight: 4,
      }).addTo(map);
    }
  }
}
function sortRouteFromStart(startLatLng, points) {
  const remaining = points.slice();
  const ordered = [];
  let current = [startLatLng[0], startLatLng[1]];

  while (remaining.length > 0) {
    // find nearest
    let minIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistance(current, remaining[i]);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    const next = remaining.splice(minIdx, 1)[0];
    ordered.push(next);
    current = next;
  }
  return ordered;
}
function haversineDistance(a, b) {
  const R = 6371e3; // metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const φ1 = toRad(a[0]);
  const φ2 = toRad(b[0]);
  const Δφ = toRad(b[0] - a[0]);
  const Δλ = toRad(b[1] - a[1]);

  const sa =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));

  return R * c; // in metres
}
