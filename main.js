// main.js
const map = L.map('map').setView([48.5, 32], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

const drawnItems = new L.FeatureGroup().addTo(map);
const tropasLayer = new L.LayerGroup().addTo(map);

const newsContainer = document.getElementById('newsContainer');

// --- Cargar mapa (frentes y tropas) ---
async function loadMap() {
  try {
    const res = await fetch('frentes.json');
    const data = await res.json();
    drawnItems.clearLayers();
    tropasLayer.clearLayers();

    (data.features || []).forEach(f => {
      if (f.geometry.type === 'Polygon') {
        const coords = f.geometry.coordinates[0].map(c => [c[1], c[0]]);
        const poly = L.polygon(coords, {
          color: f.properties?.color || '#ff0000',
          fillOpacity: 0.5
        });
        drawnItems.addLayer(poly);

      } else if (f.geometry.type === 'Point' && f.properties) {
        // --- Nuevo manejo de puntos con imagen, rotación y nombre ---
        const iconUrl = f.properties.image || (f.properties.tipo ? `recursos/${f.properties.tipo}.png` : null);

        if (iconUrl) {
          const icon = L.icon({
            iconUrl: iconUrl,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          const marker = L.marker(
            [f.geometry.coordinates[1], f.geometry.coordinates[0]],
            {
              icon,
              rotationAngle: f.properties.angle || 0
            }
          );

          // Popup con el nombre
          if (f.properties.name) {
            marker.bindPopup(f.properties.name);
          }

          tropasLayer.addLayer(marker);
        }
      }
    });
  } catch (e) {
    console.error(e);
  }
}

// --- Noticias ---
let noticias = [];
async function loadNews() {
  try {
    const res = await fetch('noticias.json');
    noticias = await res.json();
    if (!Array.isArray(noticias)) noticias = [];
    renderNews();
  } catch (e) {
    console.error(e);
  }
}

function renderNews() {
  newsContainer.innerHTML = '';
  noticias.forEach(n => {
    const div = document.createElement('div');
    div.className = 'newsItem';
    const img = document.createElement('img');
    img.src = n.imgBase64 || '';
    const p = document.createElement('p');
    p.textContent = n.text || '';
    div.appendChild(img);
    div.appendChild(p);
    newsContainer.appendChild(div);
  });
}

// --- Inicialización ---
(async () => {
  await loadMap();
  await loadNews();
})();
