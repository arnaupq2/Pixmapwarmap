// ---------------- MAPA ----------------
const map = L.map('map').setView([48.5, 32], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

// ---------------- CAPAS ----------------
const frentesLayer = new L.LayerGroup().addTo(map);
const tropasLayer = new L.LayerGroup().addTo(map);

// ---------------- CONTENEDOR NOTICIAS ----------------
const newsContainer = document.getElementById('newsContainer');

// ---------------- ICONOS ----------------
const iconMap = {
  'enemigos': 'recursos/enemigos.png',
  'ataque': 'recursos/ataque.png',
  'anuncio': 'recursos/anuncio.png',
  'ukrainecapital': 'recursos/ukrainecapital.png'
};

// Devuelve URL de icono a usar
function resolveIconUrl(props) {
  if (props.image) return props.image;
  if (props.tipo) {
    const key = String(props.tipo).toLowerCase().replace(/\.[a-z]+$/i, '');
    return iconMap[key] || `recursos/${key}.png`;
  }
  if (props.name) {
    const key = String(props.name).toLowerCase().replace(/\s+/g, '').replace(/\.[a-z]+$/i, '');
    return iconMap[key] || null;
  }
  return null;
}

// ---------------- CARGAR FRENTES ----------------
async function loadFrentes() {
  try {
    const res = await fetch('frentes.json');
    const data = await res.json();

    frentesLayer.clearLayers();
    tropasLayer.clearLayers();

    const features = data.features || data;

    features.forEach(f => {
      if (!f || !f.geometry) return;

      const props = f.properties || {};

      // Polígonos
      if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') {
        const coordsToLatLngs = (coords) => coords[0].map(c => [c[1], c[0]]);
        const latlngs = f.geometry.type === 'Polygon' ? coordsToLatLngs(f.geometry.coordinates)
                                                     : coordsToLatLngs(f.geometry.coordinates[0]);
        const poly = L.polygon(latlngs, {
          color: props.color || '#ff0000',
          fillOpacity: typeof props.fillOpacity === 'number' ? props.fillOpacity : 0.4,
          weight: typeof props.weight === 'number' ? props.weight : 2
        });
        if (props.name) poly.bindPopup(`<b>${props.name}</b>`);
        poly.on('mouseover', () => poly.setStyle({ fillOpacity: 0.6 }));
        poly.on('mouseout', () => poly.setStyle({ fillOpacity: typeof props.fillOpacity === 'number' ? props.fillOpacity : 0.4 }));
        frentesLayer.addLayer(poly);

      // Puntos
      } else if (f.geometry.type === 'Point') {
        const lat = f.geometry.coordinates[1];
        const lng = f.geometry.coordinates[0];
        const iconUrl = resolveIconUrl(props);

        let marker;
        if (iconUrl) {
          const icon = L.icon({
            iconUrl,
            iconSize: props.iconSize || [32, 32],
            iconAnchor: props.iconAnchor || [16, 16]
          });
          marker = L.marker([lat, lng], {
            icon,
            rotationAngle: props.angle || props.angulo || 0
          });
        } else {
          marker = L.marker([lat, lng]);
        }

        if (props.name) marker.bindPopup(`<b>${props.name}</b>`);
        tropasLayer.addLayer(marker);
      }
    });
  } catch (err) {
    console.error('Error cargando frentes.json:', err);
  }
}

// ---------------- CARGAR NOTICIAS ----------------
async function loadNews() {
  try {
    const res = await fetch('noticias.json');
    const noticias = await res.json();
    renderNews(noticias);
  } catch (err) {
    console.error('Error cargando noticias.json:', err);
  }
}

function renderNews(noticias) {
  if (!newsContainer) return;
  newsContainer.innerHTML = '';

  noticias.forEach((n, i) => {
    const div = document.createElement('div');
    div.className = 'newsItem';
    div.innerHTML = `
      <h4>${escapeHtml(n.text || '')}</h4>
      <p>${escapeHtml(n.description || '')}</p>
    `;
    newsContainer.appendChild(div);
  });
}

// ---------------- UTIL ----------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------- INICIALIZACIÓN ----------------
(async function init() {
  await loadFrentes();
  await loadNews();
})();

// ---------------- OPCIONAL ----------------
// Para recargar desde consola si cambian los JSON
window.reloadFrentes = loadFrentes;
window.reloadNews = loadNews;
