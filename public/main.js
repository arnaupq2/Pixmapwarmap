// main.js
const map = L.map('map').setView([48.5, 32], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

const drawnItems = new L.FeatureGroup().addTo(map);
const tropasLayer = new L.LayerGroup().addTo(map);

const drawControl = new L.Control.Draw({
  draw: { polygon: { shapeOptions: { color: '#ff0000', fillOpacity: 0.5 } } },
  edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

const statusBox = document.getElementById('status');
const btnShowImages = document.getElementById('btnShowImages');
const imagePanel = document.getElementById('imagePanel');
const btnDeleteMarker = document.getElementById('btnDeleteMarker');

const btnAddNews = document.getElementById('btnAddNews');
const newsImageInput = document.getElementById('newsImage');
const newsTextInput = document.getElementById('newsText');
const newsContainer = document.getElementById('newsContainer');

let deleteMode = false;

function showStatus(msg, time = 2000) {
  statusBox.textContent = msg;
  statusBox.style.display = 'block';
  setTimeout(() => statusBox.style.display = 'none', time);
}

// --- Cargar frentes y tropas (solo lectura en GitHub Pages)
async function loadMap() {
  try {
    const res = await fetch('frentes.json');
    const data = await res.json();
    drawnItems.clearLayers(); tropasLayer.clearLayers();
    (data.features || []).forEach(f => {
      if (f.geometry.type === 'Polygon') {
        const coords = f.geometry.coordinates[0].map(c => [c[1], c[0]]);
        const poly = L.polygon(coords, { color: f.properties?.color || '#ff0000', fillOpacity: 0.5 });
        drawnItems.addLayer(poly);
      } else if (f.geometry.type === 'Point' && f.properties && f.properties.tipo) {
        const icon = L.icon({ iconUrl: `recursos/${f.properties.tipo}.png`, iconSize: [32, 32], iconAnchor: [16, 16] });
        const marker = L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { icon });
        marker.tipo = f.properties.tipo;
        marker.nombre = f.properties.nombre || '';
        marker.angulo = f.properties.angulo || 0;
        if (marker.nombre)
          marker.bindTooltip(marker.nombre, { permanent: false, direction: 'top', offset: [0, -16] });
        tropasLayer.addLayer(marker);
      }
    });
  } catch (e) {
    console.error(e);
  }
}

// --- Noticias ---
async function loadNews() {
  try {
    const res = await fetch('noticias.json');
    const noticias = await res.json();
    newsContainer.innerHTML = '';
    noticias.forEach(n => {
      const div = document.createElement('div');
      div.className = 'newsItem';
      if (n.imgBase64)
        div.innerHTML = `<img src="${n.imgBase64}"><p>${n.text || ''}</p>`;
      else
        div.innerHTML = `<p>${n.text || ''}</p>`;
      newsContainer.appendChild(div);
    });
  } catch (e) {
    console.error(e);
  }
}

// --- Inicialización ---
(async () => {
  await loadMap();
  await loadNews();
})();
