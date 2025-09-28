let map, routeLine, userMarker, watchId;
let taggedPoints = [];
let taggedRouteLine = null;

// === 6 static route points around Chennai ===
const staticPoints = [
  { lat: 12.97987, lng: 80.23985 },
  { lat: 12.97997, lng: 80.23992 },
  { lat: 12.98016, lng: 80.23995 },
  { lat: 12.98015, lng: 80.23976 },
  { lat: 12.98007, lng: 80.23956 },
  { lat: 12.98017, lng: 80.23954 },
];

// Red icon: current user location
const redIcon = L.icon({
  iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Arrow_up_font_awesome.svg/512px-Arrow_up_font_awesome.svg.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Green custom icon: tagged locations
const taggedIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  shadowSize: [41, 41],
  shadowAnchor: [12, 41]
});

// Wait for device ready
document.addEventListener('deviceready', () => {
  const permissions = cordova.plugins.permissions;
  const perms = [
    permissions.ACCESS_FINE_LOCATION,
    permissions.ACCESS_COARSE_LOCATION
  ];

  permissions.hasPermission(perms, function (status) {
    if (status.hasPermission) {
      console.log("Location permissions granted");
      initApp();
    } else {
      permissions.requestPermissions(perms, function (status) {
        if (status.hasPermission) {
          console.log("Permissions granted after request");
          initApp();
        } else {
          alert("Location permissions denied. The app may not work properly.");
        }
      }, function () {
        alert("Failed to request permissions");
      });
    }
  }, function () {
    alert("Failed to check permissions");
  });
});

// Initialize after permissions
function initApp() {
  initMap();
  drawStaticRoute();

  document.getElementById("btnGetLocation").addEventListener("click", updateCurrentLocation);
  document.getElementById("btnTagLocation").addEventListener("click", tagCurrentLocation);
  document.getElementById("btnClearTags").addEventListener("click", clearTaggedLocations);

  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(updateUserPosition, geoError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    });
  }
}

// Map setup
function initMap() {
  map = L.map('map').setView([staticPoints[0].lat, staticPoints[0].lng], 18);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);
}

// Draw static route (blue line)
function drawStaticRoute() {
  const latlngs = [];
  staticPoints.forEach((p, i) => {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const valid = isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
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
    L.marker([lat, lng]).addTo(map).bindPopup("Point " + (i + 1));
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

  navigator.geolocation.getCurrentPosition(pos => {
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
  }, geoError, { enableHighAccuracy: true });
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
}

// ✅ Tag location with green icon and connect with polyline
function tagCurrentLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;

    const latlng = [lat, lng];
    taggedPoints.push(latlng);

    const marker = L.marker(latlng, { icon: taggedIcon })
      .addTo(map)
      .bindPopup("Tagged Point " + taggedPoints.length);
    marker.openPopup();

    if (taggedPoints.length >= 2) {
      if (taggedRouteLine) {
        taggedRouteLine.setLatLngs(taggedPoints);
      } else {
        taggedRouteLine = L.polyline(taggedPoints, {
          color: "green",
          weight: 4
        }).addTo(map);
      }
      map.fitBounds(taggedRouteLine.getBounds(), { padding: [30, 30] });
    }

  }, geoError, { enableHighAccuracy: true });
}

// ✅ Clear all tagged points and line
function clearTaggedLocations() {
  taggedPoints = [];

  // Remove all tagged markers (but not user or static markers)
  map.eachLayer(layer => {
    if (layer instanceof L.Marker &&
        layer !== userMarker &&
        !staticPoints.some(p =>
          layer.getLatLng().lat.toFixed(6) === p.lat.toFixed(6) &&
          layer.getLatLng().lng.toFixed(6) === p.lng.toFixed(6)
        )
    ) {
      map.removeLayer(layer);
    }
  });

  // Remove polyline
  if (taggedRouteLine) {
    map.removeLayer(taggedRouteLine);
    taggedRouteLine = null;
  }

  alert("Tagged locations cleared.");
}

// Handle geolocation errors
function geoError(err) {
  console.error("Geolocation error:", err.message, err);
  alert("Error getting location: " + err.message);
}
