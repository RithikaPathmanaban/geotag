(function () {
  let map, currentPos = null, currentMarker = null;
  let pinMode = false, pinnedPoints = [], routeControl = null;
  let savedRoutes = [], selectedRouteId = "";

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
  function persistRoutes() { localStorage.setItem("geotag_saved_routes_v1", JSON.stringify(savedRoutes)); }
  function loadPersistedRoutes() {
    const raw = localStorage.getItem("geotag_saved_routes_v1");
    savedRoutes = raw ? JSON.parse(raw) : [];
    refreshSavedRoutesDropdown();
  }
  function refreshSavedRoutesDropdown() {
    savedRoutesSelect.innerHTML = '<option value="">-- Load saved route --</option>';
    savedRoutes.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id; opt.textContent = r.name;
      savedRoutesSelect.appendChild(opt);
    });
  }
  function haversine(a, b) {
    const R = 6371e3, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
    const sa = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(sa), Math.sqrt(1-sa));
  }

  function optimizeRoute(startCoord, points) {
    if(points.length===0) return [];
    if(points.length<=8){
      function permute(arr){
        const results=[];
        (function backtrack(temp, rem){
          if(rem.length===0) results.push(temp.slice());
          for(let i=0;i<rem.length;i++){
            temp.push(rem[i]);
            backtrack(temp, rem.slice(0,i).concat(rem.slice(i+1)));
            temp.pop();
          }
        })([], arr);
        return results;
      }
      const perms = permute(points);
      let best=null, bestD=Infinity;
      perms.forEach(order=>{
        let d=0, prev=startCoord;
        order.forEach(p=>{ d+=haversine(prev,p); prev=p; });
        if(d<bestD){ bestD=d; best=order; }
      });
      return best;
    }
    // Nearest neighbor + 2-opt
    const n=points.length, used=new Array(n).fill(false), order=[];
    let curr=startCoord;
    for(let i=0;i<n;i++){
      let bestIdx=-1, bestD=Infinity;
      for(let j=0;j<n;j++){
        if(used[j]) continue;
        const d=haversine(curr,points[j]);
        if(d<bestD){ bestD=d; bestIdx=j; }
      }
      used[bestIdx]=true; order.push(points[bestIdx]); curr=points[bestIdx];
    }
    // 2-opt improvement
    let improved=true;
    const r=order.slice();
    while(improved){
      improved=false;
      for(let i=0;i<r.length-1;i++){
        for(let k=i+1;k<r.length;k++){
          let d1=0, prev=startCoord; r.forEach(p=>{ d1+=haversine(prev,p); prev=p; });
          const newRoute=r.slice(0,i).concat(r.slice(i,k+1).reverse(), r.slice(k+1));
          let d2=0; prev=startCoord; newRoute.forEach(p=>{ d2+=haversine(prev,p); prev=p; });
          if(d2+1e-6<d1){ r.splice(0,r.length,...newRoute); improved=true; }
        }
      }
    }
    return r;
  }

  // --- Permission check ---
  function checkLocationPermission(callback){
    if(!window.cordova || !cordova.plugins || !cordova.plugins.diagnostic){
      callback(true); return;
    }
    cordova.plugins.diagnostic.isLocationAuthorized(function(authorized){
      if(authorized){ callback(true); } 
      else{
        navigator.notification.confirm(
          "This app needs access to your location. Allow now?",
          function(buttonIndex){
            if(buttonIndex===1){
              cordova.plugins.diagnostic.requestLocationAuthorization(function(status){
                if(status===cordova.plugins.diagnostic.permissionStatus.GRANTED || 
                   status===cordova.plugins.diagnostic.permissionStatus.GRANTED_WHEN_IN_USE)
                   callback(true);
                else{ alert("Location permission denied."); callback(false);}
              }, err=>{ alert("Permission request failed: "+err); callback(false); });
            } else { alert("Location permission required."); callback(false); }
          },
          "Permission Required",
          ["Allow","Deny"]
        );
      }
    }, err=>{ console.error("Permission check failed:", err); callback(true); });
  }

  // --- Map ---
  function initMap(){
    map=L.map('map',{zoomControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);

    map.locate({setView:true, maxZoom:16});
    map.on('locationfound', e=>{
      currentPos={lat:e.latitude||e.latlng.lat, lng:e.longitude||e.latlng.lng};
      setCurrentMarker(currentPos);
      latInput.value=currentPos.lat.toFixed(6);
      lngInput.value=currentPos.lng.toFixed(6);
    });
    map.on('locationerror', ()=>{ alert('Could not get location.'); map.setView([20,0],2); });
    map.on('click', e=>{ if(pinMode) addPin(e.latlng.lat,e.latlng.lng); });
  }

  function setCurrentMarker(pos){
    if(currentMarker) currentMarker.remove();
    currentMarker=L.circleMarker([pos.lat,pos.lng],{radius:8,fillColor:'#0ea5a4',color:'#fff',weight:2,fillOpacity:1})
      .addTo(map).bindPopup('Your current location');
  }

  function addPin(lat,lng){
    const label=pinnedPoints.length+1;
    const m=L.marker([lat,lng],{title:`${lat.toFixed(6)},${lng.toFixed(6)}`}).addTo(map).bindPopup(`Pin ${label}`);
    pinnedPoints.push({lat,lng,marker:m});
    fitMapToPins(); renderRouteFromCurrent();
  }

  function fitMapToPins(){
    const bounds=L.latLngBounds([]);
    if(currentPos) bounds.extend([currentPos.lat,currentPos.lng]);
    pinnedPoints.forEach(p=>bounds.extend([p.lat,p.lng]));
    if(bounds.isValid()) map.fitBounds(bounds,{padding:[40,40]});
  }

  function clearPins(){
    pinnedPoints.forEach(p=>p.marker&&p.marker.remove());
    pinnedPoints=[]; if(routeControl){ routeControl.remove(); routeControl=null; }
  }

  function renderRouteFromCurrent(){
    if(!currentPos) return;
    if(pinnedPoints.length===0){ if(routeControl){ routeControl.remove(); routeControl=null; } return; }

    const points=pinnedPoints.map(p=>({lat:p.lat,lng:p.lng}));
    const optimized=optimizeRoute(currentPos, points);
    const waypoints=[L.latLng(currentPos.lat,currentPos.lng), ...optimized.map(p=>L.latLng(p.lat,p.lng))];

    if(routeControl) routeControl.remove();
    routeControl=L.Routing.control({
      waypoints:waypoints,
      router:L.Routing.osrmv1({serviceUrl:'https://router.project-osrm.org/route/v1'}),
      createMarker:function(i, wp, nWps){
        if(i===0) return L.circleMarker(wp.latLng,{radius:6,fillColor:'#0ea5a4',color:'#fff',weight:2,fillOpacity:1}).bindPopup('Start (current location)');
        return L.marker(wp.latLng,{title:`Stop ${i}`}).bindPopup(`Stop ${i}`);
      },
      show:false, addWaypoints:false, routeWhileDragging:false, fitSelectedRoute:true, autoRoute:true
    }).addTo(map);

    pinnedPoints.forEach(p=>{ if(p.marker)p.marker.remove(); });
    pinnedPoints=optimized.map((p,idx)=>{
      const m=L.marker([p.lat,p.lng]).addTo(map).bindPopup(`Pin ${idx+1}`);
      return {lat:p.lat,lng:p.lng,marker:m};
    });
  }

  // --- Save/Load ---
  function saveCurrentRoute(){
    if(pinnedPoints.length===0){ alert('No pinned points.'); return; }
    const name=(routeNameInput.value||'').trim(); if(!name){ alert('Enter route name'); return; }
    const points=pinnedPoints.map(p=>({lat:p.lat,lng:p.lng}));
    const entry={id:Date.now().toString(), name, points};
    savedRoutes.push(entry); persistRoutes(); refreshSavedRoutesDropdown();
    savedRoutesSelect.value=entry.id; selectedRouteId=entry.id; deleteRouteBtn.style.display='inline-block';
    alert('Route saved.');
  }

  function loadRouteById(id){
    const r=savedRoutes.find(s=>s.id===id); if(!r) return;
    pinnedPoints.forEach(p=>p.marker&&p.marker.remove());
    pinnedPoints=r.points.map((p,idx)=>{ const m=L.marker([p.lat,p.lng]).addTo(map).bindPopup(`Pin ${idx+1}`); return {lat:p.lat,lng:p.lng,marker:m}; });
    selectedRouteId=id; deleteRouteBtn.style.display='inline-block';
    renderRouteFromCurrent();
  }

  function deleteRoute(id){
    if(!confirm('Delete this saved route?')) return;
    savedRoutes=savedRoutes.filter(s=>s.id!==id);
    persistRoutes(); refreshSavedRoutesDropdown(); selectedRouteId=''; deleteRouteBtn.style.display='none';
    clearPins();
  }

  // --- Google Maps Navigation ---
  function startNavigation() {
    if(!currentPos){ alert('Current position unknown.'); return; }
    if(pinnedPoints.length===0){ alert('No pinned points to navigate.'); return; }

    const points = pinnedPoints.map(p => ({lat:p.lat,lng:p.lng}));
    const optimized = optimizeRoute(currentPos, points);

    const destination = `${optimized[optimized.length-1].lat},${optimized[optimized.length-1].lng}`;
    const waypoints = optimized.slice(0, optimized.length - 1).map(p => `${p.lat},${p.lng}`).join(',');

    // Navigation intent URL
    let url = `google.navigation:q=${destination}&mode=d`;
    // For multiple waypoints, we cannot pass them here; Google Maps app only supports 1 destination in this intent.

    if(window.cordova && cordova.InAppBrowser){
        cordova.InAppBrowser.open(url,'_system');
    } else {
        window.open(url,'_blank'); // On desktop this won't auto-navigate
    }
}

  function wireEvents(){
    pinModeCheckbox.addEventListener('change', e=>{ pinMode=e.target.checked; });
    saveRouteBtn.addEventListener('click', saveCurrentRoute);
    clearPinsBtn.addEventListener('click', ()=>{ if(confirm('Clear all pinned locations?')) clearPins(); });
    savedRoutesSelect.addEventListener('change', e=>{ const id=e.target.value; if(!id){ selectedRouteId=''; deleteRouteBtn.style.display='none'; return; } loadRouteById(id); });
    deleteRouteBtn.addEventListener('click', ()=>{ const id=savedRoutesSelect.value; if(!id) return; deleteRoute(id); });
    startNavBtn.addEventListener('click', startNavigation);

    document.addEventListener('resume', ()=>{ if(map) map.locate({setView:false,maxZoom:16}); }, false);
  }

  function initApp(){
    checkLocationPermission(granted=>{
      if(granted){
        loadPersistedRoutes();
        wireEvents();
        initMap();
      }
    });
  }

  if(window.cordova){ document.addEventListener('deviceready', initApp, false); } 
  else{ document.addEventListener('DOMContentLoaded', initApp); }

})();
