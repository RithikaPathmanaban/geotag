const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let pinMode = false;
let pins = []; // { x, y, lat, lng }
let currentPos = null;
let mapRect = null;

function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  mapRect = canvas.getBoundingClientRect();
  redraw();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw route lines
  for (let i = 0; i < pins.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(pins[i].x, pins[i].y);
    ctx.lineTo(pins[i + 1].x, pins[i + 1].y);
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw pins
  pins.forEach((pin, idx) => {
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = idx === 0 ? 'green' : 'red';
    ctx.fill();
    ctx.stroke();
  });

  // Draw current location
  if (currentPos) {
    ctx.beginPath();
    ctx.arc(currentPos.x, currentPos.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'orange';
    ctx.fill();
    ctx.stroke();
  }
}

document.getElementById('pinModeBtn').onclick = () => {
  pinMode = !pinMode;
  document.getElementById('pinModeBtn').innerText = pinMode ? 'Disable Pin Mode' : 'Enable Pin Mode';
};

canvas.addEventListener('click', (e) => {
  if (!pinMode) return;
  const x = e.offsetX;
  const y = e.offsetY;

  // Fake coordinates (simulate lat/lng)
  const lat = parseFloat(document.getElementById('lat').value) + (Math.random() - 0.5) * 0.01;
  const lng = parseFloat(document.getElementById('lng').value) + (Math.random() - 0.5) * 0.01;

  pins.push({ x, y, lat, lng });
  redraw();
});

document.getElementById('clearBtn').onclick = () => {
  pins = [];
  redraw();
};

document.getElementById('saveRouteBtn').onclick = () => {
  const name = document.getElementById('routeName').value.trim();
  if (!name) return alert('Enter a route name');
  const routes = JSON.parse(localStorage.getItem('routes') || '{}');
  routes[name] = pins;
  localStorage.setItem('routes', JSON.stringify(routes));
  loadRoutes();
};

document.getElementById('routeSelect').onchange = (e) => {
  const name = e.target.value;
  if (!name) return;
  const routes = JSON.parse(localStorage.getItem('routes') || '{}');
  pins = routes[name] || [];
  redraw();
};

function loadRoutes() {
  const select = document.getElementById('routeSelect');
  select.innerHTML = '<option value="">-- Select Saved Route --</option>';
  const routes = JSON.parse(localStorage.getItem('routes') || '{}');
  Object.keys(routes).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    select.appendChild(opt);
  });
}

if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    document.getElementById('lat').value = lat.toFixed(6);
    document.getElementById('lng').value = lng.toFixed(6);
    currentPos = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      lat,
      lng
    };
    redraw();
  }, err => {
    alert("Geolocation failed.");
  });
}

document.getElementById('optimizeBtn').onclick = () => {
  if (pins.length < 3) return alert('Add at least 3 points to optimize.');

  const start = pins[0];
  let unvisited = pins.slice(1);
  let route = [start];

  let current = start;
  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDist = distance(current, unvisited[0]);
    for (let i = 1; i < unvisited.length; i++) {
      const dist = distance(current, unvisited[i]);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = i;
      }
    }
    current = unvisited.splice(nearestIdx, 1)[0];
    route.push(current);
  }

  pins = route;
  redraw();
};

function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

document.getElementById('navBtn').onclick = () => {
  if (!currentPos || pins.length < 1) return alert("Not enough points to navigate.");

  const origin = `${currentPos.lat},${currentPos.lng}`;
  const destination = `${pins[pins.length - 1].lat},${pins[pins.length - 1].lng}`;
  const waypoints = pins.slice(0, pins.length - 1)
    .map(p => `${p.lat},${p.lng}`)
    .join('|');

  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
  window.open(url, '_blank');
};

loadRoutes();
