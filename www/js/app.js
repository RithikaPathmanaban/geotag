// js/app.js
// Replace YOUR_API_KEY in HTML with your real API key (Directions + Maps JS enabled).

let map;
let userMarker = null;
let watchId = null;
let latField = null;
let lngField = null;

let taggedPoints = []; // each: {lat, lng, label}
let taggedMarkers = [];
let directionsService = null;
let directionsRenderer = null;
let isPinMode = false;
let savedRoutes = {}; // { name: [ {lat,lng}, ... ] }

// Limits
const MAX_WAYPOINTS_GOOGLE = 23; // Google Directions API limit (may vary by account)

// Called once Maps API loaded because we included the script before app.js
function initApp() {
  latField = document.getElementById("latField");
  lngField = document.getElementById("lngField");

  // Initialize map with a default center (will re-center when we get location)
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 10.7905, lng: 78.7047 },
    zoom: 15,
    mapTypeId: "roadmap",
    fullscreenControl: false,
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true, // we place our own markers
    preserveViewport: true,
  });

  // UI elements
  document.getElementById("btnGetLocation").addEventListener("click", () => {
    getCurrentLocation((pos) => {
      panTo(pos);
    });
  });

  document.getElementById("btnPinMode").addEventListener("click", togglePinMode);
  document.getElementById("btnSaveRoute").addEventListener("click", saveCurrentRoute);
  document.getElementById("savedRoutesDropdown").addEventListener("change", onSavedRouteSelected);
  document.getElementById("btnStartNavigation").addEventListener("click", startOptimizedNavigation);
  document.getElementById("btnStopNavigation").addEventListener("click", stopNavigation);
  document.getElementById("btnClearTags").addEventListener("click", () => clearTaggedLocations(true));
  document.getElementById("btnShowTagged").addEventListener("click", showTaggedMarkers);

  loadSavedRoutes();

  // Map click — only pin when pin mode enabled
  map.addListener("click", (e) => {
    if (!isPinMode) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    addTaggedPoint({ lat, lng }, `Pinned ${taggedPoints.length + 1}`);
    // Optionally keep pin mode on or auto-turn off:
    // isPinMode = false; updatePinButton();
  });

  // Start watching user location (updates lat/lng fields & marker)
  if (navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        updateUserLocation({ lat, lng });
      },
      (err) => {
        console.warn("Geolocation watch error:", err);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  } else {
    alert("Geolocation not supported in this browser.");
  }
}

/* ---------- Location & UI helpers ---------- */

function updateUserLocation(latlng) {
  latField.value = latlng.lat.toFixed(6);
  lngField.value = latlng.lng.toFixed(6);

  const pos = new google.maps.LatLng(latlng.lat, latlng.lng);

  if (!userMarker) {
    userMarker = new google.maps.Marker({
      position: pos,
      map: map,
      title: "You are here",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#2c7be5",
        fillOpacity: 1,
        strokeColor: "white",
        strokeWeight: 2,
      },
    });
    map.panTo(pos);
  } else {
    userMarker.setPosition(pos);
  }
}

function panTo(latlng) {
  map.panTo(new google.maps.LatLng(latlng.lat, latlng.lng));
}

function getCurrentLocation(cb) {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      updateUserLocation({ lat, lng });
      if (cb) cb({ lat, lng });
    },
    (err) => {
      alert("Error getting location: " + err.message);
    },
    { enableHighAccuracy: true }
  );
}

/* ---------- Tagging (pin) behavior ---------- */

function togglePinMode() {
  isPinMode = !isPinMode;
  updatePinButton();
}

function updatePinButton() {
  const btn = document.getElementById("btnPinMode");
  btn.textContent = isPinMode ? "📍 Pin Mode: ON" : "📍 Pin Mode";
  btn.style.background = isPinMode ? "#e9f2ff" : "";
  btn.style.border = isPinMode ? "1px solid #b6d4ff" : "1px solid transparent";
}

function addTaggedPoint(latlng, label) {
  // latlng = {lat, lng}
  taggedPoints.push({ lat: latlng.lat, lng: latlng.lng, label: label || "" });

  const marker = new google.maps.Marker({
    position: latlng,
    map: map,
    title: label || "Tagged",
    icon: {
      url: "https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2.png",
      scaledSize: new google.maps.Size(27, 40),
    },
  });

  const infow = new google.maps.InfoWindow({
    content: `<div style="font-size:13px"><strong>${label || "Tagged Point"}</strong><div style="font-size:12px"> ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}</div></div>`
  });

  marker.addListener("click", () => infow.open(map, marker));
  taggedMarkers.push(marker);

  // If you want to automatically show updated route while tagging:
  // tryRenderPreviewRoute();

  updatePinButton();
}

function clearTaggedLocations(showAlert = true) {
  taggedPoints = [];
  taggedMarkers.forEach(m => m.setMap(null));
  taggedMarkers = [];

  // Clear directions
  if (directionsRenderer) {
    directionsRenderer.setDirections({ routes: [] });
  }

  if (showAlert) alert("Tagged locations cleared.");
}

function showTaggedMarkers() {
  if (taggedMarkers.length === 0) {
    alert("No tagged points to show.");
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  taggedMarkers.forEach(m => bounds.extend(m.getPosition()));
  map.fitBounds(bounds, { top: 30, bottom: 30, left: 30, right: 30 });
}

/* ---------- Save / Load routes (localStorage) ---------- */

function saveCurrentRoute() {
  if (taggedPoints.length < 1) {
    alert("Tag at least one point to save a route.");
    return;
  }
  const nameField = document.getElementById("routeNameInput");
  let name = nameField.value.trim();
  if (!name) name = "Route " + new Date().toLocaleString();
  savedRoutes[name] = taggedPoints.map(p => ({ lat: p.lat, lng: p.lng }));
  localStorage.setItem("savedRoutes", JSON.stringify(savedRoutes));
  updateSavedRoutesDropdown();
  nameField.value = "";
  alert(`Route "${name}" saved.`);
}

function loadSavedRoutes() {
  const saved = localStorage.getItem("savedRoutes");
  if (saved) {
    try {
      savedRoutes = JSON.parse(saved);
    } catch (e) {
      savedRoutes = {};
    }
  } else {
    savedRoutes = {};
  }
  updateSavedRoutesDropdown();
}

function updateSavedRoutesDropdown() {
  const dd = document.getElementById("savedRoutesDropdown");
  dd.innerHTML = "<option value=''>Select a saved route</option>";
  Object.keys(savedRoutes).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    dd.appendChild(opt);
  });
}

function onSavedRouteSelected(e) {
  const name = e.target.value;
  if (!name) return;
  // load taggedPoints from saved route and display markers & immediately show optimized route from current location
  clearTaggedLocations(false);
  const pts = savedRoutes[name];
  pts.forEach((p, i) => addTaggedPoint({ lat: p.lat, lng: p.lng }, `Saved ${i+1}`));
  // Ensure we have current position then compute route
  if (userMarker) {
    const pos = userMarker.getPosition();
    computeOptimizedThenRender({ lat: pos.lat(), lng: pos.lng() });
  } else {
    getCurrentLocation((pos) => computeOptimizedThenRender(pos));
  }
}

/* ---------- Routing & TSP logic using Google Directions ---------- */

/*
 Approach:
 1) To get an optimized visiting order (start = user, end = free), first
    call DirectionsService with origin = user, destination = user, waypoints = all tagged points, optimizeWaypoints=true.
    This returns waypoint_order (optimized order).
 2) Use that order to determine last point (end). Then do a second DirectionsService call with:
       origin = user, destination = lastOptimizedPoint, waypoints = other points in the optimized order (in that specific order),
       optimizeWaypoints=false // we already have order
    This yields a route that starts at user and ends at the last point of optimized sequence.
*/

function startOptimizedNavigation() {
  if (!userMarker) {
    alert("User location not available. Please allow location access.");
    return;
  }
  if (taggedPoints.length < 1) {
    alert("No tagged points to navigate.");
    return;
  }
  // check waypoint count
  if (taggedPoints.length > MAX_WAYPOINTS_GOOGLE) {
    alert(`Too many waypoints (${taggedPoints.length}). Google Directions supports up to ${MAX_WAYPOINTS_GOOGLE} waypoints. Remove some pins.`);
    return;
  }
  const pos = userMarker.getPosition();
  computeOptimizedThenRender({ lat: pos.lat(), lng: pos.lng() });
}

function computeOptimizedThenRender(current) {
  // Build waypoints (Google expects {location: LatLngLiteral, stopover: true})
  const waypointLocations = taggedPoints.map(p => ({ location: { lat: p.lat, lng: p.lng }, stopover: true }));

  // 1st call: origin=current destination=current waypoints=all, optimizeWaypoints=true
  directionsService.route({
    origin: current,
    destination: current,
    waypoints: waypointLocations,
    travelMode: google.maps.TravelMode.DRIVING,
    optimizeWaypoints: true
  }, (response, status) => {
    if (status !== "OK") {
      alert("Failed to compute optimized order: " + status);
      console.error(response);
      return;
    }

    const route = response.routes[0];
    const order = route.waypoint_order; // array of indices into waypointLocations

    // Build ordered points array:
    const ordered = order.map(idx => taggedPoints[idx]);

    if (ordered.length === 0) {
      alert("No waypoints returned by optimizer.");
      return;
    }

    // Last point becomes the destination in the final route
    const last = ordered[ordered.length - 1];
    const rest = ordered.slice(0, ordered.length - 1);

    // Build final waypoints param (as locations) keeping order (rest)
    const finalWaypoints = rest.map(p => ({ location: { lat: p.lat, lng: p.lng }, stopover: true }));

    // 2nd call: origin=current destination=last waypoints=finalWaypoints (ordered)
    directionsService.route({
      origin: current,
      destination: { lat: last.lat, lng: last.lng },
      waypoints: finalWaypoints,
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false
    }, (resp2, st2) => {
      if (st2 !== "OK") {
        alert("Failed to build final route: " + st2);
        console.error(resp2);
        return;
      }

      // Display route on map
      directionsRenderer.setDirections(resp2);

      // Place markers for origin/user, each waypoint in the optimized order, and final destination
      placeRouteMarkers(current, [...rest, last], resp2);
    });
  });
}

function placeRouteMarkers(origin, orderedPoints, directionsResp) {
  // Clear existing taggedMarkers (we keep pinned markers in taggedMarkers; remove
  // and re-add to avoid duplicates)
  taggedMarkers.forEach(m => m.setMap(null));
  taggedMarkers = [];

  // Origin marker (user)
  if (userMarker) userMarker.setMap(map);
  else {
    userMarker = new google.maps.Marker({
      position: origin,
      map: map,
      title: "You are here"
    });
  }

  // Add markers for the route sequence
  orderedPoints.forEach((p, i) => {
    const marker = new google.maps.Marker({
      position: { lat: p.lat, lng: p.lng },
      map: map,
      label: `${i + 1}`,
      title: `Stop ${i + 1}`
    });
    const infow = new google.maps.InfoWindow({
      content: `<div style="font-size:13px">Stop ${i+1}<div style="font-size:12px">${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div></div>`
    });
    marker.addListener("click", () => infow.open(map, marker));
    taggedMarkers.push(marker);
  });

  // Fit map to route bounds if available from directions response
  try {
    const bounds = new google.maps.LatLngBounds();
    const route = directionsResp.routes[0];
    route.overview_path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
  } catch (e) {
    console.warn("Could not fit bounds:", e);
  }

  // Optionally show turn-by-turn steps in console or UI:
  // extract steps from directionsResp.routes[0].legs
  console.log("Route legs:", directionsResp.routes[0].legs.map(l => ({
    start_address: l.start_address,
    end_address: l.end_address,
    distance: l.distance,
    duration: l.duration,
  })));
}

function stopNavigation() {
  // Clear directions and keep pins
  directionsRenderer.setDirections({ routes: [] });
  // Optionally remove route markers (we keep pinned markers)
}

/* ---------- Initialize app on load ---------- */
window.addEventListener("load", () => {
  // Wait a tick to ensure Google Maps loaded before initApp (Maps script is included before this file)
  if (typeof google === "undefined" || !google.maps) {
    alert("Google Maps script failed to load. Check your API key and network.");
    return;
  }
  initApp();
});
