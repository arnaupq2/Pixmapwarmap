// ----------------------------------------------------------------------
// 1. CONFIGURATION & STATE
// ----------------------------------------------------------------------

if (typeof L === 'undefined') {
    alert("CRITICAL ERROR: Leaflet (L) is not loaded. Check 'libs/leaflet.js'.");
    throw new Error("Leaflet missing");
}

if (!L.Draw) {
    console.warn("Leaflet.Draw missing at startup - might be loading async");
}

const CONFIG = {
    DEFAULT_CENTER: [48.3794, 31.1656], // Ukraine Center
    DEFAULT_ZOOM: 6,
    DATE_FORMAT: 'en-GB',
    IS_ADMIN: false // Set to true for full access, false for "Normal User" (Ruler/Plan only)
};

const state = {
    currentDate: new Date(),
    history: {}, // Key: YYYY-MM-DD -> { features: {}, news: {} }
    drawActive: false,
    playInterval: null
};

// Utils
// Utils
const fmtDate = (d) => {
    if (!d) return '??.??.????';
    const datePart = d.toLocaleDateString(CONFIG.DATE_FORMAT).split('/').join('.');
    const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
};
const getKey = (d) => {
    // Robust local YYYY-MM-DD for storage keys (ignore time for daily buckets?)
    // If we want sub-daily history, we need a better key. 
    // For now, let's keep KEY as Day, but Display as Time.
    const offset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offset);
    return local.toISOString().split('T')[0];
};

// ----------------------------------------------------------------------
// 2. MAP INITIALIZATION
// ----------------------------------------------------------------------

const map = L.map('map', {
    zoomControl: false,
    center: CONFIG.DEFAULT_CENTER,
    zoom: CONFIG.DEFAULT_ZOOM
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

// DeepState Style Tile Layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: 'arnaupq',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

const featuresLayer = new L.FeatureGroup().addTo(map);
const newsLayer = new L.FeatureGroup().addTo(map);

// ----------------------------------------------------------------------
// 3. UI REFERENCES (Safe Selection)
// ----------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const ui = {
    navNews: $('nav-news'),
    navMap: $('nav-map'),
    navDraw: $('tool-draw'),

    // Panels
    newsPanel: $('news-panel'),
    toolPanel: $('tool-panel'),
    closeToolPanel: $('close-tool-panel'),
    closeNewsPanel: $('close-news-panel'),

    // Date & Play
    dateDisplay: $('date-display'),
    btnPrevDate: $('date-prev'),
    btnNextDate: $('date-next'),
    btnDatePick: $('date-picker-btn'),
    btnPlay: $('date-play'),
    inputDatePick: $('date-picker-input'),

    // Tools
    btnDrawPoly: $('draw-polygon'),
    btnDrawLine: $('draw-line'),
    btnDrawUnit: $('draw-unit'),
    btnDrawArrow: $('draw-arrow-icon'),
    btnDrawImage: $('draw-image'),
    btnDrawFort: $('draw-fort'),
    btnDrawRuler: $('draw-ruler'), // NEW
    btnDrawPlan: $('draw-plan'),   // NEW

    // News Form
    btnAddNewsMode: $('btn-add-news-mode'),
    newsForm: $('news-form'),
    btnSubmitNews: $('btn-submit-news'),
    btnCancelNews: $('btn-cancel-news'),
    inpNewsTitle: $('news-title'),
    inpNewsDesc: $('news-desc'),
    inpNewsImg: $('news-img'),
    inpNewsSrc: $('news-source'),
    newsList: $('news-list'),

    // Props
    selectionProps: $('selection-props'),
    propName: $('prop-name'),
    propFlag: $('prop-flag'),
    btnUploadImage: $('btn-upload-image'), // NEW
    inputUploadImage: $('input-upload-image'), // NEW
    propColor: $('prop-color'),
    propOpacity: $('prop-opacity'),
    propRotation: $('prop-rotation'), // NEW
    valRotation: $('val-rotation'),   // NEW
    groupRotation: $('group-rotation'),
    propScale: $('prop-scale'),       // NEW
    btnDelete: $('btn-delete'),

    // IO
    btnSave: $('action-save'),
    btnLoad: $('action-load'),
    btnExport: $('action-export'),
    inputJson: $('file-input-json'),
    inputImage: $('file-input-image')
};

function showToast(msg) {
    const box = $('toast-container');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'toast';
    div.innerText = msg;
    box.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// ----------------------------------------------------------------------
// 4. TIMELINE & PERSISTENCE SYSTEM (Auto-Save)
// ----------------------------------------------------------------------

function init() {
    // FORCE NORMAL USER (Debug Fix)
    CONFIG.IS_ADMIN = false;

    applyPermissions();
    updateDateDisplay();

    // 1. Try Auto-Load from Browser Storage
    // 1. Try Auto-Load from Browser Storage (ADMIN ONLY)
    // Normal users should only see the 'fronts.json' (Server Truth)
    let localData = null;
    if (CONFIG.IS_ADMIN) {
        localData = localStorage.getItem('deepstate_autosave');
    }

    if (localData) {
        try {
            const parsed = JSON.parse(localData);
            if (parsed && Object.keys(parsed).length > 0) {
                state.history = parsed;
                console.log("Loaded from Servers");
                showToast("Restored from Server");
            }
        } catch (e) { console.error("Autosave corrupt", e); }
    } else {
        // 2. Try loading from db.js (JSONP) or 'fronts.json' (Fetch)
        if (typeof INITIAL_DB !== 'undefined' && INITIAL_DB.history) {
            state.history = INITIAL_DB.history;
            loadStateForDate(state.currentDate);
            showToast("Loaded from db.js");
        } else {
            // Fallback to fetch (Server Mode)
            fetch('fronts.json').then(r => r.json()).then(d => {
                if (d.history) {
                    state.history = d.history;
                    loadStateForDate(state.currentDate);
                    showToast("Loaded fronts.json");
                }
            }).catch(e => {
                console.log("No default file found", e);
                showToast("Data Load Failed (CORS?)");
            });
        }
    }

    // Load initial state
    loadStateForDate(state.currentDate);

    // Fade out Loader
    setTimeout(() => {
        const loader = document.getElementById('app-loader');
        if (loader) loader.classList.add('hidden-loader');
    }, 1500); // 1.5s delay for effect
}

// Start
init();

function applyPermissions() {
    if (CONFIG.IS_ADMIN) return; // Full Access

    // HIDE TOOLS
    const hiddenMapTools = [
        'draw-polygon', // Area
        'draw-line',    // Front
        'draw-fort',    // Fort
        'draw-unit',    // Unit
        'draw-arrow-icon', // Move
        'draw-image'    // Image
    ];

    hiddenMapTools.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';

        // Optional: Hide the parent label/group if you want cleaner UI
        // But simply hiding buttons is sufficient for functionality.
    });

    // AGGRESSIVE REMOVAL
    if (ui.btnAddNewsMode) ui.btnAddNewsMode.remove();
    if (ui.newsForm) ui.newsForm.remove(); // Nuke the form entirely

    // RESTRICT SAVE/LOAD
    if (ui.btnSave) ui.btnSave.remove();
    if (ui.btnLoad) ui.btnLoad.remove();

    // Remove Tools (UI Hiding)
    hiddenMapTools.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove(); // Remove button from DOM
    });

    // Remove Empty Groups
    const gZones = document.getElementById('group-zones');
    if (gZones) gZones.remove();
    const gTactical = document.getElementById('group-tactical');
    if (gTactical) gTactical.remove();

    // RESTRICT PROPERTIES (Read-Only Info View) - UPDATED: REMOVE COMPLETELY
    if (ui.selectionProps) ui.selectionProps.remove(); // Remove entire properties section

    /* OLD: Disable Inputs (Removed in favor of total removal)
    if (ui.btnDelete) ui.btnDelete.remove();
    if (ui.btnUploadImage) ui.btnUploadImage.remove();
    const props = [ui.propName, ui.propFlag, ui.propColor, ui.propOpacity, ui.propRotation, ui.propScale];
    props.forEach(el => {
        if (el) el.disabled = true;
    });
    */
}



function updateDateDisplay() {
    if (ui.dateDisplay) ui.dateDisplay.textContent = fmtDate(state.currentDate);
}

function snapshotState() {
    const key = getKey(state.currentDate);
    state.history[key] = {
        features: featuresLayer.toGeoJSON(),
        news: newsLayer.toGeoJSON()
    };

    // AUTO-SAVE to Browser
    try {
        localStorage.setItem('deepstate_autosave', JSON.stringify(state.history));
    } catch (e) {
        console.warn("LocalStorage full or blocked");
    }
}

function loadStateForDate(date) {
    // 1. Clear Map
    featuresLayer.clearLayers();
    newsLayer.clearLayers();
    if (ui.newsList) ui.newsList.innerHTML = '';

    const key = getKey(date);
    let data = state.history[key];

    // 2. Continuity Logic (Auto-Copy previous day)
    if (!data) {
        data = findPreviousData(date);
        if (data) {
            // We found previous data, but we are on a NEW empty day.
            // We load the features visually, but they aren't "Saved" to this day yet until user edits/saves.
            // Actually, for "Replay" to work, we want explicit states.
            // But for editing, we want continuity. 
            // We will render the previous data. 
            // Implicitly, if user snapshots now, it saves this day.
        }
    }

    if (data) {
        restoreGeoJSON(data.features, featuresLayer, 'feature');
        restoreGeoJSON(data.news, newsLayer, 'news');
        updateNewsFeed(); // Group and Render News
    }
}

function findPreviousData(date) {
    const keys = Object.keys(state.history).sort();
    const currentKey = getKey(date);
    let bestKey = null;
    for (const k of keys) {
        if (k < currentKey) bestKey = k;
        else break;
    }
    return bestKey ? state.history[bestKey] : null;
}

function restoreGeoJSON(geojson, group, type) {
    if (!geojson) return;
    L.geoJSON(geojson, {
        // Custom Point Creation to allow Draggable
        pointToLayer: (feature, latlng) => {
            if (type === 'news') return L.marker(latlng);
            return L.marker(latlng, { draggable: true });
        },
        onEachFeature: (feature, layer) => {
            group.addLayer(layer);
            if (type === 'feature') {
                applyFeatureStyle(layer);
                bindFeatureEvents(layer);
            } else if (type === 'news') {
                // News Visuals (Dot)
                const icon = L.divIcon({
                    className: 'news-marker',
                    html: `<div style="background: #10b981; border-radius: 50%; width: 12px; height: 12px; border: 2px solid white;"></div>`,
                    iconSize: [14, 14]
                });
                layer.setIcon(icon);
                layer.bindPopup(feature.properties.title);
            }
        }
    });
}

function changeDate(days) {
    snapshotState(); // Save current work
    const d = new Date(state.currentDate);
    d.setDate(d.getDate() + days);
    state.currentDate = d;

    updateDateDisplay();
    loadStateForDate(d);
}

// ----------------------------------------------------------------------
// 4a. NAVIGATION & PANELS
// ----------------------------------------------------------------------

function closeAllPanels() {
    if (ui.newsPanel) ui.newsPanel.classList.add('hidden');
    if (ui.toolPanel) ui.toolPanel.classList.add('hidden');
    stopDrawing();
}

if (ui.navNews) ui.navNews.addEventListener('click', () => {
    closeAllPanels();
    if (ui.newsPanel) ui.newsPanel.classList.remove('hidden');
});

if (ui.navDraw) ui.navDraw.addEventListener('click', () => {
    closeAllPanels();
    if (ui.toolPanel) ui.toolPanel.classList.remove('hidden');
});

if (ui.navMap) ui.navMap.addEventListener('click', () => {
    closeAllPanels();
});

if (ui.closeToolPanel) ui.closeToolPanel.addEventListener('click', closeAllPanels);
if (ui.closeNewsPanel) ui.closeNewsPanel.addEventListener('click', closeAllPanels);


// ----------------------------------------------------------------------
// 5. TOOLS & DRAWING
// ----------------------------------------------------------------------

let drawControl = null;
let tempNewsMarker = null;

function stopDrawing() {
    if (drawControl) {
        drawControl.disable();
        drawControl = null;
    }
    if (tempNewsMarker) { map.removeLayer(tempNewsMarker); tempNewsMarker = null; }

    state.drawActive = false;
    map.getContainer().style.cursor = '';
}

function startDrawing(mode) {
    stopDrawing();
    if (!L.Draw) return;

    // SECURITY CHECK
    if (!CONFIG.IS_ADMIN) {
        const allowed = ['ruler', 'plan']; // Restricted Mode
        if (!allowed.includes(mode)) {
            showToast("Restricted to Normal User");
            return;
        }
    }

    state.drawActive = true;

    if (mode === 'poly') {
        drawControl = new L.Draw.Polygon(map, { allowIntersection: false, showArea: true, shapeOptions: { color: '#ef4444' } });
        drawControl.enable();
    } else if (mode === 'line') {
        drawControl = new L.Draw.Polyline(map, { shapeOptions: { color: '#3b82f6', weight: 4 } });
        drawControl.enable();
    } else if (mode === 'fort') {
        drawControl = new L.Draw.Polyline(map, { shapeOptions: { color: '#000000', weight: 3, dashArray: '5, 10' } });
        drawControl.enable();
    } else if (mode === 'ruler') {
        drawControl = new L.Draw.Polyline(map, {
            shapeOptions: { color: '#f59e0b', weight: 4, dashArray: '10, 10' },
            showLength: true,
            metric: true
        });
        drawControl.enable();
    } else if (mode === 'plan') {
        drawControl = new L.Draw.Polygon(map, {
            allowIntersection: false,
            showArea: true,
            shapeOptions: { color: '#10b981', dashArray: '5, 5', fillOpacity: 0.3 }
        });
        drawControl.enable();
    } else if (['unit', 'arrow', 'image'].includes(mode)) {
        // Markers
        map.getContainer().style.cursor = 'crosshair';
        state.markerMode = mode;
        showToast(`Place ${mode.toUpperCase()} on map`);
        return;
    } else if (mode === 'news') {
        map.getContainer().style.cursor = 'help';
        state.markerMode = 'news';
        showToast("Click Map for News");
        return;
    }

    if (drawControl) {
        showToast(`Tool: ${mode.toUpperCase()}`);
        if (ui.toolPanel) ui.toolPanel.classList.add('hidden');
    }
}

// Button Hooks
if (ui.btnDrawPoly) ui.btnDrawPoly.addEventListener('click', () => startDrawing('poly'));
if (ui.btnDrawLine) ui.btnDrawLine.addEventListener('click', () => startDrawing('line'));
if (ui.btnDrawFort) ui.btnDrawFort.addEventListener('click', () => startDrawing('fort'));
if (ui.btnDrawUnit) ui.btnDrawUnit.addEventListener('click', () => startDrawing('unit'));
if (ui.btnDrawArrow) ui.btnDrawArrow.addEventListener('click', () => startDrawing('arrow'));
if (ui.btnDrawImage) ui.btnDrawImage.addEventListener('click', () => startDrawing('image'));
if (ui.btnDrawRuler) ui.btnDrawRuler.addEventListener('click', () => startDrawing('ruler'));
if (ui.btnDrawPlan) ui.btnDrawPlan.addEventListener('click', () => startDrawing('plan'));

if (ui.btnAddNewsMode) ui.btnAddNewsMode.addEventListener('click', () => {
    closeAllPanels();
    startDrawing('news');
});


// Creation Handler (Shapes)
map.on(L.Draw.Event.CREATED, (e) => {
    const layer = e.layer;
    layer.feature = layer.feature || { type: 'Feature', properties: {} };

    let color = '#ef4444';
    let name = 'Region';
    let type = 'shape'; // default

    if (e.layerType === 'polyline') {
        if (e.layer.options.dashArray === '10, 10') {
            // RULER
            name = 'Ruler';
            color = '#f59e0b';
            type = 'ruler';

            // Calculate Distance
            let dist = 0;
            const latlngs = layer.getLatLngs();
            for (let i = 0; i < latlngs.length - 1; i++) {
                dist += latlngs[i].distanceTo(latlngs[i + 1]);
            }
            const distStr = (dist > 1000) ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
            layer.bindTooltip(`<b>${distStr}</b>`, { permanent: true, direction: 'center', className: 'flag-tooltip' });

        } else if (e.layer.options.dashArray === '5, 10') {
            name = 'Fort';
            color = '#000000';
        } else {
            name = 'Front';
            color = '#3b82f6';
        }
    } else if (e.layerType === 'polygon') {
        if (e.layer.options.dashArray === '5, 5') {
            name = 'Plan';
            color = '#10b981';
            type = 'plan';
        }
    }

    layer.feature.properties = {
        color: color,
        opacity: 0.6,
        name: name,
        type: type, // shape, ruler, plan
        date: state.currentDate.toISOString()
    };

    featuresLayer.addLayer(layer);
    applyFeatureStyle(layer);
    bindFeatureEvents(layer);
    selectFeature(layer);
    stopDrawing();
    if (ui.toolPanel) ui.toolPanel.classList.remove('hidden');

    updateTimeVisibility();
});

// ----------------------------------------------------------------------
// TIME TRAVELLER LOGIC
// ----------------------------------------------------------------------
function updateTimeVisibility() {
    const now = state.currentDate.getTime();

    // Features (Units, Images, Arrows, Shapes)
    featuresLayer.eachLayer(layer => {
        if (!layer.feature || !layer.feature.properties.date) return;
        const time = new Date(layer.feature.properties.date).getTime();

        const isVisible = time <= now;

        if (layer.setOpacity) { // For Markers
            layer.setOpacity(isVisible ? (layer.feature.properties.opacity || 1) : 0);
            // Also disable interaction
            if (layer.getElement()) {
                layer.getElement().style.pointerEvents = isVisible ? 'auto' : 'none';
            }
        } else if (layer.setStyle) { // For Shapes (Polygons, Polylines)
            const p = layer.feature.properties;
            if (isVisible) {
                layer.setStyle({ opacity: p.opacity, fillOpacity: p.opacity });
            } else {
                layer.setStyle({ opacity: 0, fillOpacity: 0 });
            }
        }
    });

    // News Layer
    newsLayer.eachLayer(layer => {
        if (!layer.feature || !layer.feature.properties.date) return;
        const time = new Date(layer.feature.properties.date).getTime();
        const isVisible = time <= now;

        if (layer.setOpacity) {
            layer.setOpacity(isVisible ? 1 : 0);
            if (layer.getElement()) {
                layer.getElement().style.pointerEvents = isVisible ? 'auto' : 'none';
            }
        }
    });

    // Also filter the News Feed List
    updateNewsFeed();
}

// UPDATED CLICK HANDLER (With Date)
map.on('click', (e) => {
    if (!state.drawActive) {
        selectedFeature = null;
        if (ui.selectionProps) ui.selectionProps.classList.add('hidden');
        return;
    }

    if (['unit', 'arrow', 'image'].includes(state.markerMode)) {
        const type = state.markerMode;
        let name = 'Unit';
        let color = '#dc2626'; // Unit Red
        let flagUrl = '';

        if (type === 'arrow') { name = 'Advance'; color = '#b91c1c'; }
        if (type === 'image') {
            name = 'Image';
            flagUrl = 'https://cdn-icons-png.flaticon.com/512/25/25231.png';
            color = '#ffffff';
        }

        const layer = L.marker(e.latlng, { draggable: true });
        layer.feature = {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] },
            properties: {
                name: name,
                color: color,
                type: type,
                angle: 0,
                scale: 1,
                opacity: 1,
                flagUrl: flagUrl,
                date: state.currentDate.toISOString() // SAVE TIME
            }
        };

        featuresLayer.addLayer(layer);
        applyFeatureStyle(layer);
        bindFeatureEvents(layer);
        selectFeature(layer);
        stopDrawing();
        if (ui.toolPanel) ui.toolPanel.classList.remove('hidden');

        updateTimeVisibility(); // Ensure correct state immediately
    } else if (state.markerMode === 'news') {
        if (ui.newsPanel) ui.newsPanel.classList.remove('hidden');
        if (ui.newsForm) ui.newsForm.classList.remove('hidden');
        if (ui.btnAddNewsMode) ui.btnAddNewsMode.classList.add('hidden');
        state.tempNewsLoc = e.latlng;
        stopDrawing();
    }
});


// ----------------------------------------------------------------------
// FEATURE LOGIC & STYLING
// ----------------------------------------------------------------------

let selectedFeature = null;

function bindFeatureEvents(layer) {
    // Selection
    layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        selectFeature(layer);
    });

    // Dragging (Sync Geometry)
    if (layer.dragging) { // Markers
        layer.on('dragend', (e) => {
            const latlng = layer.getLatLng();
            layer.feature.geometry.coordinates = [latlng.lng, latlng.lat];
            selectFeature(layer); // Refresh props (loc?)
        });
    }
}

// DRAG & DROP SUPPORT (Files -> Map)
function initDragAndDrop() {
    const container = map.getContainer();

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.style.boxShadow = "inset 0 0 20px #3b82f6";
    });

    container.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.style.boxShadow = "";
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        container.style.boxShadow = "";

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleDroppedFile(files[0], e.clientX, e.clientY);
        }
    });
}

function handleDroppedFile(file, clientX, clientY) {
    if (!file.type.match('image.*')) {
        showToast("Only images allowed");
        return;
    }

    // Convert Screen Coords -> Map LatLng
    const point = map.containerPointToLatLng([clientX, clientY]);

    const r = new FileReader();
    r.onload = (ev) => {
        const base64 = ev.target.result;
        createImageMarker(point, base64);
    };
    r.readAsDataURL(file);
}

function createImageMarker(latlng, url) {
    const layer = L.marker(latlng, { draggable: true }); // DRAGGABLE!
    layer.feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [latlng.lng, latlng.lat] },
        properties: {
            name: 'Image',
            color: '#ffffff',
            type: 'image',
            angle: 0,
            scale: 1,
            opacity: 1,
            flagUrl: url,
            date: state.currentDate.toISOString() // SAVE TIME
        }
    };
    featuresLayer.addLayer(layer);
    applyFeatureStyle(layer);
    bindFeatureEvents(layer);
    selectFeature(layer);
    updateTimeVisibility(); // Ensure visibility check
    showToast("Image Dropped");
}

initDragAndDrop(); // Start listener

function selectFeature(layer) {
    selectedFeature = layer;
    if (ui.selectionProps) ui.selectionProps.classList.remove('hidden');
    // Ensure parent panel is open
    if (ui.toolPanel && ui.toolPanel.classList.contains('hidden')) {
        ui.toolPanel.classList.remove('hidden');
    }

    const p = layer.feature.properties;
    if (ui.propName) ui.propName.value = p.name || '';
    if (ui.propFlag) ui.propFlag.value = p.flagUrl || '';
    if (ui.propColor) ui.propColor.value = p.color || '#ef4444';
    if (ui.propOpacity) ui.propOpacity.value = p.opacity || 0.5;

    // Rotation Handling
    if (p.type === 'unit' || p.type === 'arrow' || p.type === 'image') {
        if (ui.groupRotation) ui.groupRotation.classList.remove('hidden');
        if (ui.propRotation) ui.propRotation.value = p.angle || 0;
        if (ui.valRotation) ui.valRotation.innerText = p.angle || 0;
        if (ui.propScale) ui.propScale.value = p.scale || 1;
    } else {
        if (ui.groupRotation) ui.groupRotation.classList.add('hidden');
    }
}

// DYNAMIC SCALING (Make icons behave like ground objects)
function getZoomScale() {
    // Baseline: Zoom 6 (Config Default) = Scale 1
    // If Zoom 7 -> Scale 2
    // If Zoom 5 -> Scale 0.5
    // Adjusted formula for pleasant viewing
    const diff = map.getZoom() - CONFIG.DEFAULT_ZOOM;
    return Math.pow(1.5, diff); // 1.5x larger per zoom level
}

function applyFeatureStyle(layer) {
    const p = layer.feature.properties;

    // SHAPES
    if (layer.setStyle) {
        layer.setStyle({
            color: p.color,
            fillColor: p.color,
            fillOpacity: p.opacity,
            opacity: p.opacity
        });
    }

    // MARKERS
    if (layer.setIcon) {
        // Enable Dragging if not set
        if (!layer.dragging.enabled()) layer.dragging.enable();

        let html = '';
        const zScale = getZoomScale();
        const userScale = p.scale || 1;
        const totalScale = zScale * userScale;

        // Note: We apply scale via width/height or transform
        // For Rotation + Scale, we combine them.

        if (p.type === 'unit') {
            const s = 24 * totalScale;
            html = `<div style="
                width: ${s}px; height: ${s}px; 
                background: ${p.color}; 
                transform: rotate(45deg); 
                border: ${2 * totalScale}px solid white; 
                box-shadow: 2px 2px 4px rgba(0,0,0,0.5);"></div>`;

        } else if (p.type === 'arrow') {
            const fs = 40 * totalScale;
            html = `<div style="
                font-size: ${fs}px; 
                color: ${p.color}; 
                transform: rotate(${p.angle || 0}deg);
                text-shadow: 2px 2px 0 white;">
                <i class="fa-solid fa-arrow-up"></i>
            </div>`;

        } else if (p.type === 'image') {
            const size = 50 * totalScale;
            // Handle uploaded images that might be base64
            // Check if p.flagUrl is data URI or http
            const url = p.flagUrl || 'https://via.placeholder.com/50';
            html = `<img src="${url}" style="
                width: ${size}px;
                transform: rotate(${p.angle || 0}deg);
                opacity: ${p.opacity};
                display: block;
                pointer-events: none; /* Let clicks pass to marker */
            ">`;

        } else if (p.type === 'news') {
            // News stays fixed size usually
            html = `<div style="background:#10b981; width:12px; height:12px; border-radius:50%; border:2px solid white;"></div>`;
        }

        if (html) {
            // We need a wrapper size that covers the potentially rotated object
            // Just using a box generous enough
            const wrapperSize = (p.type === 'news') ? 12 : (50 * totalScale); // Approx

            const icon = L.divIcon({
                className: 'custom-marker',
                html: html,
                iconSize: [wrapperSize, wrapperSize],
                iconAnchor: [wrapperSize / 2, wrapperSize / 2] // Center pivot
            });
            layer.setIcon(icon);
        }
    }

    // UPDATE VISIBILITY AFTER STYLE
    updateTimeVisibility();

    // Tooltips (Hover Name)
    if (layer.bindTooltip) {
        if (p.type === 'ruler') {
            // Re-calculate distance for display
            if (layer.getLatLngs) {
                let dist = 0;
                const latlngs = layer.getLatLngs();
                // Flatten if nested (MultiPolyline)
                const points = (Array.isArray(latlngs[0])) ? latlngs[0] : latlngs;

                for (let i = 0; i < points.length - 1; i++) {
                    if (points[i].distanceTo) dist += points[i].distanceTo(points[i + 1]);
                }
                const distStr = (dist > 1000) ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
                // Permanent Tooltip
                layer.bindTooltip(`<b>${distStr}</b>`, { permanent: true, direction: 'center', className: 'flag-tooltip' });
            }
        } else if (p.name && p.type !== 'news') {
            layer.bindTooltip(`<b>${p.name}</b>`, {
                permanent: false, // Only on hover
                direction: 'top'
            });
        }
    }
}

// Re-render markers on zoom for scaling effect
map.on('zoomend', () => {
    featuresLayer.eachLayer(l => applyFeatureStyle(l));
});

// NEWS RENDERING (DeepState Style)
// ----------------------------------------------------------------------
// NEWS FEED LOGIC (Grouped by Date)
// ----------------------------------------------------------------------

function fmtTime(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtNiceDate(date) {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function updateNewsFeed() {
    if (!ui.newsList) return;
    ui.newsList.innerHTML = ''; // Clear existing

    // 1. Gather all News items
    const items = [];
    const now = state.currentDate.getTime();

    newsLayer.eachLayer(layer => {
        if (layer.feature && layer.feature.properties) {
            // FILTER: Only show news created BEFORE or ON the current Sim Time
            const t = new Date(layer.feature.properties.date).getTime();
            if (t <= now) {
                items.push({
                    layer: layer,
                    data: layer.feature.properties
                });
            }
        }
    });

    // 2. Sort by Date Descending
    items.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));

    // 3. Group by Day
    const grouped = {};
    items.forEach(item => {
        const d = new Date(item.data.date);
        const dateKey = fmtNiceDate(d);
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(item);
    });

    // 4. Render
    Object.keys(grouped).forEach(dateHeader => {
        // Date Header
        const header = document.createElement('div');
        header.className = 'news-date-header';
        header.innerText = dateHeader;
        ui.newsList.appendChild(header);

        // Cards
        grouped[dateHeader].forEach(wrapper => {
            const p = wrapper.data;
            const layer = wrapper.layer;

            const card = document.createElement('div');
            card.className = 'news-card';

            const timeStr = fmtTime(new Date(p.date));

            // DELETE BUTTON (Conditionally Rendered)
            let deleteBtnHtml = '';
            if (CONFIG.IS_ADMIN) {
                deleteBtnHtml = `<button class="btn-delete-news" title="Delete News"><i class="fa-solid fa-trash"></i></button>`;
            }

            card.innerHTML = `
                <div class="news-dot"></div>
                ${deleteBtnHtml}
                <div class="news-body">
                    ${p.title} 
                    ${p.desc ? `<br><span style="font-size:0.9em; color:#555;">${p.desc}</span>` : ''}
                </div>
                <div class="news-time">${timeStr}</div>
                ${p.imgUrl ? `<div class="news-media"><img src="${p.imgUrl}" loading="lazy"></div>` : ''}
            `;

            // Delete Action
            if (CONFIG.IS_ADMIN) {
                const btnDel = card.querySelector('.btn-delete-news');
                if (btnDel) {
                    btnDel.addEventListener('click', (e) => {
                        e.stopPropagation(); // Don't trigger flyTo
                        if (confirm("Delete this news event?")) {
                            newsLayer.removeLayer(layer);
                            snapshotState(); // Save change
                            updateNewsFeed(); // Re-render
                            showToast("News Deleted");
                        }
                    });
                }
            }

            // FlyTo Action
            card.addEventListener('click', () => {
                map.flyTo(layer.getLatLng(), 10);
                layer.openPopup();
            });

            ui.newsList.appendChild(card);
        });
    });
}

// SEARCH LOGIC
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value;
            if (!query) return;

            showToast("Searching...");
            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
                .then(r => r.json())
                .then(data => {
                    if (data && data.length > 0) {
                        const result = data[0];
                        const lat = parseFloat(result.lat);
                        const lon = parseFloat(result.lon);
                        map.flyTo([lat, lon], 12);
                        showToast(`Found: ${result.display_name.split(',')[0]}`);
                    } else {
                        showToast("Location not found");
                    }
                })
                .catch(err => {
                    console.error(err);
                    showToast("Search Error");
                });
        }
    });
}

// PROPS
const updateProp = (k, v) => {
    if (!selectedFeature) return;
    selectedFeature.feature.properties[k] = v;
    applyFeatureStyle(selectedFeature);
};

if (ui.propName) ui.propName.addEventListener('input', (e) => updateProp('name', e.target.value));
if (ui.propFlag) ui.propFlag.addEventListener('input', (e) => updateProp('flagUrl', e.target.value));
if (ui.propColor) ui.propColor.addEventListener('input', (e) => updateProp('color', e.target.value));
if (ui.propOpacity) ui.propOpacity.addEventListener('input', (e) => updateProp('opacity', parseFloat(e.target.value)));

if (ui.propRotation) ui.propRotation.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (ui.valRotation) ui.valRotation.innerText = val;
    updateProp('angle', val);
});
if (ui.propScale) ui.propScale.addEventListener('input', (e) => updateProp('scale', parseFloat(e.target.value)));

// UPLOAD Logic
if (ui.btnUploadImage) ui.btnUploadImage.addEventListener('click', () => ui.inputUploadImage.click());
if (ui.inputUploadImage) ui.inputUploadImage.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f || !selectedFeature) return;
    const r = new FileReader();
    r.onload = (ev) => {
        ui.propFlag.value = "Image Loaded";
        updateProp('flagUrl', ev.target.result);
        showToast("Image Uploaded");
    };
    r.readAsDataURL(f);
});

if (ui.btnDelete) ui.btnDelete.addEventListener('click', () => {
    // SECURITY: Only allow deleting own Rulers/Plans if Restricted
    if (!CONFIG.IS_ADMIN) {
        if (!selectedFeature) return;
        const t = selectedFeature.feature.properties.type;
        if (t !== 'ruler' && t !== 'plan') {
            showToast("Cannot delete this item");
            return;
        }
    }
    if (selectedFeature) featuresLayer.removeLayer(selectedFeature);
    selectedFeature = null;
    if (ui.selectionProps) ui.selectionProps.classList.add('hidden');
});

// NEWS FORM LOGIC
if (ui.btnSubmitNews) ui.btnSubmitNews.addEventListener('click', () => {
    if (!CONFIG.IS_ADMIN) return; // Block
    if (!state.tempNewsLoc) return;

    // Create News Feature
    const title = ui.inpNewsTitle.value;
    const desc = ui.inpNewsDesc.value;
    const img = ui.inpNewsImg.value;
    const src = ui.inpNewsSrc.value;

    // Create GeoJSON Point
    const layer = L.marker(state.tempNewsLoc);
    layer.feature = {
        type: 'Feature',
        properties: {
            type: 'news',
            title: title,
            desc: desc,
            imgUrl: img,
            sourceUrl: src,
            date: new Date().toISOString() // Use actual Post time
        }
    };

    // Add to News Layer (Separate)
    newsLayer.addLayer(layer);

    // Visuals (Dot)
    const icon = L.divIcon({
        className: 'news-marker',
        html: `<div style="background: #10b981; border-radius: 50%; width: 12px; height: 12px; border: 2px solid white;"></div>`,
        iconSize: [14, 14]
    });
    layer.setIcon(icon);

    // Refresh Feed
    updateNewsFeed(); // <--- NEW CALL

    // Popup on Map
    layer.bindPopup(`
        <div class="news-popup">
            ${img ? `<img src="${img}">` : ''}
            <h4>${title}</h4>
        </div>
    `);

    // Clean up Form
    ui.inpNewsTitle.value = '';
    ui.inpNewsDesc.value = '';
    ui.inpNewsImg.value = '';
    ui.inpNewsSrc.value = '';

    ui.newsForm.classList.add('hidden');
    if (ui.btnAddNewsMode) ui.btnAddNewsMode.classList.remove('hidden');

    snapshotState(); // AUTO-SAVE state immediately
    showToast("News Posted & Saved");
});

if (ui.btnCancelNews) ui.btnCancelNews.addEventListener('click', () => {
    ui.newsForm.classList.add('hidden');
    if (ui.btnAddNewsMode) ui.btnAddNewsMode.classList.remove('hidden');
});


// ----------------------------------------------------------------------
// 6. IO & PERSISTENCE (File System API)
// ----------------------------------------------------------------------

let fileHandle = null;

async function saveToDisk() {
    snapshotState(); // Capture latest
    const jsonString = JSON.stringify({
        history: state.history,
        meta: { exportedAt: new Date().toISOString() }
    }, null, 2);

    try {
        // Modern Way: Overwrite existing file
        if ('showSaveFilePicker' in window) {
            if (!fileHandle) {
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: 'fronts.json',
                    types: [{
                        description: 'DeepState Database',
                        accept: { 'application/json': ['.json'] },
                    }],
                });
            }
            const writable = await fileHandle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            showToast("Database Updated (Overwritten)");
        } else {
            // Legacy Fallback (Download)
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `fronts.json`;
            a.click();
            showToast("Saved to Download Folder");
        }
    } catch (err) {
        console.error("Save Cancelled or Failed", err);
        // Fallback if user cancels picker but still wants to save generally? 
        // No, we assume cancel means cancel.
    }
}

// Connect the Save Button
if (ui.btnSave) ui.btnSave.addEventListener('click', () => {
    if (!CONFIG.IS_ADMIN) return; // Block
    saveToDisk();
});

// Load Logic (Manual Import)
if (ui.btnLoad) ui.btnLoad.addEventListener('click', () => ui.inputJson.click());
if (ui.inputJson) ui.inputJson.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
        try {
            const d = JSON.parse(ev.target.result);
            if (d.history) state.history = d.history;
            else {
                // Legacy support
                L.geoJSON(d, { onEachFeature: (f, l) => featuresLayer.addLayer(l) });
                snapshotState();
            }
            loadStateForDate(state.currentDate);
            showToast("Database Loaded");
        } catch (err) { console.error(err); alert("Load Failed"); }
    };
    r.readAsText(f);
});


// ----------------------------------------------------------------------
// 7. PLAYBACK (Replay Mode)
// ----------------------------------------------------------------------

if (ui.btnNextDate) ui.btnNextDate.addEventListener('click', () => changeDate(1));
if (ui.btnPrevDate) ui.btnPrevDate.addEventListener('click', () => changeDate(-1));

if (ui.btnPlay) ui.btnPlay.addEventListener('click', () => {
    if (state.playInterval) {
        // Stop
        clearInterval(state.playInterval);
        state.playInterval = null;
        ui.btnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';
        showToast("Replay Used");
    } else {
        // Start
        showToast("Replay Started (1 sec/day)");
        ui.btnPlay.innerHTML = '<i class="fa-solid fa-pause"></i>';
        state.playInterval = setInterval(() => {
            changeDate(1);
        }, 1200);
    }
});

// START
init();
// DEBUG: Global Click Listener
// document.addEventListener('click', (e) => {
//     // showToast(`DEBUG: Clicked <${e.target.tagName}> #${e.target.id}`);
// });

showToast("DeepPixmap Editor Loaded");
