// Site Sector Mapper - Main Application Logic

// Site Sector Mapper - Main Application Logic

// Global State
let sites = [];
let map = null;

// logDebug removed
let markersLayer = null;
let pointsLayer = null;
// kmlLayer removed
let sectorsLayer = null;
let sectorCounter = 0;
let editingId = null; // Track which site is being edited
let showSiteNames = false; // Control site name visibility
let showSectorNames = false; // Control sector name visibility
let isAddingMarker = false;
let isMeasuring = false;
let measurePoints = [];
let measureLayer = null;
let selectedMeasurement = null; // Track selected measurement for deletion
let tempMeasureMarker = null; // Temporary marker for the first point
let points = []; // Separate array for points
let editingPointId = null;
let editingType = null; // 'site' or 'point'
let hiddenKmlGroups = new Set(); // Track hidden KML groups
let hiddenSiteGroups = new Set(); // Track hidden Site groups
let activeThematicSettings = { sites: null, kml: null }; // Independent settings for Sites and KML
let alarmsData = []; // Store imported alarm data
let connectionLinesLayer = null; // Track connection lines (LayerGroup)
let isConnectionLinesEnabled = false; // Toggle state

// Helper to generate unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Normalizes CSV headers to standard keys
 * @param {Array} headers - Row object keys
 * @returns {Object} Map of original header -> standard key
 */
function normalizeCSVHeaders(headers) {
    const map = {};
    const standardKeys = {
        'site_name': ['site', 'name', 'sitename', 'site name', 'site_name', 'identifier'],
        'latitude': ['lat', 'latitude', 'lat.', 'y'],
        'longitude': ['lon', 'lng', 'long', 'longitude', 'long.', 'x'],
        'azimuth': ['azimuth', 'azi', 'heading', 'dir', 'direction', 'azimut'],
        'beamwidth': ['beamwidth', 'beam', 'hbws', 'bw', 'h_beamwidth', 'bandwith'],
        'range': ['range', 'radius', 'dist', 'distance', 'rang'],
        'description': ['description', 'desc', 'notes', 'comment'],
        'sector_name': ['sector', 'sector_name', 'cell', 'cellid', 'sectorid'],
        'color': ['color', 'colour', 'rgb'],
        'opacity': ['opacity', 'alpha', 'transparency'],
        'technology': ['technology', 'tech', 'system', 'rat'],
        'frequency': ['frequency', 'freq', 'band']
    };

    headers.forEach(header => {
        const normalized = header.toLowerCase().trim().replace(/[\s\._-]/g, '');
        let match = null;

        // Check standard keys
        for (const [key, variants] of Object.entries(standardKeys)) {
            // Check direct match or variants
            if (key.replace(/_/g, '') === normalized || variants.some(v => v.replace(/[\s\._-]/g, '') === normalized)) {
                match = key;
                break;
            }
        }

        // If no match, check startsWith for partial matches (e.g. "Site Name (Primary)")
        if (!match) {
            for (const [key, variants] of Object.entries(standardKeys)) {
                if (variants.some(v => normalized.startsWith(v.replace(/[\s\._-]/g, '')))) {
                    match = key;
                    break;
                }
            }
        }

        if (match) {
            map[header] = match;
        }
    });
    return map;
}

/**
 * Robust number parser handling commas and non-numeric chars
 * Also auto-scales huge integers to valid coordinate ranges if specified
 * @param {string|number} val 
 * @param {boolean} isCoordinate - If true, restricts to -180/180 range
 * @returns {number|null}
 */
function parseNumber(val, isCoordinate = false) {
    if (val === null || val === undefined || val === '') return null;

    let num = val;

    if (typeof val === 'string') {
        let cleanVal = val.trim();
        // Handle "1.234.567" format (European thousands separators or just bad formatting)
        // If multiple dots, remove all of them and treat as integer
        if ((cleanVal.match(/\./g) || []).length > 1) {
            cleanVal = cleanVal.replace(/\./g, '');
        } else if (cleanVal.includes(',') && !cleanVal.includes('.')) {
            cleanVal = cleanVal.replace(',', '.');
        }
        num = parseFloat(cleanVal);
    }

    if (isNaN(num)) return null;

    // Auto-scale coordinates that are clearly too big (e.g. 3356858611 -> 33.568...)
    if (isCoordinate) {
        // While larger than 180 (max long) or smaller than -180, divide by 10
        // Limit iterations to avoid infinite loop
        let iterations = 0;
        while ((num > 180 || num < -180) && iterations < 15) {
            num = num / 10;
            iterations++;
        }
    }

    return num;
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    init();
});

// Initialize
function init() {
    // Map is already initialized in global scope
    initializeEventListeners();
    loadData();

    // Sync color inputs
    // Sync color inputs (Point Form)
    document.getElementById('pointColor').addEventListener('input', (e) => {
        document.getElementById('pointColorText').value = e.target.value;
    });
    document.getElementById('pointColorText').addEventListener('input', (e) => {
        document.getElementById('pointColor').value = e.target.value;
    });

    updateUI();
    renderPointsList();
    showNotification(`Loaded ${sites.length} sites and ${points.length} points`, 'info');

    // Map Click Handler for "Add Marker" and "Measure" modes
    map.on('click', (e) => {
        if (isAddingMarker) {
            const { lat, lng } = e.latlng;
            openPointModal(null, lat, lng);
            toggleAddMarkerMode(false);
        } else if (isMeasuring) {
            handleMeasureClick(e.latlng);
        }
    });
}


// ==================== MAP INITIALIZATION ====================

function initializeMap() {
    // Initialize Leaflet map
    // Initialize Leaflet map with Canvas renderer for performance
    // Load saved map state
    const savedState = localStorage.getItem('siteSectorMapper_mapState');
    let initialCenter = [33.5731, -7.5898]; // Morocco center
    let initialZoom = 6;

    if (savedState) {
        try {
            const state = JSON.parse(savedState);
            if (state.center && state.zoom) {
                initialCenter = state.center;
                initialZoom = state.zoom;
            }
        } catch (e) {
            console.error('Error loading map state:', e);
        }
    }

    map = L.map('map', {
        preferCanvas: true
    }).setView(initialCenter, initialZoom);

    // Save map state and update zoom classes on move/zoom
    function updateZoomClasses() {
        const zoom = map.getZoom();
        const mapContainer = document.getElementById('map');

        mapContainer.classList.remove('zoom-level-low', 'zoom-level-medium', 'zoom-level-high');

        if (zoom < 10) {
            mapContainer.classList.add('zoom-level-low');
        } else if (zoom >= 10 && zoom < 14) {
            mapContainer.classList.add('zoom-level-medium');
        } else {
            mapContainer.classList.add('zoom-level-high');
        }
    }

    map.on('moveend zoomend', () => {
        const state = {
            center: map.getCenter(),
            zoom: map.getZoom()
        };
        localStorage.setItem('siteSectorMapper_mapState', JSON.stringify(state));
        updateZoomClasses();
    });

    // Initial call
    updateZoomClasses();

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Initialize marker cluster group
    markersLayer = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
    });
    map.addLayer(markersLayer);

    // Initialize points layer (unclustered)
    pointsLayer = L.layerGroup().addTo(map);

    // Initialize sectors layer
    sectorsLayer = L.layerGroup();
    map.addLayer(sectorsLayer);

    // Initialize Connection Lines Layer
    connectionLinesLayer = L.layerGroup().addTo(map);

    // Initialize Draw Controls
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            circle: false,
            marker: false,
            circlemarker: false,
            polygon: {
                allowIntersection: false,
                showArea: true
            },
            rectangle: {
                showArea: true
            }
        },
        edit: {
            featureGroup: drawnItems,
            remove: true,
            edit: false
        }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, function (e) {
        const type = e.layerType;
        const layer = e.layer;

        // Clear previous selection
        drawnItems.clearLayers();
        drawnItems.addLayer(layer);

        handleSelection(layer);
    });

    map.on(L.Draw.Event.DELETED, function (e) {
        // Clear selection when shape is deleted
        console.log('Selection cleared');
        // Restore all points
        updateMapMarkers({ fitBounds: false });
        showNotification('Selection cleared. All points visible.', 'info');
    });
}

function handleSelection(layer) {
    const selectedSites = [];
    const selectedPoints = [];

    // Helper to check if point is in polygon/rectangle
    // Leaflet Draw layers (Polygon/Rectangle) have .getBounds() and .contains() (for Rectangle)
    // For Polygon, we can use ray casting or a library function. 
    // Fortunately, we can use a simple point-in-polygon check.

    // Get GeoJSON to make it standard
    const geoJson = layer.toGeoJSON();

    // Function to check if point is inside polygon
    // Using a simple ray-casting algorithm or relying on a library if available.
    // Since we don't have turf.js, we'll implement a simple one or use Leaflet's utility if possible.
    // Actually, for Rectangle, we can use bounds.

    if (layer instanceof L.Rectangle) {
        const bounds = layer.getBounds();

        sites.forEach(site => {
            if (bounds.contains([site.latitude, site.longitude])) {
                selectedSites.push(site);
            }
        });

        points.forEach(point => {
            if (bounds.contains([point.lat, point.lng])) {
                selectedPoints.push(point);
            }
        });
    } else if (layer instanceof L.Polygon) {
        // Ray casting algorithm for point in polygon
        const polyPoints = layer.getLatLngs()[0]; // Assumes simple polygon (no holes)

        sites.forEach(site => {
            if (isPointInPolygon([site.latitude, site.longitude], polyPoints)) {
                selectedSites.push(site);
            }
        });

        points.forEach(point => {
            if (isPointInPolygon([point.lat, point.lng], polyPoints)) {
                selectedPoints.push(point);
            }
        });
    }

    console.log('Selected Sites:', selectedSites);
    console.log('Selected Points:', selectedPoints);

    showNotification(`Selected ${selectedSites.length} sites and ${selectedPoints.length} points`, 'info');

    // Filter the map to show only selected items
    updateMapMarkers({ fitBounds: false }, selectedSites, selectedPoints);
}

function isPointInPolygon(point, vs) {
    // point = [lat, lng]
    // vs = array of LatLng objects

    const x = point[0], y = point[1];

    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i].lat, yi = vs[i].lng;
        const xj = vs[j].lat, yj = vs[j].lng;

        const intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

// ==================== SEARCH HANDLER ====================

function handleSearch(e) {
    const searchTerm = e.target.value;
    renderSitesList(searchTerm);
}

// ==================== EVENT LISTENERS ====================

function initializeEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Import Sites button
    document.getElementById('importSitesBtn')?.addEventListener('click', showImportMenu);
    document.getElementById('closeImportMenuBtn')?.addEventListener('click', showSitesList);

    // Import method buttons
    document.querySelectorAll('.import-method-btn').forEach(btn => {
        btn.addEventListener('click', () => showImportMethod(btn.dataset.method));
    });

    // Back buttons
    document.getElementById('backFromManualBtn')?.addEventListener('click', showImportMenu);
    document.getElementById('backFromCsvBtn')?.addEventListener('click', showImportMenu);
    document.getElementById('backFromAirtableBtn')?.addEventListener('click', showImportMenu);

    // Manual form
    document.getElementById('manualForm').addEventListener('submit', handleManualSubmit);
    document.getElementById('addSectorBtn').addEventListener('click', addSectorField);
    document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);

    // Map controls
    document.getElementById('toggleSiteNamesBtn').addEventListener('click', toggleSiteNames);
    document.getElementById('toggleSectorNamesBtn').addEventListener('click', toggleSectorNames);

    // Optimized rendering events
    let renderTimeout;
    map.on('moveend zoomend', () => {
        clearTimeout(renderTimeout);
        renderTimeout = setTimeout(renderVisibleSectors, 200); // Debounce rendering
    });
    const toggleSiteNamesBtn = document.getElementById('toggleSiteNamesBtn');
    const toggleSectorNamesBtn = document.getElementById('toggleSectorNamesBtn');

    if (toggleSiteNamesBtn) {
        console.log('toggleSiteNamesBtn found');
        toggleSiteNamesBtn.addEventListener('click', toggleSiteNames);
    } else {
        console.error('toggleSiteNamesBtn NOT found');
    }

    if (toggleSectorNamesBtn) {
        console.log('toggleSectorNamesBtn found');
        toggleSectorNamesBtn.addEventListener('click', toggleSectorNames);
    } else {
        console.error('toggleSectorNamesBtn NOT found');
    }

    document.getElementById('centerMapBtn').addEventListener('click', centerMap);

    // CSV upload
    const dropZone = document.getElementById('dropZone');
    const csvFileInput = document.getElementById('csvFileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');

    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    selectFileBtn.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', handleFileSelect);

    document.getElementById('importCsvBtn')?.addEventListener('click', importCsvData);
    document.getElementById('cancelCsvBtn')?.addEventListener('click', cancelCsvPreview);

    // KML upload
    const kmlDropZone = document.getElementById('kmlDropZone');
    const kmlFileInput = document.getElementById('kmlFileInput');
    const selectKmlFileBtn = document.getElementById('selectKmlFileBtn');

    if (kmlDropZone) {
        kmlDropZone.addEventListener('dragover', handleDragOver);
        kmlDropZone.addEventListener('dragleave', handleDragLeave);
        kmlDropZone.addEventListener('drop', handleKmlDrop);
    }
    if (selectKmlFileBtn) selectKmlFileBtn.addEventListener('click', () => kmlFileInput.click());
    if (kmlFileInput) kmlFileInput.addEventListener('change', handleKmlFileSelect);

    if (kmlFileInput) kmlFileInput.addEventListener('change', handleKmlFileSelect);

    const importKmlBtn = document.getElementById('importKmlBtn');
    if (importKmlBtn) {
        console.log('Import KML Button found, adding listener via addEventListener');
        importKmlBtn.addEventListener('click', (e) => {
            console.log('Import KML Button clicked via addEventListener');
            e.preventDefault();
            e.stopPropagation();
            importKmlData();
        });
    } else {
        console.error('Import KML Button NOT found in DOM');
    }

    // Fallback: Document level listener
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'importKmlBtn') {
            console.log('Document caught click on importKmlBtn');
            e.preventDefault(); // Prevent form submission if any
            importKmlData();
        }
    });

    // Dynamic Debug Button Injection (for stale HTML)
    const previewActions = document.querySelector('#kmlPreview .preview-actions');
    if (previewActions && !document.getElementById('debugImportBtn')) {
        console.log('Injecting dynamic debug button');
        const debugBtn = document.createElement('button');
        debugBtn.id = 'debugImportBtn';
        debugBtn.className = 'btn btn-warning';
        debugBtn.textContent = 'Debug Import (Dynamic)';
        debugBtn.style.marginLeft = '10px';
        debugBtn.type = 'button';
        debugBtn.onclick = function (e) {
            console.log('Dynamic Debug Button Clicked');
            e.preventDefault();
            importKmlData();
        };
        previewActions.appendChild(debugBtn);
    }

    document.getElementById('cancelKmlBtn')?.addEventListener('click', cancelKmlPreview);

    // Airtable
    document.getElementById('connectAirtableBtn').addEventListener('click', fetchFromAirtable);

    // Export KML
    const exportModal = document.getElementById('exportModal');

    // Address Search
    const searchBtn = document.getElementById('searchAddressBtn');
    const searchInput = document.getElementById('addressSearch');

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => searchAddress(searchInput.value));
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchAddress(searchInput.value);
        });

        // Autocomplete
        const debouncedFetch = debounce((query) => fetchSuggestions(query), 300);
        searchInput.addEventListener('input', (e) => debouncedFetch(e.target.value));

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                document.getElementById('searchSuggestions').style.display = 'none';
            }
        });
    }

    // Import KML Header Button
    document.getElementById('importKmlHeaderBtn')?.addEventListener('click', () => {
        document.querySelector('.tab-btn[data-tab="kml"]').click();
    });

    // Clear All Button
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', clearAllSites);
    }

    // Fallback for Clear All
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'clearAllBtn') {
            e.preventDefault();
            clearAllSites();
        }
    });

    document.getElementById('exportKmlBtn').addEventListener('click', () => {
        exportModal.style.display = 'block';
    });

    // Import Alarms
    // Import Alarms (Event Delegation)
    document.addEventListener('click', (e) => {
        if (e.target && (e.target.id === 'importAlarmsBtn' || e.target.closest('#importAlarmsBtn'))) {
            const fileInput = document.getElementById('alarmFileInput');
            if (fileInput) {
                console.log('Import Alarms clicked, triggering file input');
                fileInput.click();
            } else {
                console.error('Alarm file input not found');
            }
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'alarmFileInput') {
            console.log('Alarm file selected');
            handleAlarmImport(e);
        }
    });

    document.getElementById('exportModalCloseBtn').addEventListener('click', () => {
        exportModal.style.display = 'none';
    });

    document.getElementById('exportSitesOnlyBtn').addEventListener('click', () => {
        exportToKML('sites');
        exportModal.style.display = 'none';
    });

    document.getElementById('exportFullBtn').addEventListener('click', () => {
        exportModal.style.display = 'none';
    });

    // Close buttons for Alarms Modal
    const closeAlarmModal = () => {
        const modal = document.getElementById('alarmsModal');
        if (modal) modal.style.display = 'none';
    };
    document.getElementById('alarmsModalCloseBtn')?.addEventListener('click', closeAlarmModal);
    document.getElementById('alarmsModalCloseBtnBottom')?.addEventListener('click', closeAlarmModal);

    // Sync to Airtable
    const syncToAirtableBtn = document.getElementById('syncToAirtableBtn');
    if (syncToAirtableBtn) {
        syncToAirtableBtn.addEventListener('click', syncAllToAirtable);
    }

    // Bulk Edit
    const bulkEditModal = document.getElementById('bulkEditModal');

    // Connection Line Toggle
    setupConnectionLineToggle();
    document.getElementById('bulkEditBtn').addEventListener('click', () => {
        bulkEditModal.style.display = 'block';
    });

    document.getElementById('bulkEditModalCloseBtn').addEventListener('click', () => {
        bulkEditModal.style.display = 'none';
    });

    document.getElementById('bulkEditForm').addEventListener('submit', handleBulkEditSubmit);

    // Point Modal
    document.getElementById('editSiteForm').addEventListener('submit', handleEditSiteSubmit);
    // document.getElementById('pointModalCloseBtn').addEventListener('click', closePointModal);

    // Add Marker Button
    document.getElementById('addMarkerBtn').addEventListener('click', () => {
        toggleAddMarkerMode(!isAddingMarker);
    });

    document.getElementById('measureBtn').addEventListener('click', () => {
        toggleMeasureMode(!isMeasuring);
    });

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === document.getElementById('siteModal')) {
            document.getElementById('siteModal').style.display = 'none';
        }
        if (e.target === exportModal) {
            exportModal.style.display = 'none';
        }
        if (e.target === bulkEditModal) {
            bulkEditModal.style.display = 'none';
        }
        if (e.target === document.getElementById('pointModal')) {
            closePointModal();
        }
    });

    // Global Keydown for Deletion
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMeasurement) {
            measureLayer.removeLayer(selectedMeasurement);
            selectedMeasurement = null;
            showNotification('Measurement deleted', 'info');
        }
    });
    const clearAllBtnEl = document.getElementById('clearAllBtn');
    if (clearAllBtnEl) {
        clearAllBtnEl.addEventListener('click', clearAllSites);
    }

    // Map controls
    document.getElementById('centerMapBtn').addEventListener('click', centerMap);

    // Modal
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('siteModal').addEventListener('click', (e) => {
        if (e.target.id === 'siteModal') closeModal();
    });

    // Search
    // Search
    // Search
    document.getElementById('searchSites').addEventListener('input', handleSearch);
    document.getElementById('searchKmlList')?.addEventListener('input', () => renderKmlList(document.getElementById('searchKmlList').value));
    document.getElementById('searchPointsList')?.addEventListener('input', (e) => renderPointsList(e.target.value));

    // Thematic Analysis
    // Thematic Analysis
    document.getElementById('applyThematicBtn').addEventListener('click', applyThematicAnalysis);

    document.getElementById('clearThematicBtn').addEventListener('click', clearThematicAnalysis);

    // Analyze Map Buttons (Quick Access)
    const analyzeSitesBtn = document.getElementById('analyzeSitesBtn');
    if (analyzeSitesBtn) {
        analyzeSitesBtn.addEventListener('click', () => quickAnalyze('sites'));
    }

    const analyzeKmlBtn = document.getElementById('analyzeKmlBtn');
    if (analyzeKmlBtn) {
        analyzeKmlBtn.addEventListener('click', () => quickAnalyze('kml'));
    }
}

function quickAnalyze(source) {
    // Switch to Thematic tab
    switchTab('thematic');

    const siteSelect = document.getElementById('siteAttribute');
    const kmlSelect = document.getElementById('kmlAttribute');

    if (source === 'sites') {
        if (siteSelect) siteSelect.value = 'technology';
        if (kmlSelect) kmlSelect.value = 'n_a';
    } else {
        if (siteSelect) siteSelect.value = 'n_a';
        if (kmlSelect) {
            // Ensure options are populated
            updateThematicAttributes();
            // Default to 'name' or first available option if 'name' doesn't exist
            if (kmlSelect.querySelector('option[value="name"]')) {
                kmlSelect.value = 'name';
            } else if (kmlSelect.options.length > 1) {
                kmlSelect.selectedIndex = 1; // Skip N#A
            }
        }
    }

    // Apply immediately
    applyThematicAnalysis();

    showNotification(`Quick Analysis applied for ${source === 'sites' ? 'Sites' : 'KML'}`, 'success');
}

// ==================== TAB SWITCHING ====================

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `${tabName}-tab`);
    });

    // Show sites list when on sites-list tab
    if (tabName === 'sites-list') {
        showSitesList();
    } else {
        // Ensure sites list section is hidden when not on sites-list tab
        // (Though technically it's inside the sites-list-tab pane, so hiding the pane hides it too)
        document.getElementById('sitesListSection')?.classList.add('d-none');
    }

    if (tabName === 'points-list') {
        renderPointsList();
    }
}

// ==================== IMPORT MENU NAVIGATION ====================

function showImportMenu() {
    switchTab('sites-list');
    // Hide all forms
    document.getElementById('manualFormContainer').classList.add('d-none');
    document.getElementById('csvFormContainer').classList.add('d-none');
    document.getElementById('airtableFormContainer').classList.add('d-none');
    document.getElementById('sitesListSection').classList.add('d-none');

    // Show import menu
    document.getElementById('importMenu').classList.remove('d-none');
}

function showImportMethod(method) {
    // Hide import menu
    document.getElementById('importMenu').classList.add('d-none');

    // Hide all forms
    document.getElementById('manualFormContainer').classList.add('d-none');
    document.getElementById('csvFormContainer').classList.add('d-none');
    document.getElementById('airtableFormContainer').classList.add('d-none');

    // Show selected form
    if (method === 'manual') {
        document.getElementById('manualFormContainer').classList.remove('d-none');
    } else if (method === 'csv') {
        document.getElementById('csvFormContainer').classList.remove('d-none');
    } else if (method === 'airtable') {
        document.getElementById('airtableFormContainer').classList.remove('d-none');
    }
}

function showSitesList() {
    // Hide all forms and menu
    document.getElementById('importMenu').classList.add('d-none');
    document.getElementById('manualFormContainer').classList.add('d-none');
    document.getElementById('csvFormContainer').classList.add('d-none');
    document.getElementById('airtableFormContainer').classList.add('d-none');

    // Show sites list
    document.getElementById('sitesListSection').classList.remove('d-none');
    renderSitesList(); // Ensure list is rendered
}

// ==================== MANUAL ENTRY ====================

function addSectorToForm(data = null) {
    sectorCounter++;
    const container = document.getElementById('sectorsContainer');

    const sectorItem = document.createElement('div');
    sectorItem.className = 'sector-item';
    sectorItem.dataset.sectorId = sectorCounter;

    const defaults = {
        name: '',
        azimuth: '',
        beamwidth: 65,
        range: 500,
        color: '#3388ff',
        opacity: 0.5,
        technology: '',
        frequency: ''
    };

    const sector = data || defaults;

    sectorItem.innerHTML = `
            <div class="sector-item-header">
                <h4>Sector ${sectorCounter}</h4>
                <button type="button" class="remove-sector-btn" onclick="removeSector(${sectorCounter})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="form-group">
                <label>Sector Name</label>
                <input type="text" name="sectorName" placeholder="e.g. Alpha, Beta, Gamma" value="${sector.name || ''}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Azimuth (°)</label>
                    <input type="number" name="azimuth" min="0" max="360" placeholder="0-360" value="${sector.azimuth !== undefined ? sector.azimuth : ''}" required>
                </div>
                <div class="form-group">
                    <label>Beamwidth (°)</label>
                    <input type="number" name="beamwidth" min="1" max="360" placeholder="65" value="${sector.beamwidth}" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Range (m)</label>
                    <input type="number" name="range" min="1" placeholder="500" value="${sector.range}" required>
                </div>
                <div class="form-group">
                    <label>Color & Opacity</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="color" name="color" value="${sector.color}" style="width: 50px; height: 38px; padding: 0; border: none; background: none;">
                        <input type="range" name="opacity" min="0.1" max="1" step="0.1" value="${sector.opacity}" style="flex: 1;">
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Technology</label>
                    <input type="text" name="technology" placeholder="4G, 5G, etc." value="${sector.technology || ''}">
                </div>
                <div class="form-group">
                    <label>Frequency</label>
                    <input type="text" name="frequency" placeholder="2100 MHz, etc." value="${sector.frequency || ''}">
                </div>
            </div>
        `;

    container.appendChild(sectorItem);
}

// Alias for backward compatibility if needed, or update listener
function addSectorField() {
    addSectorToForm();
}

function removeSector(sectorId) {
    const sectorItem = document.querySelector(`[data-sector-id="${sectorId}"]`);
    if (sectorItem) {
        sectorItem.remove();
    }
}

// Helper to fetch all records for a specific site (Sector-Based)
async function fetchSiteRecords(siteName) {
    const apiKey = document.getElementById('airtableApiKey').value;
    const baseId = document.getElementById('airtableBaseId').value;
    const tableName = document.getElementById('airtableTableName').value;

    if (!apiKey || !baseId || !tableName || !siteName) return [];

    // Try common field names for Site Name
    const fieldNames = ['Name', 'name', 'site_name', 'Site Name'];

    for (const fieldName of fieldNames) {
        const url = `https://api.airtable.com/v0/${baseId}/${tableName}?filterByFormula=({${fieldName}}='${encodeURIComponent(siteName)}')`;

        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.records && data.records.length > 0) {
                    return data.records;
                }
            }
        } catch (e) {
            console.warn(`Error searching Airtable with field ${fieldName}:`, e);
        }
    }
    return [];
}

// Sync a site and its sectors to Airtable (Sector-Based: 1 Row per Sector)
async function syncSiteSectors(site) {
    const records = await fetchSiteRecords(site.name);
    const sectors = site.sectors || [];
    let updated = 0;
    let created = 0;

    // Map existing records by Sector Name (assuming a field exists)
    // We'll try to find a field that looks like "Sector Name" or "sector_name"
    // If not found, we might have to rely on other heuristics or just create new ones?
    // Let's assume 'Sector Name' or 'sector_name' exists.

    // Helper to find sector name in record fields
    const getSectorName = (record) => {
        return record.fields['Sector Name'] || record.fields['sector_name'] || record.fields['Sector_Name'] || record.fields['name'] || ''; // 'name' might be used if Site Name is in another column
    };

    // Strategy:
    // 1. Iterate local sectors.
    // 2. Find matching Airtable record.
    // 3. Update or Create.

    for (const sector of sectors) {
        const match = records.find(r => getSectorName(r) === sector.name);

        const fields = {
            'Name': site.name, // Site Name
            'latitude': site.latitude,
            'longitude': site.longitude,
            'description': site.description || '',

            // Sector Fields
            'Sector Name': sector.name, // We'll try standard names
            'sector_name': sector.name,
            'Azimuth': sector.azimuth,
            'azimuth': sector.azimuth,
            'Beamwidth': sector.beamwidth,
            'beamwidth': sector.beamwidth,
            'Range': sector.range,
            'range': sector.range,
            'Technology': sector.technology,
            'technology': sector.technology,
            'Frequency': sector.frequency,
            'frequency': sector.frequency,
            'Color': sector.color,
            'color': sector.color,
            'Opacity': sector.opacity,
            'opacity': sector.opacity
        };

        // Clean up fields: Airtable rejects unknown fields if typecast is false, but with typecast=true it might be lenient?
        // Actually, sending extra fields usually causes error 422.
        // We should only send fields that exist? We don't know schema.
        // But we can try to send a superset and hope? No.
        // We should probably use a standard set or try to infer from fetched records.

        let validFields = {};

        if (records.length > 0) {
            // Infer fields from existing record
            const sample = records[0].fields;
            Object.keys(fields).forEach(key => {
                // If key exists in sample (even if null), or if we want to force it
                // This is tricky. Let's try to send common variations.
                // Better strategy: Send keys that match the casing of the sample, or standard ones if sample is empty.
                // If sample has 'azimuth', send 'azimuth'. If 'Azimuth', send 'Azimuth'.

                // Check case-insensitive match
                const sampleKey = Object.keys(sample).find(k => k.toLowerCase() === key.toLowerCase());
                if (sampleKey) {
                    validFields[sampleKey] = fields[key];
                } else {
                    // If not in sample, maybe it's a new field?
                    // Let's include it if it's one of our core fields
                    // But we can't send duplicates (e.g. Azimuth and azimuth).
                    // So we prioritize:
                    // 1. Exact match in sample
                    // 2. Case-insensitive match in sample
                    // 3. Default (Capitalized for proper nouns, lowercase for others?)
                }
            });

            // If validFields is empty (e.g. new record has no fields?), fallback to all
            if (Object.keys(validFields).length === 0) validFields = fields;

        } else {
            // No existing records to infer from. Send all variations? No, that will fail.
            // Send a safe subset: Capitalized usually works for labels.
            validFields = {
                'Name': site.name,
                'Sector Name': sector.name,
                'Azimuth': sector.azimuth,
                'Beamwidth': sector.beamwidth,
                'Range': sector.range,
                'Technology': sector.technology,
                'Frequency': sector.frequency,
                'Color': sector.color,
                'Opacity': sector.opacity,
                'latitude': site.latitude,
                'longitude': site.longitude,
                'description': site.description
            };
        }

        if (match) {
            // Update
            const result = await updateAirtableRecord(match.id, validFields);
            if (result) updated++;
        } else {
            // Create
            const result = await createAirtableRecord(validFields);
            if (result) created++;
        }
    }

    return { updated, created };
}

async function handleManualSubmit(e) {
    e.preventDefault();

    const siteName = document.getElementById('siteName').value;
    const latitude = parseFloat(document.getElementById('latitude').value);
    const longitude = parseFloat(document.getElementById('longitude').value);
    const description = document.getElementById('description').value;

    // Removed Icon Styling from Site Form

    if (!siteName || isNaN(latitude) || isNaN(longitude)) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    // Collect sectors
    const sectors = [];
    document.querySelectorAll('.sector-item').forEach(item => {
        const name = item.querySelector('[name="sectorName"]').value;
        const azimuth = parseFloat(item.querySelector('[name="azimuth"]').value);
        const beamwidth = parseFloat(item.querySelector('[name="beamwidth"]').value);
        const range = parseFloat(item.querySelector('[name="range"]').value);
        const color = item.querySelector('[name="color"]').value;
        const opacity = parseFloat(item.querySelector('[name="opacity"]').value);
        const technology = item.querySelector('[name="technology"]').value;
        const frequency = item.querySelector('[name="frequency"]').value;

        sectors.push({ name, azimuth, beamwidth, range, color, opacity, technology, frequency });
    });

    if (editingId !== null) {
        // Update existing site
        const siteIndex = sites.findIndex(s => s.id === editingId);
        if (siteIndex !== -1) {
            // Update local - PRESERVE EXISTING PROPERTIES
            sites[siteIndex] = {
                ...sites[siteIndex], // Preserve group, id, etc.
                name: siteName,
                latitude,
                longitude,
                description,
                sectors
            };

            // Update Airtable (Sector-Based)
            showNotification('Syncing sectors to Airtable...', 'info');
            const { updated, created } = await syncSiteSectors(sites[siteIndex]);

            if (updated > 0 || created > 0) {
                showNotification(`Synced: ${updated} updated, ${created} created.`, 'success');
            } else {
                showNotification('Sync finished (no changes or failed).', 'warning');
            }
        }
        editingId = null;
        document.getElementById('manualForm').querySelector('button[type="submit"]').innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
            Add Site
        `;
        document.getElementById('cancelEditBtn').style.display = 'none';
    } else {
        // Create new site
        const newSite = {
            id: Date.now().toString(),
            name: siteName,
            latitude,
            longitude,
            description,
            group: 'Manual',
            sectors
        };

        sites.push(newSite);

        showNotification('Creating site sectors in Airtable...', 'info');
        const { updated, created } = await syncSiteSectors(newSite);

        if (updated > 0 || created > 0) {
            showNotification(`Site added and synced: ${created} sectors created.`, 'success');
        } else {
            showNotification('Site added locally (Airtable sync failed)', 'warning');
        }
    }

    // Save and update
    saveData();
    updateUI();
    updateMapMarkers();
    showSitesList();

    // Reset form
    e.target.reset();
    document.getElementById('sectorsContainer').innerHTML = '';
    sectorCounter = 0;
}

function handleBulkEditSubmit(e) {
    e.preventDefault();

    const beamwidth = document.getElementById('bulkBeamwidth').value;
    const range = document.getElementById('bulkRange').value;

    if (!beamwidth && !range) {
        showNotification('Please enter at least one value to update', 'error');
        return;
    }

    let updatedCount = 0;

    sites.forEach(site => {
        if (site.sectors) {
            site.sectors.forEach(sector => {
                if (beamwidth) sector.beamwidth = parseFloat(beamwidth);
                if (range) sector.range = parseFloat(range);
                updatedCount++;
            });
        }
    });

    saveToLocalStorage();
    updateUI();
    updateMapMarkers({ fitBounds: false });

    document.getElementById('bulkEditModal').style.display = 'none';
    document.getElementById('bulkEditForm').reset();

    showNotification(`Updated ${updatedCount} sectors successfully!`, 'success');
}

// ==================== CSV IMPORT ====================

let csvData = null;

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processCSVFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.csv')) {
            processCSVFile(file);
        } else if (file.name.match(/\.xls(x)?$/)) {
            processExcelFile(file);
        } else {
            showNotification('Please select a valid CSV or Excel file', 'error');
        }
    }
}

function processExcelFile(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Get raw JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            processImportData(jsonData);
        } catch (error) {
            console.error(error);
            showNotification('Error parsing Excel file: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function processCSVFile(file) {
    if (!file.name.endsWith('.csv')) {
        showNotification('Please select a valid CSV file', 'error');
        return;
    }

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            if (results.data.length === 0) {
                showNotification('CSV file is empty', 'error');
                return;
            }
            processImportData(results.data);
        },
        error: (error) => {
            showNotification('Error parsing CSV: ' + error.message, 'error');
        }
    });
}

function normalizeCSVHeaders(keys) {
    const headerMap = {};
    const standardMappings = {
        'site name': 'site_name',
        'site_name': 'site_name',
        'name': 'site_name',
        'latitude': 'latitude',
        'lat': 'latitude',
        'longitude': 'longitude',
        'lon': 'longitude',
        'lng': 'longitude',
        'description': 'description',
        'sector name': 'sector_name',
        'sector_name': 'sector_name',
        'azimuth': 'azimuth',
        'bearing': 'azimuth',
        'azimut': 'azimuth', // Added French spelling
        'beamwidth': 'beamwidth',
        'range': 'range',
        'radius': 'range',
        'technology': 'technology',
        'tech': 'technology',
        'frequency': 'frequency',
        'freq': 'frequency',
        'color': 'color',
        'opacity': 'opacity',
        // New Mappings
        'physical_cell_id': 'pci',
        'physical cell id': 'pci',
        'pci': 'pci',
        'sc physical cell id': 'pci',
        'cell_name': 'cell_name',
        'cell name': 'cell_name',
        'cellname': 'cell_name',
        'cellid': 'cell_name'
    };

    keys.forEach(key => {
        const normalizedKey = key.toLowerCase().trim();
        if (standardMappings[normalizedKey]) {
            headerMap[key] = standardMappings[normalizedKey];
        }
    });
    return headerMap;
}

function processImportData(rawData) {
    if (!rawData || rawData.length === 0) {
        showNotification('No data found in file', 'error');
        return;
    }

    // Normalize headers
    // Use the keys from the first row if checking rawData
    const keys = Object.keys(rawData[0]);
    const headerMap = normalizeCSVHeaders(keys);

    // Map data to standard keys
    csvData = rawData.map(row => {
        const newRow = {};
        for (const [key, val] of Object.entries(row)) {
            if (headerMap[key]) {
                newRow[headerMap[key]] = val;
            } else {
                newRow[key] = val; // Keep original if no match
            }
        }
        return newRow;
    }).filter(row => {
        // Flexible validation: needs site name and coordinates
        const hasName = row.site_name;
        const hasLat = parseNumber(row.latitude, true) !== null;
        const hasLng = parseNumber(row.longitude, true) !== null;
        return hasName && hasLat && hasLng;
    });

    if (csvData.length === 0) {
        showNotification('No valid sites found. Check file headers (Site Name, Latitude, Longitude required).', 'error');
    } else {
        showCSVPreview(csvData);
    }
}

function showCSVPreview(data) {
    const preview = document.getElementById('csvPreview');
    const content = document.getElementById('csvPreviewContent');

    // ... rest of function ...
    // (Simplifying replacement for brevity, keeping original logic mostly)

    let html = `<p><strong>${data.length} sites</strong> found in CSV</p><ul style="list-style: none; padding: 0;">`;

    const uniqueSites = {};
    data.forEach(row => {
        if (!uniqueSites[row.site_name]) {
            uniqueSites[row.site_name] = [];
        }
        uniqueSites[row.site_name].push(row);
    });

    let count = 0;
    for (const [siteName, rows] of Object.entries(uniqueSites)) {
        if (count < 5) {
            html += `<li style="padding: 0.5rem; background: var(--bg-card); margin-bottom: 0.5rem; border-radius: var(--radius-sm);">
                <strong>${siteName}</strong> - ${rows.length} sector(s)<br>
                <small style="color: var(--text-muted);">${rows[0].latitude}, ${rows[0].longitude}</small>
            </li>`;
            count++;
        }
    }

    if (Object.keys(uniqueSites).length > 5) {
        html += `<li style="color: var(--text-muted); padding: 0.5rem;">... and ${Object.keys(uniqueSites).length - 5} more</li>`;
    }

    html += '</ul>';
    content.innerHTML = html;
    preview.classList.remove('d-none');
}

function renderPointsList(filter = '') {
    // ... existing function ...
    const container = document.getElementById('pointsListContainer');
    if (!container) return;

    const filteredPoints = points.filter(point =>
        point.type !== 'kml_point' && // Exclude KML points
        point.name.toLowerCase().includes(filter.toLowerCase())
    );

    if (filteredPoints.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No points found</p>
            </div>
        `;
        return;
    }

    let html = '';
    filteredPoints.forEach(point => {
        html += `
            <div id="site-item-${point.id}" class="site-item" onclick="panToPoint('${point.id}')">
                <div class="site-item-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; background-color: ${point.color || '#ef4444'}; border-radius: 50%;"></div>
                        <span class="site-name">${point.name}</span>
                    </div>
                    <div class="site-actions">
                        <button class="btn-icon" onclick="event.stopPropagation(); openPointModal('${point.id}')" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-icon delete-btn" onclick="event.stopPropagation(); deletePoint('${point.id}')" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="site-coords">
                    ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function panToPoint(pointId) {
    const point = points.find(p => p.id == pointId);
    if (point) {
        map.setView([point.latitude, point.longitude], 16);
        // Open popup
        markersLayer.eachLayer(layer => {
            if (layer.options.pointId == pointId) {
                layer.openPopup();
            }
        });
    }
}
function importCsvData() {
    if (!csvData || csvData.length === 0) {
        showNotification('No data to import', 'error');
        return;
    }

    // Group by site name
    const sitesMap = {};

    csvData.forEach(row => {
        const siteName = row.site_name;

        if (!sitesMap[siteName]) {
            sitesMap[siteName] = {
                id: generateId(),
                name: row.site_name,
                latitude: parseNumber(row.latitude, true),
                longitude: parseNumber(row.longitude, true),
                description: row.description || '',
                group: 'CSV Import',
                sectors: []
            };
        }

        // Add sector if azimuth is present (and valid)
        const azimuth = parseNumber(row.azimuth);

        // Only add sector if we have at least an azimuth
        if (azimuth !== null) {
            // identifying Extra Props
            const standardProps = ['site_name', 'latitude', 'longitude', 'description', 'sector_name', 'azimuth', 'beamwidth', 'range', 'color', 'opacity', 'technology', 'frequency', 'pci', 'cell_name'];
            const customProperties = [];

            Object.keys(row).forEach(key => {
                // Check if it's NOT a standard prop (using normalized keys from earlier might be needed,
                // but here 'row' has keys from headerMap or original if not mapped.
                // The headerMap normalized them. So we check against those.
                // Actually, let's just exclude the ones we explicitly used.
                if (!standardProps.includes(key)) {
                    customProperties.push({ name: key, value: row[key] });
                }
            });

            sitesMap[siteName].sectors.push({
                name: row.sector_name || '',
                azimuth: azimuth,
                beamwidth: parseNumber(row.beamwidth) || 65,
                range: parseNumber(row.range) || 500,
                color: row.color || '#3388ff',
                opacity: parseNumber(row.opacity) || 0.5,
                technology: row.technology || '',
                frequency: row.frequency || '',
                pci: row.pci || '',
                cell_name: row.cell_name || '',
                customProperties: customProperties
            });
        }
    });

    // Add to sites
    const newSites = Object.values(sitesMap);
    sites.push(...newSites);

    // Save and update
    saveData();
    updateUI();

    // Reset CSV
    cancelCsvPreview();

    // Return to list view
    showSitesList();

    // Update map LAST to ensure it fits bounds correctly after UI settles
    updateMapMarkers({ fitBounds: true });

    showNotification(`${newSites.length} sites imported successfully!`, 'success');
}

function cancelCsvPreview() {
    csvData = null;
    document.getElementById('csvPreview').classList.add('d-none');
    document.getElementById('csvFileInput').value = '';
}

// ==================== KML IMPORT ====================

let kmlData = [];
let currentKmlFilename = ''; // Store filename for import

function handleKmlDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processKmlFile(files[0]);
    }
}

function handleKmlFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // alert(`Debug: File selected: ${file.name}`); // Debug
    processKmlFile(file);
}

function processKmlFile(file) {
    if (!file.name.endsWith('.kml') && !file.name.endsWith('.xml')) {
        showNotification('Please select a valid KML file', 'error');
        return;
    }

    currentKmlFilename = file.name; // Store filename for import

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        try {
            const parsedData = parseKml(text);
            if (parsedData.length === 0) {
                showNotification('No valid points found in KML file.', 'warning');
                alert('Debug: No valid points found in KML');
            } else {
                kmlData = parsedData;
                // alert(`Debug: Parsed ${kmlData.length} points`); // Debug
                console.log(`KML Data populated with ${kmlData.length} items`);
                showKmlPreview(kmlData);

                // Auto-import (Fully Automatic)
                setTimeout(() => {
                    importKmlData();
                }, 500);
            }
        } catch (error) {
            console.error('KML Parse Error:', error);
            showNotification('Error parsing KML: ' + error.message, 'error');
        }
    };
    reader.onerror = () => {
        showNotification('Error reading file', 'error');
    };
    reader.readAsText(file);
}

function parseKml(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    // Check for parsing errors
    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
        throw new Error("Invalid XML format");
    }

    // Parse Styles
    const styles = {};
    const styleElements = xmlDoc.getElementsByTagName("Style");
    for (let i = 0; i < styleElements.length; i++) {
        const style = styleElements[i];
        const id = style.getAttribute("id");
        if (id) {
            const iconStyle = style.getElementsByTagName("IconStyle")[0];
            if (iconStyle) {
                const color = getText(iconStyle, "color");
                if (color) {
                    styles[`#${id}`] = color;
                }
            }
        }
    }

    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    const parsedPoints = [];

    // Helper to get text content safely
    function getText(el, tag) {
        const found = el.getElementsByTagName(tag);
        return found.length > 0 ? found[0].textContent.trim() : "";
    };

    // Helper to get elements by local name (ignoring namespace)
    function getElementsByLocalName(parent, localName) {
        const result = [];
        const all = parent.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
            if (all[i].localName === localName) {
                result.push(all[i]);
            }
        }
        return result;
    }

    // Helper to get text content safely using local name
    function getText(el, tag) {
        const found = getElementsByLocalName(el, tag);
        return found.length > 0 ? found[0].textContent.trim() : "";
    };

    // Helper to convert KML color (aabbggrr) to Hex (#rrggbb)
    function kmlColorToHex(kmlColor) {
        if (kmlColor && kmlColor.length === 8) {
            const bb = kmlColor.substring(2, 4);
            const gg = kmlColor.substring(4, 6);
            const rr = kmlColor.substring(6, 8);
            return `#${rr}${gg}${bb}`;
        }
        return "#ef4444"; // Default red
    }

    for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i];
        const name = getText(placemark, "name") || "Untitled Point";
        const description = getText(placemark, "description");

        // Check for Point
        const point = getElementsByLocalName(placemark, "Point")[0];
        if (point) {
            const coordinates = getText(point, "coordinates");
            if (coordinates) {
                // Handle coordinates that might be space-separated or comma-separated
                // KML standard is comma-separated: lon,lat,alt
                // But sometimes there are spaces around
                const parts = coordinates.split(",").map(s => s.trim());
                if (parts.length >= 2) {
                    const lng = parseFloat(parts[0]);
                    const lat = parseFloat(parts[1]);

                    if (!isNaN(lat) && !isNaN(lng)) {
                        // Try to extract color
                        let color = "#ef4444"; // Default red

                        // 1. Check for StyleUrl
                        const styleUrl = getText(placemark, "styleUrl");
                        if (styleUrl && styles[styleUrl]) {
                            color = kmlColorToHex(styles[styleUrl]);
                        }

                        // 2. Check for inline Style (overrides styleUrl)
                        const style = getElementsByLocalName(placemark, "Style")[0];
                        if (style) {
                            const iconStyle = getElementsByLocalName(style, "IconStyle")[0];
                            if (iconStyle) {
                                const kmlColor = getText(iconStyle, "color");
                                if (kmlColor) {
                                    color = kmlColorToHex(kmlColor);
                                }
                            }
                        }

                        // 3. Parse ExtendedData (Data and SimpleData)
                        const customProperties = [];

                        // Handle <Data> tags
                        const dataElements = getElementsByLocalName(placemark, "Data");
                        for (let j = 0; j < dataElements.length; j++) {
                            const dataEl = dataElements[j];
                            const key = dataEl.getAttribute("name");
                            const value = getText(dataEl, "value");
                            if (key && value) {
                                customProperties.push({ name: key, value: value });
                            }
                        }

                        // Handle <SimpleData> tags (inside SchemaData)
                        const simpleDataElements = getElementsByLocalName(placemark, "SimpleData");
                        for (let j = 0; j < simpleDataElements.length; j++) {
                            const dataEl = simpleDataElements[j];
                            const key = dataEl.getAttribute("name");
                            const value = dataEl.textContent.trim();
                            if (key && value) {
                                customProperties.push({ name: key, value: value });
                            }
                        }

                        // 4. Parse HTML Table in Description (if no ExtendedData found or as addition)
                        if (description && description.includes('<table')) {
                            try {
                                const parser = new DOMParser();
                                const htmlDoc = parser.parseFromString(description, 'text/html');
                                const rows = htmlDoc.getElementsByTagName('tr');

                                for (let j = 0; j < rows.length; j++) {
                                    const cells = rows[j].getElementsByTagName('td');
                                    if (cells.length >= 2) {
                                        let key = cells[0].textContent.trim().replace(/:$/, ''); // Remove trailing colon
                                        let value = cells[1].textContent.trim();

                                        if (key && value) {
                                            // Check if already exists (ExtendedData takes precedence)
                                            if (!customProperties.some(p => p.name === key)) {
                                                customProperties.push({ name: key, value: value });
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn('Error parsing HTML description:', e);
                            }
                        }

                        // 5. Parse Text-based Key-Value pairs (e.g. "Key = Value<br>")
                        if (description) {
                            // console.log('Parsing description for text attributes...'); // Debug
                            const textLines = description.split(/<br\s*\/?>/i);
                            textLines.forEach(line => {
                                // Simple Split by '='
                                // We need to be careful not to split attributes inside HTML tags if mixed
                                // But the user sample shows clean lines: "Site ID = CoMPT..."

                                // Regex to match "Key = Value" where Key and Value don't contain < or > (to avoid HTML tags)
                                // And ignore lines that look like HTML tags
                                if (line.trim().startsWith('<')) return;

                                const parts = line.split('=');
                                if (parts.length >= 2) {
                                    const key = parts[0].trim();
                                    // Join the rest in case value has =
                                    const value = parts.slice(1).join('=').trim();

                                    // Validate
                                    if (key && value) {
                                        // Check if already exists
                                        if (!customProperties.some(p => p.name === key)) {
                                            customProperties.push({ name: key, value: value });
                                        }
                                    }
                                }
                            });
                        }

                        if (customProperties.length > 0) console.log('Parsed properties for point:', name, customProperties); // Debug

                        parsedPoints.push({
                            name,
                            description,
                            latitude: lat,
                            longitude: lng,
                            color,
                            customProperties
                        });
                    }
                }
            }
        }
    }

    return parsedPoints;
}

// Import KML Data
async function importKmlData() {
    // alert('Debug: importKmlData called'); // Debug

    const btn = document.getElementById('importKmlBtn') || document.getElementById('importKmlBtnDynamic');
    let originalText = 'Import KML';

    if (btn) {
        originalText = btn.innerHTML;
        btn.innerHTML = 'Importing...';
        btn.disabled = true;
    }

    try {
        if (!kmlData || kmlData.length === 0) {
            // console.log('No KML data to import. Please select a file first.');
            alert('No KML data to import. Please select a file first.');
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            return;
        }

        // console.log(`Found ${ kmlData.length } items to import.`);
        // console.log('First item:', kmlData[0]);

        // Process in chunks to avoid blocking UI
        const chunkSize = 500;
        const totalPoints = kmlData.length;
        let processed = 0;

        // Create new sites array
        const newSites = kmlData.map((point, index) => ({
            id: `kml - ${Date.now()} -${index} `,
            name: point.name,
            latitude: point.latitude,
            longitude: point.longitude,
            description: point.description,
            type: 'kml_point',
            group: currentKmlFilename,
            sectors: [],
            iconShape: 'circle',
            iconColor: point.color || '#ef4444',
            sectors: [],
            iconShape: 'circle',
            iconColor: point.color || '#ef4444',
            iconSize: 10,
            customProperties: point.customProperties || []
        }));

        // console.log(`Created ${ newSites.length } new site objects`);

        // Push to global sites
        points.push(...newSites);

        // console.log(`Added to global points.Total points: ${ points.length } `);

        saveData();

        // Update UI
        updateUI();
        updateMapMarkers({ fitBounds: false }); // Don't fit to all, we'll fit to new points

        // Zoom to new points
        if (newSites.length > 0) {
            const newBounds = L.latLngBounds(newSites.map(s => [s.latitude, s.longitude]));
            map.fitBounds(newBounds, { padding: [50, 50] });
        }

        // Switch to KML List tab
        document.querySelector('.tab-btn[data-tab="kml-list"]').click();

        // Clear search filter to ensure new sites are visible
        const searchInput = document.getElementById('searchKmlList');
        if (searchInput) {
            searchInput.value = '';
            renderKmlList('');
        }

        // Refresh thematic attributes
        updateThematicAttributes();

        showNotification(`Successfully imported ${newSites.length} points from ${currentKmlFilename} `, 'success');
        // console.log('Import complete successfully');

    } catch (error) {
        console.error('Import error:', error);
        alert('Error importing KML: ' + error.message);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// Update Map Markers

function clearKmlData() {
    if (!confirm('Are you sure you want to delete ALL KML points? This cannot be undone.')) return;

    // Filter out KML points
    const initialCount = points.length;
    points = points.filter(p => p.type !== 'kml_point');
    const removedCount = initialCount - points.length;

    // Clear KML data buffer
    kmlData = [];
    currentKmlFilename = '';

    // Save to storage
    saveToLocalStorage();

    // Update UI
    updateMapMarkers({ fitBounds: false });
    renderKmlList();
    updateThematicAttributes(); // Clear KML attributes from dropdown

    showNotification(`Cleared ${removedCount} KML points`, 'info');
}

function exportKmlAttributes() {
    const kmlPoints = points.filter(p => p.type === 'kml_point');

    if (kmlPoints.length === 0) {
        showNotification('No KML points to export', 'warning');
        return;
    }

    // CSV Header
    let csvContent = "Latitude,Longitude,Attribute,Value\n";

    // Iterate points and attributes
    kmlPoints.forEach(point => {
        if (point.customProperties && point.customProperties.length > 0) {
            point.customProperties.forEach(prop => {
                // Escape quotes in value
                const safeValue = prop.value.replace(/"/g, '""');
                const safeName = prop.name.replace(/"/g, '""');
                csvContent += `${point.latitude},${point.longitude}, "${safeName}", "${safeValue}"\n`;
            });
        }
    });

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "kml_attributes.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification('Exported attributes to CSV', 'success');
}

function showKmlPreview(data) {
    const preview = document.getElementById('kmlPreview');
    const content = document.getElementById('kmlPreviewContent');

    if (data.length === 0) {
        content.innerHTML = '<p>No valid points found in KML.</p>';
        preview.classList.remove('d-none');
        return;
    }

    let html = `< p > <strong>${data.length} points</strong> found in KML</p > <ul style="list-style: none; padding: 0;">`;

    let count = 0;
    for (const point of data) {
        if (count < 5) {
            let propsHtml = '';
            if (point.customProperties && point.customProperties.length > 0) {
                propsHtml = '<div style="margin-top:4px; font-size:0.8em; color:#666;">';
                point.customProperties.forEach(p => {
                    propsHtml += `<div><span style="font-weight:bold;">${p.name}:</span> ${p.value}</div>`;
                });
                propsHtml += '</div>';
            }

            html += `<li style="padding: 0.5rem; background: var(--bg-card); margin-bottom: 0.5rem; border-radius: var(--radius-sm); border-left: 3px solid ${point.color}">
                <strong>${point.name}</strong><br>
                <small style="color: var(--text-muted);">${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}</small>
                ${propsHtml}
            </li>`;
            count++;
        }
    }

    if (data.length > 5) {
        html += `<li style="color: var(--text-muted); padding: 0.5rem;">... and ${data.length - 5} more</li>`;
    }

    html += '</ul>';
    content.innerHTML = html;

    // Do NOT replace buttons, as it breaks event listeners attached in initializeEventListeners
    // The buttons are already present in index.html
    preview.classList.remove('d-none');
}



function cancelKmlPreview() {
    kmlData = null;
    document.getElementById('kmlPreview').classList.add('d-none');
    document.getElementById('kmlFileInput').value = '';
}

// ==================== AIRTABLE INTEGRATION ====================

async function fetchFromAirtable() {
    const apiKey = document.getElementById('airtableApiKey').value;
    const baseId = document.getElementById('airtableBaseId').value;
    const tableName = document.getElementById('airtableTableName').value;

    if (!apiKey || !baseId || !tableName) {
        showNotification('Please fill in all Airtable credentials', 'error');
        return;
    }

    const statusEl = document.getElementById('airtableStatus');
    statusEl.textContent = 'Connecting to Airtable...';
    statusEl.className = 'status-message';
    statusEl.style.display = 'block';

    try {
        let allRecords = [];
        let offset = null;

        // Fetch all pages of records
        do {
            const url = offset
                ? `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?offset=${offset}`
                : `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.records && data.records.length > 0) {
                allRecords.push(...data.records);
            }

            offset = data.offset; // Will be undefined when no more pages

            // Update status with progress
            statusEl.textContent = `Fetching records... (${allRecords.length} so far)`;

        } while (offset);

        console.log(`[Airtable] Fetched ${allRecords.length} total records`);
        if (allRecords.length > 0) {
            console.log('[Airtable] First record sample:', allRecords[0]);
        }

        if (allRecords.length === 0) {
            throw new Error('No records found in table');
        }

        // Parse Airtable records - handle both formats:
        // Format 1: One row per site with sectors as JSON
        // Format 2: One row per sector (like CSV)

        const sitesMap = {};

        allRecords.forEach(record => {
            const fields = record.fields;
            // Normalize site name to ensure grouping works even with minor differences
            const rawName = fields.name || fields.site_name || fields.Name || 'Unnamed Site';
            const siteName = rawName.trim();

            // Check if this row has sector data (azimuth field indicates sector row)
            const hasSectorData = fields.azimuth !== undefined && fields.azimuth !== null && fields.azimuth !== '';

            if (!sitesMap[siteName]) {
                sitesMap[siteName] = {
                    id: record.id,
                    name: siteName,
                    latitude: parseFloat(fields.latitude || fields.lat || 0),
                    longitude: parseFloat(fields.longitude || fields.lng || fields.lon || 0),
                    description: fields.description || fields.Description || '',
                    group: tableName, // Group by Airtable table name
                    sectors: []
                };

                // If sectors field exists as JSON, parse it
                if (fields.sectors && typeof fields.sectors === 'string') {
                    try {
                        const parsedSectors = JSON.parse(fields.sectors);
                        sitesMap[siteName].sectors.push(...parsedSectors);
                    } catch (e) {
                        console.error('Error parsing sectors JSON:', e);
                    }
                }
            }

            // If this row has sector data, add it as a sector
            if (hasSectorData) {
                sitesMap[siteName].sectors.push({
                    name: fields.sector_name || fields.sectorName || `Sector ${sitesMap[siteName].sectors.length + 1}`,
                    azimuth: parseFloat(fields.azimuth) || 0,
                    beamwidth: parseFloat(fields.beamwidth || fields.beamWidth) || 65,
                    range: parseFloat(fields.range) || 500,
                    color: fields.color || '#3388ff',
                    opacity: parseFloat(fields.opacity) || 0.5,
                    technology: fields.technology || fields.tech || '',
                    frequency: fields.frequency || fields.freq || ''
                });
            }
        });

        const newSites = Object.values(sitesMap);
        console.log(`[Airtable] Processed ${newSites.length} unique sites`);
        newSites.forEach(s => {
            if (s.sectors.length > 1) console.log(`[Airtable] Site ${s.name} has ${s.sectors.length} sectors`);
        });

        sites.push(...newSites);
        saveToLocalStorage();
        updateUI();
        updateMapMarkers();

        statusEl.textContent = `Successfully imported ${newSites.length} sites (${allRecords.length} total records) from Airtable!`;
        statusEl.className = 'status-message success';

        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);

    } catch (error) {
        console.error('Airtable Fetch Error:', error);
        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'status-message error';
    }
}

async function createAirtableRecord(data) {
    const apiKey = document.getElementById('airtableApiKey').value;
    const baseId = document.getElementById('airtableBaseId').value;
    const tableName = document.getElementById('airtableTableName').value;

    if (!apiKey || !baseId || !tableName) return null;

    const url = `https://api.airtable.com/v0/${baseId}/${tableName}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields: data })
        });

        if (!response.ok) throw new Error(`Airtable API Error: ${response.statusText}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error creating Airtable record:', error);
        showNotification(`Failed to create in Airtable: ${error.message}`, 'error');
        return null;
    }
}

async function updateAirtableRecord(recordId, data) {
    const apiKey = document.getElementById('airtableApiKey').value;
    const baseId = document.getElementById('airtableBaseId').value;
    const tableName = document.getElementById('airtableTableName').value;

    if (!apiKey || !baseId || !tableName || !recordId) return null;

    const url = `https://api.airtable.com/v0/${baseId}/${tableName}/${recordId}`;

    try {
        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields: data })
        });

        if (!response.ok) throw new Error(`Airtable API Error: ${response.statusText}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error updating Airtable record:', error);
        showNotification(`Failed to update Airtable: ${error.message}`, 'error');
        return null;
    }
}

async function deleteAirtableRecord(recordId) {
    const apiKey = document.getElementById('airtableApiKey').value;
    const baseId = document.getElementById('airtableBaseId').value;
    const tableName = document.getElementById('airtableTableName').value;

    if (!apiKey || !baseId || !tableName || !recordId) return null;

    const url = `https://api.airtable.com/v0/${baseId}/${tableName}/${recordId}`;

    try {
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) throw new Error(`Airtable API Error: ${response.statusText}`);
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error deleting Airtable record:', error);
        showNotification(`Failed to delete from Airtable: ${error.message}`, 'error');
        return null;
    }
}

async function syncAllToAirtable() {
    const apiKey = document.getElementById('airtableApiKey').value;
    const baseId = document.getElementById('airtableBaseId').value;
    const tableName = document.getElementById('airtableTableName').value;

    if (!apiKey || !baseId || !tableName) {
        showNotification('Please fill in all Airtable credentials first', 'error');
        return;
    }

    if (!confirm(`This will sync ALL ${sites.length} local sites to Airtable (Sector-Based). This may take a while. Continue?`)) return;

    showNotification(`Starting sync for ${sites.length} sites...`, 'info');

    let processed = 0;
    let totalUpdated = 0;
    let totalCreated = 0;
    let errors = 0;

    for (let i = 0; i < sites.length; i++) {
        const site = sites[i];

        // Rate limiting: wait 250ms between requests
        await new Promise(r => setTimeout(r, 250));

        try {
            const { updated, created } = await syncSiteSectors(site);
            totalUpdated += updated;
            totalCreated += created;
        } catch (e) {
            console.error(`Error syncing site ${site.name}:`, e);
            errors++;
        }

        processed++;
        if (processed % 5 === 0) {
            showNotification(`Syncing... ${processed}/${sites.length} (${totalUpdated} updated, ${totalCreated} created)`, 'info');
        }
    }

    saveToLocalStorage();
    updateUI();
    updateMapMarkers();
    showNotification(`Sync Complete: ${totalUpdated} sectors updated, ${totalCreated} sectors created, ${errors} site errors.`, 'success');
}

// ==================== MAP OPERATIONS ====================

function addMarkerToMap(site) {
    // Create custom div icon with site name
    const customIcon = L.divIcon({
        className: 'custom-site-marker',
        html: `<div class="site-marker-label" style="display: ${showSiteNames ? 'block' : 'none'}">${site.name}</div>`,
        iconSize: [100, 30],
        iconAnchor: [50, 15]
    });

    const marker = L.marker([site.latitude, site.longitude], {
        icon: customIcon,
        title: site.name,
        siteId: site.id // Store site ID for easy retrieval
    });

    marker.bindPopup(`
        <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 1rem;">${site.name}</h3>
            <p style="margin: 0 0 4px 0; font-size: 0.875rem; color: #888;">
                ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}
            </p>
            ${site.description ? `<p style="margin: 0 0 8px 0; font-size: 0.875rem;">${site.description}</p>` : ''}
            <p style="margin: 0; font-size: 0.875rem; color: #6366f1;">
                <strong>${site.sectors.length}</strong> sector(s)
            </p>
        </div>
    `);

    marker.on('click', () => {
        showSiteDetails(site);
        highlightSiteInList(site.id);
    });

    markersLayer.addLayer(marker);

    // Draw sectors for visible area
    renderVisibleSectors();
}

// Helper function to calculate destination point given start point, bearing, and distance
function destination(lat, lng, bearing, distance) {
    const R = 6371e3; // Earth's radius in meters
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;
    const bearingRad = (bearing * Math.PI) / 180;

    const latDestRad = Math.asin(
        Math.sin(latRad) * Math.cos(distance / R) +
        Math.cos(latRad) * Math.sin(distance / R) * Math.cos(bearingRad)
    );

    const lngDestRad =
        lngRad +
        Math.atan2(
            Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(latRad),
            Math.cos(distance / R) - Math.sin(latRad) * Math.sin(latDestRad)
        );

    return {
        lat: (latDestRad * 180) / Math.PI,
        lng: (lngDestRad * 180) / Math.PI,
    };
}

// ==================== SECTOR RENDERING (OPTIMIZED) ====================

function renderVisibleSectors() {
    sectorsLayer.clearLayers();

    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // Performance optimization: 
    // 1. Only render sectors for sites in current viewport
    // 2. Hide sector labels when zoomed out (zoom < 14)
    // 3. Hide sectors completely when very zoomed out (zoom < 10) unless few sites

    const visibleSites = sites.filter(site =>
        bounds.contains([site.latitude, site.longitude]) &&
        !hiddenSiteGroups.has(site.group || 'Other')
    );

    // Don't render anything if too many sites and zoomed out
    if (zoom < 10 && visibleSites.length > 100) return;

    visibleSites.forEach(site => {
        if (!site.sectors) return;

        site.sectors.forEach(sector => {
            const center = [site.latitude, site.longitude];
            const azimuth = sector.azimuth;
            const beamwidth = sector.beamwidth;
            const range = sector.range;

            // Use custom color or default based on technology
            let color = sector.color;

            // Thematic Override
            if (typeof activeThematicSettings !== 'undefined' && activeThematicSettings.sites) {
                const settings = activeThematicSettings.sites;
                let val;
                if (settings.isCustom) {
                    const prop = sector.customProperties?.find(p => p.name === settings.attribute);
                    val = prop ? prop.value : null;
                } else {
                    val = sector[settings.attribute];
                }

                if (settings.type === 'categorical') {
                    color = settings.mapping[val] || '#999999';
                } else if (settings.type === 'numerical') {
                    // Find range
                    const numVal = parseFloat(val);
                    if (!isNaN(numVal)) {
                        const range = settings.ranges.find(r => numVal >= r.min && numVal <= r.max);
                        if (range) color = range.color;
                        else color = '#999999';
                    } else {
                        color = '#999999';
                    }
                }
            } else if (!color) {
                if (sector.technology?.includes('5G')) color = '#8b5cf6'; // Purple
                else if (sector.technology?.includes('4G')) color = '#3b82f6'; // Blue
                else if (sector.technology?.includes('3G')) color = '#10b981'; // Green
                else if (sector.technology?.includes('2G')) color = '#f59e0b'; // Amber
                else color = '#3388ff'; // Default blue
            }

            const opacity = sector.opacity || 0.5;

            // Calculate sector polygon points
            const points = [center];
            const startAngle = (azimuth - beamwidth / 2);
            const endAngle = (azimuth + beamwidth / 2);

            // Create arc points
            const steps = 15; // Reduced steps for performance
            for (let i = 0; i <= steps; i++) {
                const angle = startAngle + (i / steps) * (endAngle - startAngle);
                const dest = destination(site.latitude, site.longitude, angle, range);
                points.push([dest.lat, dest.lng]);
            }

            points.push(center); // Close the polygon

            const polygon = L.polygon(points, {
                color: color,
                fillColor: color,
                fillOpacity: opacity,
                weight: 1,
                interactive: true // Keep interactive for popups
            });

            // Add popup
            let popupContent = `
                <div style="min-width: 150px;">
                    <h4 style="margin: 0 0 5px 0; color: ${color};">${sector.name || 'Sector'}</h4>
                    <p style="margin: 0; font-size: 0.875rem;">Azimuth: ${azimuth}°</p>
                    <p style="margin: 0; font-size: 0.875rem;">Beamwidth: ${beamwidth}°</p>
                    <p style="margin: 0; font-size: 0.875rem;">Range: ${range}m</p>
                    ${sector.technology ? `<p style="margin: 0; font-size: 0.875rem;">Tech: ${sector.technology}</p>` : ''}
                </div>
            `;
            polygon.bindPopup(popupContent);

            polygon.on('click', (e) => {
                // Connection Line Logic
                if (isConnectionLinesEnabled) {
                    L.DomEvent.stopPropagation(e);
                    drawSectorToPoints(sector, site);
                    return;
                }

                highlightSiteInList(site.id);

                // Check for alarms
                const siteAlarms = getAlarmsForSite(site.name);
                if (siteAlarms.length > 0) {
                    showAlarmsModal(site.name, siteAlarms);
                }
            });

            sectorsLayer.addLayer(polygon);

            // Add sector label if enabled AND zoomed in enough
            if (showSectorNames && sector.name && zoom >= 14) {
                const labelPos = destination(site.latitude, site.longitude, sector.azimuth, sector.range * 1.1);
                const labelIcon = L.divIcon({
                    className: 'sector-label-icon',
                    html: `<div class="sector-label" style="color: ${color}; border-color: ${color};">${sector.name}</div>`,
                    iconSize: [100, 20],
                    iconAnchor: [50, 10]
                });
                L.marker(labelPos, { icon: labelIcon }).addTo(sectorsLayer);
            }
        });
    });
}

function toggleSiteNames() {
    showSiteNames = !showSiteNames;
    const btn = document.getElementById('toggleSiteNamesBtn');

    if (showSiteNames) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }

    // Update existing markers
    document.querySelectorAll('.site-marker-label').forEach(el => {
        el.style.display = showSiteNames ? 'block' : 'none';
    });
}

function toggleSectorNames() {
    showSectorNames = !showSectorNames;
    const btn = document.getElementById('toggleSectorNamesBtn');

    if (showSectorNames) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }

    // Redraw visible sectors to show/hide labels
    renderVisibleSectors();
}

function getTechnologyColor(technology) {
    const tech = (technology || '').toLowerCase();
    if (tech.includes('5g')) return '#8b5cf6';
    if (tech.includes('4g') || tech.includes('lte')) return '#6366f1';
    if (tech.includes('3g')) return '#10b981';
    if (tech.includes('2g')) return '#f59e0b';
    return '#ec4899';
}

// ==================== CONNECTION LINE LOGIC ====================

function drawConnectionLine(point) {
    if (!isConnectionLinesEnabled) return;

    // 1. Clear existing line
    if (connectionLinesLayer) {
        connectionLinesLayer.clearLayers();
    }

    if (!point) return;

    // 2. Identify "Cell Name" from point
    let cellName = null;
    if (point.customProperties) {
        const prop = point.customProperties.find(p =>
            p.name.toLowerCase().includes('cell') && p.name.toLowerCase().includes('name')
        );
        if (prop) cellName = prop.value;
    }
    // Also check top level if not found
    if (!cellName && point.cellName) cellName = point.cellName; // If we ever stored it there
    if (!cellName && point.name) cellName = point.name; // Fallback? Maybe risky. Let's stick to properties.

    if (!cellName) {
        console.log('No Cell Name found for connection line');
        return;
    }

    // 3. Find Matching Sector
    // Normalize target cell name
    const targetName = String(cellName).trim().toLowerCase();

    let matchedSector = null;
    let matchedSite = null;

    // Iterate all sites
    for (const site of sites) {
        if (site.sectors) {
            for (const sector of site.sectors) {
                // Check standard cell_name
                if (sector.cell_name && String(sector.cell_name).trim().toLowerCase() === targetName) {
                    matchedSector = sector;
                    matchedSite = site;
                    break;
                }
                // Check sector name
                if (sector.name && String(sector.name).trim().toLowerCase() === targetName) {
                    matchedSector = sector;
                    matchedSite = site;
                    break;
                }
                // Check custom properties
                if (sector.customProperties) {
                    const cProp = sector.customProperties.find(p =>
                        p.name.toLowerCase().includes('cell') && p.name.toLowerCase().includes('name') &&
                        String(p.value).trim().toLowerCase() === targetName
                    );
                    if (cProp) {
                        matchedSector = sector;
                        matchedSite = site;
                        break;
                    }
                }
            }
        }
        if (matchedSector) break;
    }

    if (matchedSector && matchedSite) {
        // 4. Calculate Sector Tip
        // Destination from site    // 4. Draw Line
        try {
            const sectorTip = destination(matchedSite.latitude, matchedSite.longitude, matchedSector.azimuth, matchedSector.range);

            const latlngs = [
                [point.latitude, point.longitude],
                [sectorTip.lat, sectorTip.lng]
            ];

            // Clear existing lines (Single selection logic)
            connectionLinesLayer.clearLayers();

            const polyline = L.polyline(latlngs, {
                color: '#ef4444',
                weight: 4,
                opacity: 0.9,
                dashArray: '10, 10',
                className: 'connection-line-flow',
                lineCap: 'round'
            });

            connectionLinesLayer.addLayer(polyline);

            console.log(`Drawn line from ${cellName} to ${matchedSector.name || 'Sector'}`);
        } catch (e) {
            console.error('Error drawing line:', e);
        }
    } else {
        console.log('No matching sector found for cell name:', cellName);
    }
}

function drawSectorToPoints(sector, site) {
    if (!isConnectionLinesEnabled) return;

    // Clear previous lines
    if (connectionLinesLayer) connectionLinesLayer.clearLayers();

    // Determine target identifiers
    const targets = [];
    if (sector.cell_name) targets.push(String(sector.cell_name).trim().toLowerCase());
    if (sector.name) targets.push(String(sector.name).trim().toLowerCase());

    if (targets.length === 0) return;

    // Find all matching KML points
    const matches = points.filter(p => {
        if (p.type !== 'kml_point') return false;

        let pName = null;
        // Check custom property "Cell Name"
        if (p.customProperties) {
            const prop = p.customProperties.find(prop =>
                prop.name.toLowerCase().includes('cell') && prop.name.toLowerCase().includes('name')
            );
            if (prop) pName = String(prop.value).trim().toLowerCase();
        }
        // Check top level
        if (!pName && p.cellName) pName = String(p.cellName).trim().toLowerCase();

        return pName && targets.includes(pName);
    });

    if (matches.length === 0) {
        showNotification('No matching KML points found for this sector', 'info');
        return;
    }

    // Calculate Sector Tip
    const tip = destination(site.latitude, site.longitude, sector.azimuth, sector.range);

    // Draw lines
    matches.forEach(point => {
        const latlngs = [
            [tip.lat, tip.lng],
            [point.latitude, point.longitude]
        ];

        const polyline = L.polyline(latlngs, {
            color: '#ef4444',
            weight: 3,
            opacity: 0.8,
            dashArray: '10, 10',
            className: 'connection-line-flow',
            lineCap: 'round'
        });

        connectionLinesLayer.addLayer(polyline);
    });

    showNotification(`Connected to ${matches.length} matching kml points`, 'success');
}

function setupConnectionLineToggle() {
    const btn = document.getElementById('toggleConnectionLinesBtn');
    const txt = document.getElementById('connectionBtnText');

    if (!btn) return;

    btn.addEventListener('click', () => {
        isConnectionLinesEnabled = !isConnectionLinesEnabled;

        if (isConnectionLinesEnabled) {
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
            if (txt) txt.textContent = 'Lines: On';
            showNotification('Map Connection Lines Enabled', 'success');
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            if (txt) txt.textContent = 'Lines: Off';
            showNotification('Map Connection Lines Disabled', 'info');

            // Clear existing line immediately
            if (connectionLinesLayer) {
                connectionLinesLayer.clearLayers();
            }
        }
    });
}

// Update Map Markers 
function updateMapMarkers(options = { fitBounds: true }, filteredSites = null, filteredPoints = null) {
    markersLayer.clearLayers();
    if (pointsLayer) pointsLayer.clearLayers();
    sectorsLayer.clearLayers();

    const sitesToRender = filteredSites || sites;
    const pointsToRender = filteredPoints || points;

    console.log('Rendering Sites:', sitesToRender.length);

    // Render Sites
    sitesToRender.forEach(site => {
        if (hiddenSiteGroups.has(site.group || 'Other')) return;

        // Standard Site Marker (Blue Pin)
        const siteIcon = L.divIcon({
            className: 'custom-site-marker',
            html: `<div class="site-marker-label" style="display: ${showSiteNames ? 'block' : 'none'}">${site.name}</div>`,
            iconSize: [100, 30],
            iconAnchor: [50, 15]
        });

        const marker = L.marker([site.latitude, site.longitude], {
            icon: siteIcon,
            title: site.name,
            siteId: site.id // Store site ID for easy retrieval
        });

        marker.bindPopup(`
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; font-size: 1rem;">${site.name}</h3>
                <p style="margin: 0 0 4px 0; font-size: 0.875rem; color: #888;">
                    ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}
                </p>
                ${site.description ? `<p style="margin: 0 0 8px 0; font-size: 0.875rem;">${site.description}</p>` : ''}
                <p style="margin: 0; font-size: 0.875rem; color: #6366f1;">
                    <strong>${site.sectors.length}</strong> sector(s)
                </p>
            </div>
        `);

        marker.on('click', (e) => {
            if (isMeasuring) {
                L.DomEvent.stopPropagation(e);
                handleMeasureClick(e.latlng);
            } else {
                showSiteDetails(site);
            }
        });
        markersLayer.addLayer(marker);
    });

    // Render Points
    pointsToRender.forEach(point => {
        // Check if point belongs to a hidden KML group
        if (point.type === 'kml_point' && hiddenKmlGroups.has(point.group)) {
            return;
        }

        const pointColor = getPointColor(point);
        const customIcon = createCustomIcon(point, pointColor);

        // Create popup content
        let popupContent = `
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; color: var(--primary-600);">${point.name}</h3>
                ${point.description ? `<p style="margin: 0 0 8px 0; font-size: 0.9em;">${point.description}</p>` : ''}
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button onclick="openPointModal('${point.id}')" class="btn btn-sm btn-primary" style="padding: 4px 8px; font-size: 0.8em;">Edit</button>
                    <button onclick="deletePoint('${point.id}')" class="btn btn-sm btn-secondary" style="padding: 4px 8px; font-size: 0.8em; color: var(--error); border-color: var(--error);">Delete</button>
                </div>
            </div>
        `;

        // Add custom properties to popup
        if (point.customProperties && point.customProperties.length > 0) {
            popupContent += '<hr style="margin: 5px 0;">';
            point.customProperties.forEach(prop => {
                popupContent += `<b>${prop.name}:</b> ${prop.value}<br>`;
            });
        }

        const marker = L.marker([point.latitude, point.longitude], {
            icon: customIcon,
            pointId: point.id
        });

        marker.bindPopup(popupContent);

        marker.on('click', (e) => {
            if (isMeasuring) {
                L.DomEvent.stopPropagation(e);
                handleMeasureClick(e.latlng);
            } else if (isConnectionLinesEnabled) {
                // Only draw connection line, do not show popup
                drawConnectionLine(point);
            } else {
                highlightSiteInList(point.id); // Highlight in list
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(popupContent)
                    .openOn(map);
            }
        });
        pointsLayer.addLayer(marker);
    });

    // Draw sectors for visible area
    renderVisibleSectors();

    if (options.fitBounds && (sitesToRender.length > 0 || pointsToRender.length > 0)) {
        const allCoords = [
            ...sitesToRender.map(s => [s.latitude, s.longitude]),
            ...pointsToRender.map(p => [p.latitude, p.longitude])
        ];
        console.log('Fitting bounds for', allCoords.length, 'coords');
        if (allCoords.length > 0) {
            const bounds = L.latLngBounds(allCoords);
            console.log('Bounds:', bounds);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}

function centerMap() {
    if (sites.length > 0 || points.length > 0) {
        const allCoords = [
            ...sites.map(s => [s.latitude, s.longitude]),
            ...points.map(p => [p.latitude, p.longitude])
        ];
        if (allCoords.length > 0) {
            const bounds = L.latLngBounds(allCoords);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    } else {
        map.setView([33.5731, -7.5898], 6);
    }
}


function panToSite(id) {
    const site = sites.find(s => s.id === id);
    const point = points.find(p => p.id === id);

    const target = site || point;
    if (!target) return;

    // Check if it's a point (unclustered)
    if (point) {
        const marker = pointsLayer.getLayers().find(l => l.options.pointId === id);
        if (marker) {
            map.setView(marker.getLatLng(), 18);
            marker.openPopup();

            // Highlight
            const icon = marker.getElement();
            if (icon) {
                icon.classList.add('highlight-marker');
                setTimeout(() => icon.classList.remove('highlight-marker'), 2000);
            }
            return;
        }
    }

    // It's a site (clustered)
    if (site) {
        // Zoom to site
        // map.setView([site.latitude, site.longitude], 18); // Removed to avoid conflict

        // Find and open popup
        let markerFound = false;

        markersLayer.eachLayer(layer => {
            // Check if it's a cluster
            if (layer instanceof L.MarkerCluster) {
                const markers = layer.getAllChildMarkers();
                const marker = markers.find(m => m.options.siteId === id);
                if (marker) {
                    markersLayer.zoomToShowLayer(marker, () => {
                        marker.openPopup();
                    });
                    markerFound = true;
                }
            } else if (layer.options.siteId === id) {
                markersLayer.zoomToShowLayer(layer, () => {
                    layer.openPopup();
                });
                markerFound = true;
            }
        });
    }
}

function locateSite(siteId) {
    const site = sites.find(s => s.id == siteId);
    if (!site) return;

    // Find the marker
    const marker = markersLayer.getLayers().find(layer => layer.options.siteId == siteId);

    if (marker) {
        // Use MarkerCluster's zoomToShowLayer to handle clustered markers
        markersLayer.zoomToShowLayer(marker, () => {
            marker.openPopup();
            // Optional: Add a temporary highlight effect
            const icon = marker.getElement();
            if (icon) {
                icon.classList.add('highlight-marker');
                setTimeout(() => icon.classList.remove('highlight-marker'), 2000);
            }
        });
    } else {
        // Fallback if marker not found (shouldn't happen normally)
        map.flyTo([site.latitude, site.longitude], 16, { duration: 1.5 });
    }
}

// ==================== KML EXPORT ====================

function exportToKML(mode = 'sites') {
    if (sites.length === 0) {
        showNotification('No sites to export', 'error');
        return;
    }

    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Site Sector Map</name>
    <description>Exported from Site Sector Mapper</description>
    
    <Style id="siteIcon">
      <IconStyle>
        <color>ff6366f1</color>
        <scale>1.2</scale>
        <Icon>
          <href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>
        </Icon>
      </IconStyle>
    </Style>
`;

    // Add styles for sectors if in full mode
    if (mode === 'full') {
        // We'll use inline styles for sectors to support custom colors, 
        // but define a base style here if needed.
    }

    sites.forEach(site => {
        // 1. Add Site Point
        kml += `    <Placemark>
      <name>${escapeXml(site.name)}</name>
      <description><![CDATA[
        <h3>${escapeXml(site.name)}</h3>
        ${site.description ? `<p>${escapeXml(site.description)}</p>` : ''}
        <p><strong>Coordinates:</strong> ${site.latitude}, ${site.longitude}</p>
        <p><strong>Sectors:</strong> ${site.sectors.length}</p>
      ]]></description>
      <styleUrl>#siteIcon</styleUrl>
      <Point>
        <coordinates>${site.longitude},${site.latitude},0</coordinates>
      </Point>
    </Placemark>
`;

        // 2. Add Sector Polygons (if full mode)
        if (mode === 'full' && site.sectors) {
            site.sectors.forEach((sector, i) => {
                const center = { lat: site.latitude, lng: site.longitude };
                const azimuth = sector.azimuth;
                const beamwidth = sector.beamwidth;
                const range = sector.range;

                // Determine color (KML uses AABBGGRR hex format)
                let color = sector.color || '#3388ff';
                // Convert #RRGGBB to AABBGGRR
                const kmlColor = '80' + color.substring(5, 7) + color.substring(3, 5) + color.substring(1, 3); // 50% opacity (80 hex)

                // Calculate polygon coordinates
                let coords = `${center.lng},${center.lat},0 `; // Start at center

                const startAngle = (azimuth - beamwidth / 2);
                const endAngle = (azimuth + beamwidth / 2);
                const steps = 10;

                for (let j = 0; j <= steps; j++) {
                    const angle = startAngle + (j / steps) * (endAngle - startAngle);
                    const dest = destination(center.lat, center.lng, angle, range);
                    coords += `${dest.lng},${dest.lat},0 `;
                }

                coords += `${center.lng},${center.lat},0`; // Close loop

                // Calculate label position (midpoint of the sector arc)
                const midAngle = azimuth;
                const labelPos = destination(center.lat, center.lng, midAngle, range * 0.7);

                kml += `    <Placemark>
      <name>${escapeXml(site.name)} - Sector ${i + 1}</name>
      <Style>
        <IconStyle>
          <scale>0</scale>
        </IconStyle>
        <LineStyle>
          <color>${kmlColor}</color>
          <width>1</width>
        </LineStyle>
        <PolyStyle>
          <color>${kmlColor}</color>
        </PolyStyle>
      </Style>
      <MultiGeometry>
        <Point>
          <coordinates>${labelPos.lng},${labelPos.lat},0</coordinates>
        </Point>
        <Polygon>
          <outerBoundaryIs>
            <LinearRing>
              <coordinates>${coords}</coordinates>
            </LinearRing>
          </outerBoundaryIs>
        </Polygon>
      </MultiGeometry>
    </Placemark>
`;
            });
        }
    });

    kml += `  </Document>
</kml>`;

    // Download KML file
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sites_${mode}_${new Date().toISOString().split('T')[0]}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification('KML file downloaded successfully!', 'success');
}

function escapeXml(unsafe) {
    return (unsafe || '').replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// ==================== UI UPDATES ====================

function updateUI() {
    updateSiteCounter();
    renderSitesList();
    renderKmlList();
    updateThematicAttributes();
}


function updateSiteCounter() {
    document.getElementById('siteCount').textContent = sites.length;
}


function renderSitesList(filter = '') {
    const container = document.getElementById('sitesListContainer');

    const filteredSites = sites.filter(site =>
        site.type !== 'kml_point' && // Exclude KML points
        site.name.toLowerCase().includes(filter.toLowerCase())
    );

    if (filteredSites.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
                <p>No sites found</p>
            </div>
        `;
        return;
    }

    // Group sites
    const groups = {};
    filteredSites.forEach(site => {
        const groupName = site.group || 'Other';
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(site);
    });

    // Render groups
    container.innerHTML = Object.keys(groups).sort().map(groupName => {
        const groupSites = groups[groupName];
        const groupId = `group-${groupName.replace(/\s+/g, '-')}`;

        return `
            <div class="site-group">
                <div class="site-group-header" onclick="toggleGroup('${groupId}')">
                    <span class="group-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </span>
                    <span class="group-name">${groupName}</span>
                    <span class="group-count">${groupSites.length}</span>
                    <div class="group-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon" onclick="renameSiteGroup('${groupName.replace(/'/g, "\\'")}')" title="Rename Group" style="margin-right: 5px; padding: 2px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <input type="checkbox" 
                            ${!hiddenSiteGroups.has(groupName) ? 'checked' : ''} 
                            onclick="toggleSiteGroupVisibility('${groupName.replace(/'/g, "\\'")}')"
                            title="Toggle Visibility"
                            style="cursor: pointer; width: 16px; height: 16px;">
                    </div>
                </div>
                <div id="${groupId}" class="site-group-content">
                    ${groupSites.map(site => `
                        <div id="site-item-${site.id}" class="site-list-item" onclick="panToSite('${site.id}')">
                            <div class="site-info">
                                <div class="site-name">${site.name}</div>
                                <div class="site-coords">${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}</div>
                                <div class="site-sectors-info" style="font-size: 0.8em; color: var(--text-muted); margin-top: 4px;">
                                    <strong>${site.sectors ? site.sectors.length : 0} Sectors:</strong>
                                    <span style="margin-left: 4px;">
                                        ${site.sectors ? site.sectors.map(s => `${s.name || 'Sec'} (${s.azimuth}°)`).join(', ') : 'None'}
                                    </span>
                                </div>
                            </div>
                            <div class="site-actions">
                                <button class="edit-btn" onclick="editSite('${site.id}'); event.stopPropagation();" title="Edit Site">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="delete-btn" onclick="deleteSite('${site.id}'); event.stopPropagation();" title="Delete Site">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        <line x1="10" y1="11" x2="10" y2="17"></line>
                                        <line x1="14" y1="11" x2="14" y2="17"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function highlightSiteInList(siteId) {
    console.log('Highlighting site:', siteId);
    // Remove existing highlights
    document.querySelectorAll('.site-list-item.highlighted, .site-item.highlighted').forEach(el => {
        el.classList.remove('highlighted');
    });

    // Find and highlight new item
    const item = document.getElementById(`site-item-${siteId}`);
    if (item) {
        console.log('Found item:', item);
        item.classList.add('highlighted');

        // Ensure parent group is open (for Sites)
        const groupContent = item.closest('.site-group-content');
        if (groupContent) {
            // Force display block if hidden
            if (groupContent.style.display === 'none' || getComputedStyle(groupContent).display === 'none') {
                groupContent.style.display = 'block';
                // Update icon rotation
                const header = groupContent.previousElementSibling;
                if (header) header.classList.add('active');
            }
        }

        // Scroll into view
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Switch to appropriate tab
        // Check if it's a point (in points-list) or site (in sites-list)
        if (item.closest('#pointsListContainer')) {
            switchTab('points-list');
        } else {
            switchTab('sites-list');
        }
    } else {
        console.warn('Site item not found in list:', siteId);
        // Try to re-render list if not found?
        // renderSitesList(); 
        // But that might be recursive if not careful.
    }
}

function renderKmlList(searchTerm = '') {
    console.log('renderKmlList called');
    const kmlListContainer = document.getElementById('kmlListContainer');
    const kmlTotalCount = document.getElementById('kmlTotalCount');

    if (!kmlListContainer) {
        console.error('Error: kmlListContainer not found');
        return;
    }

    kmlListContainer.innerHTML = '';

    // Filter for KML points
    const kmlSites = points.filter(site => site.type === 'kml_point' && site.name.toLowerCase().includes(searchTerm.toLowerCase()));
    console.log(`Found ${kmlSites.length} KML sites in global array (Total points: ${points.length})`);

    // Debug first site to check type
    if (sites.length > 0) {
        console.log('First site sample:', sites[0]);
    }

    if (kmlTotalCount) {
        kmlTotalCount.textContent = `(${kmlSites.length})`;
    }

    if (kmlSites.length === 0) {
        kmlListContainer.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
                <p>No KML files imported</p>
            </div>
        `;
        return;
    }

    // Group sites by filename (group property)
    const groups = {};
    kmlSites.forEach(site => {
        const groupName = site.group || 'Unknown KML';
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(site);
    });

    // Render groups
    kmlListContainer.innerHTML = Object.keys(groups).sort().map(groupName => {
        const groupSites = groups[groupName];
        const groupId = `kml-group-${groupName.replace(/\s+/g, '-')}`;
        const initialLimit = 50;
        const hasMore = groupSites.length > initialLimit;
        const visibleSites = groupSites.slice(0, initialLimit);

        return `
            <div class="site-group">
                <div class="site-group-header" onclick="toggleGroup('${groupId}')">
                    <span class="group-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </span>
                    <span class="group-name">${groupName}</span>
                    <span class="group-count">${groupSites.length}</span>
                    <div class="group-actions" onclick="event.stopPropagation()">
                        <button class="btn-icon" onclick="renameKmlGroup('${groupName.replace(/'/g, "\\'")}')" title="Rename Group" style="margin-right: 5px; padding: 2px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="deleteKmlGroup('${groupName.replace(/'/g, "\\'")}')" title="Delete Group" style="margin-right: 5px; padding: 2px; color: var(--error);">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                        <input type="checkbox" 
                            ${!hiddenKmlGroups.has(groupName) ? 'checked' : ''} 
                            onclick="toggleKmlGroupVisibility('${groupName.replace(/'/g, "\\'")}')"
                            title="Toggle Visibility"
                            style="cursor: pointer; width: 16px; height: 16px;">
                    </div>
                </div>
                <div id="${groupId}" class="site-group-content">
                    <div id="${groupId}-list">
                        ${visibleSites.map(site => `
                            <div class="site-list-item" onclick="panToSite('${site.id}')">
                                <div class="site-info">
                                    <div class="site-name">
                                        <span class="site-color-dot" style="background-color: ${getPointColor(site)}; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px;"></span>
                                        ${site.name}
                                    </div>
                                    <div class="site-coords">${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}</div>
                                </div>
                                <button class="edit-btn" onclick="openEditModal('${site.id}', 'point'); event.stopPropagation();" title="Edit Point" style="margin-right: 5px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                                <button class="delete-btn" onclick="deletePoint('${site.id}'); event.stopPropagation();" title="Delete Point">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        <line x1="10" y1="11" x2="10" y2="17"></line>
                                        <line x1="14" y1="11" x2="14" y2="17"></line>
                                    </svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    ${hasMore ? `
                        <button class="btn btn-sm btn-secondary" style="width: 100%; margin-top: 8px;" onclick="loadMoreKmlPoints('${groupId}', '${groupName}', ${initialLimit})">
                            Load More (${groupSites.length - initialLimit} remaining)
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function loadMoreKmlPoints(groupId, groupName, currentCount) {
    const batchSize = 100;
    const listContainer = document.getElementById(`${groupId}-list`);
    const button = listContainer.nextElementSibling; // The "Load More" button

    // Find the group data
    const kmlSites = points.filter(site => site.type === 'kml_point');
    const groupSites = kmlSites.filter(site => (site.group || 'Unknown KML') === groupName);

    const nextBatch = groupSites.slice(currentCount, currentCount + batchSize);

    // Append new items
    const newItemsHtml = nextBatch.map(site => `
        <div id="site-item-${site.id}" class="site-list-item" onclick="panToSite('${site.id}')">
            <div class="site-info">
                <div class="site-name">
                    <span class="site-color-dot" style="background-color: ${site.iconColor || '#ef4444'}; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px;"></span>
                    ${site.name}
                </div>
                <div class="site-coords">${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}</div>
            </div>
            <button class="edit-btn" onclick="openEditModal('${site.id}', 'point'); event.stopPropagation();" title="Edit Point" style="margin-right: 5px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="delete-btn" onclick="deletePoint('${site.id}'); event.stopPropagation();" title="Delete Point">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
        </div>
    `).join('');

    listContainer.insertAdjacentHTML('beforeend', newItemsHtml);

    // Update button or remove if done
    const newCount = currentCount + nextBatch.length;
    if (newCount < groupSites.length) {
        button.setAttribute('onclick', `loadMoreKmlPoints('${groupId}', '${groupName}', ${newCount})`);
        button.textContent = `Load More (${groupSites.length - newCount} remaining)`;
    } else {
        button.remove();
    }
}

function toggleGroup(groupId) {
    const group = document.getElementById(groupId);
    const header = group.previousElementSibling;

    if (group && header) {
        group.classList.toggle('collapsed');
        header.classList.toggle('collapsed');
    }
}

function toggleKmlGroupVisibility(groupName) {
    if (hiddenKmlGroups.has(groupName)) {
        hiddenKmlGroups.delete(groupName);
    } else {
        hiddenKmlGroups.add(groupName);
    }

    // Update map
    updateMapMarkers({ fitBounds: false });

    // We don't need to re-render the list, as the checkbox state is already handled by the browser
    // But if we wanted to update other UI elements, we could.
}

function toggleSiteGroupVisibility(groupName) {
    if (hiddenSiteGroups.has(groupName)) {
        hiddenSiteGroups.delete(groupName);
    } else {
        hiddenSiteGroups.add(groupName);
    }
    updateMapMarkers({ fitBounds: false });
}

function renameSiteGroup(oldName) {
    const newName = prompt(`Rename group "${oldName}" to:`, oldName);
    if (newName && newName.trim() !== "" && newName !== oldName) {
        const trimmedName = newName.trim();

        // Update sites
        let updatedCount = 0;
        sites.forEach(site => {
            if ((site.group || 'Other') === oldName) {
                site.group = trimmedName;
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            // Update hidden groups
            if (hiddenSiteGroups.has(oldName)) {
                hiddenSiteGroups.delete(oldName);
                hiddenSiteGroups.add(trimmedName);
            }

            saveToLocalStorage();
            updateUI();
            updateMapMarkers({ fitBounds: false });
            showNotification(`Renamed group to "${trimmedName}"`, 'success');
        }
    }
}

function renameKmlGroup(oldName) {
    const newName = prompt(`Rename KML group "${oldName}" to:`, oldName);
    if (newName && newName.trim() !== "" && newName !== oldName) {
        const trimmedName = newName.trim();

        // Update points
        let updatedCount = 0;
        points.forEach(point => {
            if (point.type === 'kml_point' && (point.group || 'Unknown KML') === oldName) {
                point.group = trimmedName;
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            // Update hidden groups
            if (hiddenKmlGroups.has(oldName)) {
                hiddenKmlGroups.delete(oldName);
                hiddenKmlGroups.add(trimmedName);
            }

            saveToLocalStorage();
            updateUI();
            updateMapMarkers({ fitBounds: false });
            showNotification(`Renamed group to "${trimmedName}"`, 'success');
        }
    }
}

function deleteKmlGroup(groupName) {
    if (confirm(`Are you sure you want to delete the group "${groupName}" and all its points?`)) {
        // Filter out points belonging to this group
        const initialCount = points.length;
        points = points.filter(point => !(point.type === 'kml_point' && (point.group || 'Unknown KML') === groupName));
        const deletedCount = initialCount - points.length;

        if (deletedCount > 0) {
            // Remove from hidden groups if present
            if (hiddenKmlGroups.has(groupName)) {
                hiddenKmlGroups.delete(groupName);
            }

            saveToLocalStorage();
            updateUI();
            updateMapMarkers({ fitBounds: false });
            showNotification(`Deleted group "${groupName}" and ${deletedCount} points`, 'success');
        } else {
            showNotification('No points found in this group to delete', 'warning');
        }
    }
}


// ==================== MODAL & EDITING ====================

function showSiteDetails(site) {
    const modal = document.getElementById('siteModal');
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalSiteName');

    modalTitle.textContent = site.name;

    let html = `
        <div style="margin-bottom: 1rem;">
            <p style="margin-bottom: 0.5rem;"><strong>Coordinates:</strong> ${site.latitude}, ${site.longitude}</p>
            ${site.description ? `<p style="margin-bottom: 0.5rem;"><strong>Description:</strong> ${site.description}</p>` : ''}
        </div>
    `;

    if (site.sectors.length > 0) {
        html += `<h3 style="margin-bottom: 1rem; font-size: 1rem;">Sectors (${site.sectors.length})</h3>`;
        site.sectors.forEach((sector, index) => {
            html += `
                <div style="padding: 1rem; background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 0.75rem;">
                    <h4 style="margin-bottom: 0.5rem; color: var(--primary-400);">Sector ${sector.name || (index + 1)}</h4>
                    <p style="margin-bottom: 0.25rem; font-size: 0.875rem;">Azimuth: ${sector.azimuth}°</p>
                    <p style="margin-bottom: 0.25rem; font-size: 0.875rem;">Beamwidth: ${sector.beamwidth}°</p>
                    <p style="margin-bottom: 0.25rem; font-size: 0.875rem;">Range: ${sector.range}m</p>
                    ${sector.technology ? `<p style="margin-bottom: 0.25rem; font-size: 0.875rem;">Technology: ${sector.technology}</p>` : ''}
                    ${sector.frequency ? `<p style="margin-bottom: 0.25rem; font-size: 0.875rem;">Frequency: ${sector.frequency}</p>` : ''}
                </div>
            `;
        });
    }

    html += `
        <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem;">
            <button class="btn btn-primary" onclick="editSite('${site.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit Site
            </button>
            <button class="btn btn-secondary" onclick="deleteSite('${site.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete Site
            </button>
        </div>
    `;

    modalBody.innerHTML = html;
    modal.classList.add('active');
}

function closeModal() {
    console.log('closeModal called');
    const siteModal = document.getElementById('siteModal');
    if (siteModal) siteModal.classList.remove('active');

    const pointModal = document.getElementById('editSiteModal'); // Use editSiteModal for points
    if (pointModal) pointModal.classList.remove('active');

    editingId = null;
    editingPointId = null;
    editingType = null;
}

function cancelEdit() {
    closeModal();
}

async function handleEditSiteSubmit(e) {
    e.preventDefault();
    console.log('handleEditSiteSubmit called. editingPointId:', editingPointId, 'editingType:', editingType);

    try {
        const name = document.getElementById('editSiteName').value;
        const lat = parseFloat(document.getElementById('editSiteLat').value);
        const lng = parseFloat(document.getElementById('editSiteLng').value);
        const description = document.getElementById('editSiteDescription').value;

        if (!name || isNaN(lat) || isNaN(lng)) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }

        if (editingType === 'site') {
            // Update Site
            const siteIndex = sites.findIndex(s => s.id === editingPointId);
            if (siteIndex !== -1) {
                sites[siteIndex] = {
                    ...sites[siteIndex],
                    name,
                    latitude: lat,
                    longitude: lng,
                    description
                };
                showNotification('Site updated', 'success');
            }
        } else {
            // Update or Create Point
            const shape = document.getElementById('pointShape').value;
            const size = parseInt(document.getElementById('pointSize').value);
            const color = document.getElementById('pointColor').value;

            // Collect Custom Properties
            const customProperties = [];
            document.querySelectorAll('.custom-property-row').forEach(row => {
                const propName = row.querySelector('.property-name').value;
                const propValue = row.querySelector('.property-value').value;
                if (propName) {
                    customProperties.push({ name: propName, value: propValue });
                }
            });

            if (editingPointId) {
                // Update Point
                console.log('Updating existing point:', editingPointId);
                const pointIndex = points.findIndex(p => p.id === editingPointId);
                if (pointIndex !== -1) {
                    points[pointIndex] = {
                        ...points[pointIndex],
                        name,
                        latitude: lat,
                        longitude: lng,
                        description,
                        shape,
                        size,
                        color,
                        customProperties
                    };
                    showNotification('Point updated', 'success');
                } else {
                    console.error('Point not found for update:', editingPointId);
                }
            } else {
                // Create New Point
                console.log('Creating new point');
                const newPoint = {
                    id: Date.now().toString(),
                    type: 'point', // Distinguish from KML points if needed
                    name,
                    latitude: lat,
                    longitude: lng,
                    description,
                    shape,
                    size,
                    color,
                    customProperties
                };
                points.push(newPoint);
                showNotification('Point created', 'success');
            }
        }

        saveData();
        updateMapMarkers({ fitBounds: false });
        renderPointsList(); // Update points list if needed
        closeModal();
    } catch (error) {
        console.error('Error in handleEditSiteSubmit:', error);
        showNotification('Error saving point: ' + error.message, 'error');
    }
}

function openPointModal(pointId = null, lat = null, lng = null) {
    console.log('openPointModal called. pointId:', pointId);
    const modal = document.getElementById('editSiteModal');
    const form = document.getElementById('editSiteForm');
    const title = document.getElementById('editSiteTitle');

    // Reset form
    form.reset();
    document.getElementById('customPropertiesContainer').innerHTML = '';

    if (pointId) {
        // Edit existing point
        const point = points.find(p => p.id === pointId);
        if (point) {
            editingPointId = pointId;
            editingType = 'point';
            console.log('Editing mode set. editingPointId:', editingPointId);
            title.textContent = 'Edit Point';
            document.getElementById('editSiteName').value = point.name;
            document.getElementById('editSiteLat').value = point.latitude;
            document.getElementById('editSiteLng').value = point.longitude;
            document.getElementById('editSiteDescription').value = point.description || '';
            document.getElementById('pointShape').value = point.shape || 'circle';
            document.getElementById('pointSize').value = point.size || 30;
            document.getElementById('pointColor').value = point.color || '#ef4444';
            document.getElementById('pointColorText').value = point.color || '#ef4444';

            // Load custom properties
            if (point.customProperties) {
                point.customProperties.forEach(prop => addCustomPropertyField(prop.name, prop.value));
            }
        } else {
            console.error('Point not found in openPointModal:', pointId);
        }
    } else {
        // Add new point
        editingPointId = null;
        editingType = 'point';
        console.log('Create mode set.');
        title.textContent = 'Add Point';
        if (lat && lng) {
            document.getElementById('editSiteLat').value = lat;
            document.getElementById('editSiteLng').value = lng;
        }
    }

    modal.classList.add('active');
}

function closePointModal() {
    console.log('closePointModal called');
    const modal = document.getElementById('editSiteModal');
    if (modal) modal.classList.remove('active');
    editingPointId = null;
    editingType = null;
}

function addCustomPropertyField(name = '', value = '') {
    const container = document.getElementById('customPropertiesContainer');
    const div = document.createElement('div');
    div.className = 'custom-property-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';

    div.innerHTML = `
        <input type="text" placeholder="Name" class="property-name" value="${name}" style="flex: 1;">
        <input type="text" placeholder="Value" class="property-value" value="${value}" style="flex: 1;">
        <button type="button" class="btn btn-secondary" onclick="this.parentElement.remove()" style="color: var(--error); padding: 0 10px;">&times;</button>
    `;

    container.appendChild(div);
}

function editSite(id) {
    const site = sites.find(s => s.id === id);
    if (!site) return;

    // Close detail modal if open
    document.getElementById('siteModal').classList.remove('active');

    // Use Manual Form for editing (allows sector editing)
    editingId = site.id;

    // Populate form
    document.getElementById('siteName').value = site.name;
    document.getElementById('latitude').value = site.latitude;
    document.getElementById('longitude').value = site.longitude;
    document.getElementById('description').value = site.description || '';

    // Clear existing sectors in form
    const sectorsContainer = document.getElementById('sectorsContainer');
    sectorsContainer.innerHTML = '';
    sectorCounter = 0;

    // Populate sectors
    if (site.sectors && site.sectors.length > 0) {
        site.sectors.forEach(sector => {
            addSectorToForm(sector);
        });
    }

    // Change button text
    const submitBtn = document.getElementById('manualForm').querySelector('button[type="submit"]');
    submitBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Update Site
    `;

    // Show Cancel button
    document.getElementById('cancelEditBtn').style.display = 'block';

    // Show Manual Form Container
    document.getElementById('manualFormContainer').style.display = 'block';

    // Hide other containers if needed (e.g. import options)
    // Assuming manualFormContainer is inside the sidebar which is already visible?
    // If not, we might need to open the sidebar tab.
    // Let's ensure the "Sites List" tab is active or just show the form.
    // Actually, manualFormContainer is usually shown when clicking "Manual Entry" in "Import" tab.
    // We should probably switch to "Import" tab or "Sites List" tab?
    // The manual form is in the "Sites List" tab (index.html structure).
    // So we should switch to 'sites-list' tab.
    switchTab('sites-list');
    document.getElementById('importMenu').style.display = 'none'; // Hide import menu
    document.getElementById('manualFormContainer').style.display = 'block';
}

async function deleteSite(id) {
    if (confirm('Are you sure you want to delete this site?')) {
        // Delete from Airtable
        showNotification('Deleting site from Airtable...', 'info');
        const result = await deleteAirtableRecord(id);

        if (result) {
            sites = sites.filter(s => s.id !== id);
            saveToLocalStorage();
            updateUI();
            updateMapMarkers({ fitBounds: false });
            closeModal();
            showNotification('Site deleted successfully', 'success');
        } else {
            // If Airtable delete fails, should we delete locally?
            // For safety, let's ask or just warn.
            // Let's delete locally but warn.
            if (confirm('Airtable delete failed. Delete locally anyway?')) {
                sites = sites.filter(s => s.id !== id);
                saveToLocalStorage();
                updateUI();
                updateMapMarkers({ fitBounds: false });
                closeModal();
                showNotification('Site deleted locally (Airtable failed)', 'warning');
            }
        }
    }
}

function locateSite(lat, lng) {
    map.setView([lat, lng], 18);
}

// ==================== UTILITY FUNCTIONS ====================

function clearAllSites() {
    // Check if there is any data to clear
    const hasSites = sites && sites.length > 0;
    const hasKml = kmlData && kmlData.length > 0;
    // Check points safely
    const hasPoints = typeof points !== 'undefined' && points && points.length > 0;

    if (!hasSites && !hasPoints && !hasKml) {
        showNotification('No data to clear', 'warning');
        return;
    }

    if (confirm('Are you sure you want to clear ALL data (Sites, Points, and KML)? This action cannot be undone.')) {
        // Clear Global State
        sites = [];
        if (typeof points !== 'undefined') points = [];
        kmlData = null;
        currentKmlFilename = '';

        // Clear Storage
        // localStorage.removeItem('siteSectorMapper_sites');
        // localStorage.removeItem('siteSectorMapper_points');
        clearDB().then(() => console.log('DB Cleared')).catch(err => console.error('Error clearing DB', err));

        // Clear Map
        if (markersLayer) markersLayer.clearLayers();
        if (pointsLayer) pointsLayer.clearLayers();
        if (sectorsLayer) sectorsLayer.clearLayers();

        // Update UI
        updateUI();
        updateMapMarkers();

        // Clear KML List specifically
        const kmlListContainer = document.getElementById('kmlListContainer');
        if (kmlListContainer) kmlListContainer.innerHTML = '';
        const kmlTotalCount = document.getElementById('kmlTotalCount');
        if (kmlTotalCount) kmlTotalCount.textContent = '(0)';

        // Reset File Inputs to allow re-importing same file
        const kmlInput = document.getElementById('kmlFileInput');
        if (kmlInput) kmlInput.value = '';
        const csvInput = document.getElementById('csvFileInput');
        if (csvInput) csvInput.value = '';

        showNotification('All data cleared successfully', 'success');
    }
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('siteSectorMapper_sites', JSON.stringify(sites));
        localStorage.setItem('siteSectorMapper_points', JSON.stringify(points));
        return true;
    } catch (e) {
        console.error('Storage quota exceeded:', e);
        return false;
    }
}

// ==================== INDEXEDDB PERSISTENCE ====================

let db = null;
const DB_NAME = 'SiteMapperDB';
const DB_VERSION = 1;
const STORE_NAME = 'data';

function setupDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.errorCode);
            reject(event.target.errorCode);
        };
    });
}

function saveToDB(key, value) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not initialized');
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(value, key);

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

function getFromDB(key) {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not initialized');
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

function clearDB() {
    return new Promise((resolve, reject) => {
        if (!db) return reject('DB not initialized');
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

async function saveData() {
    try {
        if (!db) await setupDB();
        await saveToDB('sites', sites);
        await saveToDB('points', points);
        // Also save metadata if needed
        console.log('Data saved to IndexedDB');
    } catch (e) {
        console.error('Error saving data to DB:', e);
    }
}

async function loadData() {
    try {
        await setupDB();
        const storedSites = await getFromDB('sites');
        if (storedSites) sites = storedSites;

        const storedPoints = await getFromDB('points');
        if (storedPoints) points = storedPoints;

        if (sites.length > 0 || points.length > 0) {
            updateUI(); // Refresh UI with loaded data
            updateMapMarkers({ fitBounds: true });
            showNotification(`Restored ${sites.length} sites and ${points.length} points`, 'info');
        }

        loadThematicSettings();
    } catch (e) {
        console.error('Error loading data from DB:', e);
    }
}

// Deprecated: loadFromLocalStorage (kept for reference but unused)
function loadFromLocalStorage_OLD() {
    const storedSites = localStorage.getItem('siteSectorMapper_sites');
    if (storedSites) {
        try {
            sites = JSON.parse(storedSites);
        } catch (e) {
            console.error('Error loading sites:', e);
        }
    }

    const storedPoints = localStorage.getItem('siteSectorMapper_points');
    if (storedPoints) {
        try {
            points = JSON.parse(storedPoints);
        } catch (e) {
            console.error('Error loading points:', e);
        }
    }
    updateMapMarkers({ fitBounds: false });
    updateMapMarkers({ fitBounds: false });
    loadThematicSettings();
}

function loadThematicSettings() {
    // Always populate attributes first
    updateThematicAttributes();

    const savedSettings = localStorage.getItem('siteSectorMapper_thematicSettings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.siteAttribute) {
                document.getElementById('siteAttribute').value = settings.siteAttribute;
            }
            if (settings.kmlAttribute) {
                document.getElementById('kmlAttribute').value = settings.kmlAttribute;
            }

            // Apply if either is set
            if (settings.siteAttribute !== 'n_a' || settings.kmlAttribute !== 'n_a') {
                applyThematicAnalysis();
            }
        } catch (e) {
            console.error('Error loading thematic settings:', e);
        }
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: ${type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)'};
            color: white;
            border - radius: 0.5rem;
            box - shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
            z - index: 9999;
            font - size: 0.875rem;
            font - weight: 500;
            backdrop - filter: blur(10px);
            animation: slideIn 0.3s ease - out;
            `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
            @keyframes slideIn {
        from {
                    transform: translateX(400px);
                    opacity: 0;
                }
        to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
        from {
                    transform: translateX(0);
                    opacity: 1;
                }
        to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
            `;
document.head.appendChild(style);

function createCustomIcon(site, overrideColor = null) {
    const shape = site.shape || site.iconShape || 'default';
    const color = overrideColor || site.color || site.iconColor || '#3b82f6';
    const size = site.size || site.iconSize || 30;

    if (shape === 'default') {
        // Default Leaflet-like pin but with custom color
        return L.divIcon({
            className: 'custom-site-marker',
            html: `
                <div style="position: relative; width: ${size}px; height: ${size}px; pointer-events: auto;">
                    <svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                    
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size]
        });
    }

    let svgShape = '';
    switch (shape) {
        case 'circle':
            svgShape = `<circle cx="12" cy="12" r="10" />`;
            break;
        case 'square':
            svgShape = `<rect x="4" y="4" width="16" height="16" rx="2" />`;
            break;
        case 'triangle':
            svgShape = `<path d="M12 2L2 22h20L12 2z" />`;
            break;
        case 'star':
            svgShape = `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />`;
            break;
        case 'diamond':
            svgShape = `<path d="M12 2L2 12l10 10 10-10L12 2z" />`;
            break;
        case '3d-sphere':
            // Sphere with radial gradient
            svgShape = `
                <defs>
                    <radialGradient id="grad-sphere-${color}" cx="30%" cy="30%" r="70%">
                        <stop offset="0%" style="stop-color: #fff; stop-opacity: 0.5" />
                        <stop offset="100%" style="stop-color: ${color}; stop-opacity: 1" />
                    </radialGradient>
                </defs>
                <circle cx="12" cy="12" r="10" fill="url(#grad-sphere-${color})" stroke="none" />
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="none" style="mix-blend-mode: multiply; opacity: 0.3;" />
            `;
            break;
        case '3d-cube':
            // Isometric cube
            // Top face (lighter)
            // Right face (darker)
            // Left face (base color)
            svgShape = `
                <path d="M12 2 L22 7 L12 12 L2 7 Z" fill="${color}" style="filter: brightness(1.3);" stroke="none"/>
                <path d="M22 7 L22 17 L12 22 L12 12 Z" fill="${color}" style="filter: brightness(0.7);" stroke="none"/>
                <path d="M2 7 L12 12 L12 22 L2 17 Z" fill="${color}" stroke="none"/>
            `;
            break;
        case '3d-cylinder':
            // Cylinder
            // Top ellipse (lighter)
            // Side body (gradient or solid)
            svgShape = `
                <path d="M2 7 L2 17 Q12 22 22 17 L22 7" fill="${color}" stroke="none"/>
                <ellipse cx="12" cy="7" rx="10" ry="3" fill="${color}" style="filter: brightness(1.3);" stroke="none"/>
                <path d="M2 7 Q12 12 22 7" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
            `;
            break;
    }

    return L.divIcon({
        className: 'custom-site-marker point-marker',
        html: `
            <div style="position: relative; width: ${size}px; height: ${size}px;">
                <svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                    ${svgShape}
                </svg>
                
            </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

function toggleAddMarkerMode(enable) {
    isAddingMarker = enable;
    const btn = document.getElementById('addMarkerBtn');

    if (enable) {
        btn.classList.add('active');
        document.getElementById('map').style.cursor = 'crosshair';
        showNotification('Click on the map to add a marker', 'info');
    } else {
        btn.classList.remove('active');
        document.getElementById('map').style.cursor = '';
    }
}



// ==================== POINT MODAL LOGIC ====================

// Open Edit Modal
function openEditModal(id, type = 'site') {
    editingPointId = id;
    editingType = type;

    let item;
    if (type === 'site') {
        item = sites.find(s => s.id === id);
        document.getElementById('editSiteTitle').textContent = 'Edit Site';
        document.getElementById('customPropertiesSection').style.display = 'none'; // Hide for sites for now (or enable if desired)
    } else {
        item = points.find(p => p.id === id);
        document.getElementById('editSiteTitle').textContent = 'Edit Point';
        document.getElementById('customPropertiesSection').style.display = 'block';
    }

    if (!item) return;

    document.getElementById('editSiteName').value = item.name;
    document.getElementById('editSiteLat').value = item.latitude;
    document.getElementById('editSiteLng').value = item.longitude;
    document.getElementById('editSiteDescription').value = item.description || '';

    // Populate Custom Properties
    const container = document.getElementById('customPropertiesContainer');
    container.innerHTML = '';
    if (item.customProperties) {
        item.customProperties.forEach(prop => addPropertyRow(prop.name, prop.value));
    }

    document.getElementById('editSiteModal').style.display = 'flex';
}

function addPropertyRow(name = '', value = '') {
    const container = document.getElementById('customPropertiesContainer');
    const row = document.createElement('div');
    row.className = 'property-row';
    row.style.display = 'flex';
    row.style.gap = '5px';
    row.style.marginBottom = '5px';

    row.innerHTML = `
        <input type="text" class="prop-name" placeholder="Name" value="${name}" style="flex: 1; padding: 5px;">
        <input type="text" class="prop-value" placeholder="Value" value="${value}" style="flex: 1; padding: 5px;">
        <button type="button" class="remove-prop-btn" onclick="this.parentElement.remove()" style="background: none; border: none; color: var(--error); cursor: pointer;">X</button>
    `;
    container.appendChild(row);
}

document.getElementById('addPropertyBtn').addEventListener('click', () => addCustomPropertyField());

// Close Modal
function closePointModal() {
    document.getElementById('editSiteModal').style.display = 'none';
    editingPointId = null;
    editingType = null;
}

// Save Changes




async function deletePoint(pointId) {
    if (confirm('Are you sure you want to delete this point?')) {
        // Points are local only for now, but if we wanted to sync:
        // await deleteAirtableRecord(pointId);

        points = points.filter(p => p.id != pointId);
        saveData();
        updateMapMarkers({ fitBounds: false });
        updateUI();
        renderPointsList();
        showNotification('Point deleted', 'success');
    }
}

// ==================== MEASURE TOOL ====================

function toggleMeasureMode(enable) {
    isMeasuring = enable;
    const btn = document.getElementById('measureBtn');

    if (enable) {
        // Disable other modes
        if (isAddingMarker) toggleAddMarkerMode(false);

        btn.classList.add('active');
        document.getElementById('map').style.cursor = 'crosshair';
        showNotification('Click two points to measure distance', 'info');

        // Init layer if needed
        if (!measureLayer) {
            measureLayer = L.layerGroup().addTo(map);
        } else {
            // Ensure it's on the map
            if (!map.hasLayer(measureLayer)) {
                measureLayer.addTo(map);
            }
        }
        measurePoints = [];
        // Do NOT clear layers here to persist existing measurements
        // measureLayer.clearLayers(); 
    } else {
        btn.classList.remove('active');
        document.getElementById('map').style.cursor = '';
        // measureLayer.clearLayers(); // Keep measurements on map
        measurePoints = [];
        selectedMeasurement = null;
        tempMeasureMarker = null;
    }
}

function handleMeasureClick(latlng) {
    try {
        console.log('handleMeasureClick called', latlng);
        // If we have 2 points (completed measurement), start a NEW one
        if (measurePoints.length >= 2) {
            measurePoints = [];
        }

        measurePoints.push(latlng);
        console.log('measurePoints length:', measurePoints.length);

        // Temporary marker for the first point (visual feedback before line is drawn)
        if (measurePoints.length === 1) {
            tempMeasureMarker = L.circleMarker(latlng, {
                radius: 5,
                color: '#f59e0b',
                fillColor: '#f59e0b',
                fillOpacity: 1,
                className: 'measure-temp-marker',
                interactive: false // Allow clicks to pass through if needed, though usually we want to capture
            }).addTo(measureLayer);

            showNotification('First point set. Click another point.', 'info');
        }

        if (measurePoints.length === 2) {
            console.log('Finishing measurement...');
            // Remove temp marker
            if (tempMeasureMarker) {
                measureLayer.removeLayer(tempMeasureMarker);
                tempMeasureMarker = null;
            }

            // Create a FeatureGroup for this measurement
            const measurementGroup = L.featureGroup();

            // IMPORTANT: Add to map BEFORE getting center or binding popups to avoid Leaflet errors
            measurementGroup.addTo(measureLayer);

            // Add markers
            measurePoints.forEach(pt => {
                L.circleMarker(pt, {
                    radius: 5,
                    color: '#f59e0b',
                    fillColor: '#f59e0b',
                    fillOpacity: 1,
                    interactive: false
                }).addTo(measurementGroup);
            });

            // Draw line
            const polyline = L.polyline(measurePoints, {
                color: '#f59e0b',
                weight: 3,
                dashArray: '10, 10',
                interactive: false
            }).addTo(measurementGroup);

            // Calculate distance
            const distance = measurePoints[0].distanceTo(measurePoints[1]);

            // Now that it's on the map, we can safely get the center
            const center = polyline.getCenter();

            // Add Tooltip (instead of Popup)
            const tooltip = L.tooltip({
                permanent: true,
                direction: 'center',
                className: 'measure-tooltip'
            })
                .setContent(`${Math.round(distance)} m`);

            polyline.bindTooltip(tooltip).openTooltip();

            // Selection Logic
            measurementGroup.on('click', (e) => {
                L.DomEvent.stopPropagation(e); // Prevent map click

                // Deselect previous
                if (selectedMeasurement && selectedMeasurement !== measurementGroup) {
                    selectedMeasurement.setStyle({ color: '#f59e0b' });
                }

                // Select current
                selectedMeasurement = measurementGroup;
                measurementGroup.setStyle({ color: '#ffffff' }); // Highlight white
                showNotification('Measurement selected. Press Delete to remove.', 'info');
            });

            // Reset for next measurement
            measurePoints = [];
            showNotification(`Distance: ${Math.round(distance)} m`, 'success');
        }
    } catch (err) {
        console.error('Error in handleMeasureClick:', err);
        showNotification('Error: ' + err.message, 'error');
    }
}

// Clear Measurements Button
const clearMeasureBtn = document.getElementById('clearMeasureBtn');
if (clearMeasureBtn) {
    clearMeasureBtn.addEventListener('click', clearMeasurements);
}

// Clear KML Data Button
const clearKmlDataBtn = document.getElementById('clearKmlDataBtn');
if (clearKmlDataBtn) {
    clearKmlDataBtn.addEventListener('click', clearKmlData);
}

// Export Attributes Button
const exportAttributesBtn = document.getElementById('exportAttributesBtn');
if (exportAttributesBtn) {
    exportAttributesBtn.addEventListener('click', exportKmlAttributes);
}

// Make functions global for HTML onclick handlers
window.importKmlData = importKmlData;
window.toggleGroup = toggleGroup;
window.showSiteDetails = showSiteDetails;
window.locateSite = locateSite;
window.deleteSite = deleteSite;
window.clearMeasurements = clearMeasurements;


function clearMeasurements() {
    if (measureLayer) {
        measureLayer.clearLayers();
        measurePoints = [];
        selectedMeasurement = null;
        tempMeasureMarker = null;
        showNotification('All measurements cleared', 'info');
    }
}
window.editSite = editSite;
window.cancelEdit = cancelEdit;

window.deletePoint = deletePoint;
window.panToSite = panToSite;

// Event Listener for Thematic Source Change
// (Removed obsolete listener)

function updateThematicAttributes() {
    const attributeSelect = document.getElementById('kmlAttribute');
    if (!attributeSelect) return;

    attributeSelect.innerHTML = ''; // Clear existing

    // Add N#A Option
    const naOption = document.createElement('option');
    naOption.value = 'n_a';
    naOption.textContent = 'N#A';
    attributeSelect.appendChild(naOption);

    // Scan for Custom Properties in KML points AND Site Sectors
    const kmlPoints = points.filter(p => p.type === 'kml_point');

    // Collect unique keys from both sources
    const kmlKeys = new Set();
    kmlPoints.forEach(p => {
        if (p.customProperties) {
            p.customProperties.forEach(prop => kmlKeys.add(prop.name));
        }
    });

    // Collect keys from Sites (Sectors)
    const siteKeys = new Set();
    sites.forEach(site => {
        if (site.sectors) {
            site.sectors.forEach(sector => {
                if (sector.customProperties) {
                    sector.customProperties.forEach(prop => siteKeys.add(prop.name));
                }
            });
        }
    });

    // Only populate if we have KML points
    if (kmlPoints.length > 0) {
        // Default Options
        const defaultOptions = [
            { value: 'name', text: 'Name' },
            { value: 'group', text: 'Group (File)' }
        ];

        defaultOptions.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.text;
            attributeSelect.appendChild(el);
        });

        const customKeys = new Set();
        kmlPoints.forEach(p => {
            if (p.customProperties) {
                p.customProperties.forEach(prop => customKeys.add(prop.name));
            }
        });

        if (kmlKeys.size > 0) {
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '--- Custom Attributes ---';
            attributeSelect.appendChild(separator);

            Array.from(kmlKeys).sort().forEach(key => {
                const el = document.createElement('option');
                el.value = `custom:${key}`;
                el.textContent = key;
                attributeSelect.appendChild(el);
            });
        }
    }

    // UPDATE SITE ATTRIBUTE SELECT AS WELL
    const siteAttributeSelect = document.getElementById('siteAttribute');
    if (siteAttributeSelect) {
        // Keep existing hardcoded options, but append dynamic ones
        // First, remove any previously added dynamic options (marked with class 'dynamic-opt')
        // Actually, simpler to rebuild or check existing.
        // Let's just append if not exists.

        // Clear only dynamic options if possible? Or just rebuild bottom part.
        // Let's clear and re-add standard opts to be safe? 
        // No, standard opts are in HTML. 
        // Let's remove any validation-added extensions first.

        // For SIMPLICITY: We will append. If we run this multiple times, we should clear previous custom opts.
        // Identifying them by value prefix 'custom:' is easiest.
        Array.from(siteAttributeSelect.options).forEach(opt => {
            if (opt.value.startsWith('custom:')) {
                opt.remove();
            }
        });

        // Add Standard Optional Attributes (PCI, Cell Name)
        const standardOptional = [
            { value: 'pci', text: 'Physical Cell ID (PCI)' },
            { value: 'cell_name', text: 'Cell Name' }
        ];

        standardOptional.forEach(opt => {
            let exists = false;
            Array.from(siteAttributeSelect.options).forEach(o => {
                if (o.value === opt.value) exists = true;
            });

            if (!exists) {
                const el = document.createElement('option');
                el.value = opt.value;
                el.textContent = opt.text;
                siteAttributeSelect.appendChild(el);
            }
        });

        if (siteKeys.size > 0) {
            // Check if separator exists
            let hasSep = false;
            Array.from(siteAttributeSelect.options).forEach(opt => {
                if (opt.textContent === '--- Custom Attributes ---') hasSep = true;
            });

            if (!hasSep) {
                const separator = document.createElement('option');
                separator.disabled = true;
                separator.textContent = '--- Custom Attributes ---';
                siteAttributeSelect.appendChild(separator);
            }

            Array.from(siteKeys).sort().forEach(key => {
                const el = document.createElement('option');
                el.value = `custom:${key}`;
                el.textContent = key;
                siteAttributeSelect.appendChild(el);
            });
        }
    }
}

// Global State for Thematic Settings (Declared at top of file)
// activeThematicSettings is already defined


function getPointColor(point) {
    if (activeThematicSettings.kml && point.type === 'kml_point') {
        const settings = activeThematicSettings.kml;
        let val;
        if (settings.isCustom) {
            const prop = point.customProperties?.find(p => p.name === settings.attributeName);
            val = prop ? prop.value : 'Unknown';
        } else {
            val = point[settings.attribute];
        }

        if (settings.type === 'categorical') {
            return settings.mapping[val] || '#999999';
        } else {
            const numVal = parseFloat(val);
            if (!isNaN(numVal)) {
                const range = settings.ranges.find(r => numVal >= r.min && numVal <= r.max);
                if (range) return range.color;
            }
            return '#999999';
        }
    }
    return point.iconColor || '#ef4444';
}

console.log('App.js initialization complete');


// ==================== THEMATIC ANALYSIS ====================

function applyThematicAnalysis() {
    const siteAttribute = document.getElementById('siteAttribute').value;
    const kmlAttribute = document.getElementById('kmlAttribute').value;

    // 1. Process Sites Settings
    if (siteAttribute === 'n_a') {
        activeThematicSettings.sites = null;
    } else {
        activeThematicSettings.sites = generateThematicSettings('sites', siteAttribute);
    }

    // 2. Process KML Settings
    if (kmlAttribute === 'n_a') {
        activeThematicSettings.kml = null;
    } else {
        activeThematicSettings.kml = generateThematicSettings('kml', kmlAttribute);
    }

    // 3. LEGEND SYNCHRONIZATION
    // If both active, check if they are "equivalent" attributes and unify their legends
    if (activeThematicSettings.sites && activeThematicSettings.kml) {
        const siteAttr = activeThematicSettings.sites.attributeName.toLowerCase().replace(/_/g, ' ');
        const kmlAttr = activeThematicSettings.kml.attributeName.toLowerCase().replace(/_/g, ' ');

        // Equivalence Heuristic
        // 1. Exact Name Match
        // 2. "SC " prefix (SC Physical Cell ID vs Physical Cell ID)
        // 3. Aliases (PCI <-> Physical Cell ID)

        let isEquivalent = false;

        if (siteAttr === kmlAttr) isEquivalent = true;
        else if (siteAttr.replace('sc ', '') === kmlAttr.replace('sc ', '')) isEquivalent = true;
        else if ((siteAttr === 'pci' && kmlAttr.includes('physical cell id')) || (kmlAttr === 'pci' && siteAttr.includes('physical cell id'))) isEquivalent = true;
        else if (siteAttr.includes('cell') && siteAttr.includes('name') && kmlAttr.includes('cell') && kmlAttr.includes('name')) isEquivalent = true;

        if (isEquivalent && activeThematicSettings.sites.type === 'categorical' && activeThematicSettings.kml.type === 'categorical') {
            const allValues = new Set([
                ...activeThematicSettings.sites.uniqueValues,
                ...activeThematicSettings.kml.uniqueValues
            ]);
            const sortedValues = Array.from(allValues).sort();

            // Generate Unified Mapping
            const mapping = {};
            const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

            sortedValues.forEach((val, index) => {
                mapping[val] = palette[index % palette.length];
            });

            // Apply to both
            activeThematicSettings.sites.mapping = mapping;
            activeThematicSettings.sites.uniqueValues = sortedValues; // Show full legend for context
            activeThematicSettings.kml.mapping = mapping;
            activeThematicSettings.kml.uniqueValues = sortedValues;
        }
    }

    // 4. Apply & Render
    renderVisibleSectors();
    updateMapMarkers({ fitBounds: false });
    renderThematicLegend();
    renderMapLegend();

    if (activeThematicSettings.sites || activeThematicSettings.kml) {
        showNotification('Thematic analysis applied', 'success');
    } else {
        showNotification('Analysis cleared (N#A selected for both)', 'info');
    }

    // Save settings to localStorage
    localStorage.setItem('siteSectorMapper_thematicSettings', JSON.stringify({
        siteAttribute,
        kmlAttribute
    }));
}

function generateThematicSettings(source, attribute) {
    let dataItems = [];
    if (source === 'sites') {
        sites.forEach(site => {
            if (site.sectors) {
                site.sectors.forEach(sector => dataItems.push(sector));
            }
        });
    } else {
        dataItems = points.filter(p => p.type === 'kml_point');
    }

    if (dataItems.length === 0) return null;

    let attributeName = attribute;
    let isCustom = false;

    if (attribute.startsWith('custom:')) {
        attributeName = attribute.substring(7);
        isCustom = true;
    }

    // Analyze Values
    const values = [];
    const uniqueValues = new Set();
    const counts = {};

    dataItems.forEach(item => {
        let val;
        if (isCustom) {
            // Handle both KML and Site Sectors
            const prop = item.customProperties?.find(p => p.name === attributeName);
            val = prop ? prop.value : null;
        } else {
            val = item[attributeName];
        }

        if (val !== undefined && val !== null && val !== '') {
            values.push(val);
            uniqueValues.add(val);
            counts[val] = (counts[val] || 0) + 1;
        }
    });

    if (values.length === 0) return null;

    // Determine Type (Numerical vs Categorical)
    // Use parseNumber to check if values are numerical
    const isNumerical = values.every(v => parseNumber(v) !== null);
    let type = isNumerical && uniqueValues.size > 5 ? 'numerical' : 'categorical'; // Heuristic

    // Force categorical for certain attributes
    if (['technology', 'name', 'group', 'sc physical cell id', 'physical cell id', 'pci', 'cell name', 'cell_name'].includes(attributeName.toLowerCase())) {
        type = 'categorical';
    }

    // Force numerical for known numerical attributes
    const attrLower = attributeName.toLowerCase();
    if (attrLower.includes('throughput') || attrLower.includes('couverture') || attrLower.includes('rsrp') || attrLower.includes('rxlev') || attrLower.includes('rscp') || attrLower.includes('sinr') || attrLower.includes('rsrq') || attrLower.includes('earfcn')) {
        type = 'numerical';
    }

    // EARFCN is usually categorical in practice (frequency band), but can be numerical logic. 
    // Let's treat EARFCN as Categorical unless it has a wide range, but user asked for analysis.
    // Usually EARFCN is better as categorical to see distinct carriers.
    if (attrLower.includes('earfcn')) {
        type = 'categorical';
    }

    const settings = {
        source,
        attribute: attributeName, // Store raw attribute name
        attributeName: attributeName, // Store for custom lookups
        isCustom,
        type,
        total: values.length,
        counts,
        uniqueValues: Array.from(uniqueValues).sort()
    };

    if (type === 'numerical') {
        // Use parseNumber to robustly parse values (handles commas)
        const numValues = values.map(v => parseNumber(v)).filter(v => v !== null);
        const min = Math.min(...numValues);
        const max = Math.max(...numValues);

        // Default Ranges Logic
        let ranges = [];
        console.log('Generating settings for attribute:', attributeName, 'Lower:', attrLower);

        if (attrLower.includes('throughput') || attrLower.includes('http download')) {
            ranges = [
                { min: -Infinity, max: 2000, color: '#ef4444', label: 'Poor (< 2000)' },
                { min: 2000, max: 5000, color: '#eab308', label: 'Fair (2000-5000)' },
                { min: 5000, max: Infinity, color: '#22c55e', label: 'Excellent (> 5000)' }
            ];
        } else if (attrLower.includes('couverture') || attrLower.includes('rsrp')) {
            ranges = [
                { min: -Infinity, max: -110, color: '#ef4444', label: 'Poor (<= -110)' },
                { min: -110, max: -100, color: '#eab308', label: 'Fair (-110 to -100)' },
                { min: -100, max: Infinity, color: '#22c55e', label: 'Excellent (> -100)' }
            ];
        } else if (attrLower.includes('rxlev')) {
            ranges = [
                { min: -Infinity, max: -95, color: '#ef4444', label: 'Poor (<= -95)' },
                { min: -95, max: -85, color: '#eab308', label: 'Fair (-95 to -85)' },
                { min: -85, max: Infinity, color: '#22c55e', label: 'Excellent (> -85)' }
            ];
        } else if (attrLower.includes('rscp')) {
            ranges = [
                { min: -Infinity, max: -100, color: '#ef4444', label: 'Poor (<= -100)' },
                { min: -100, max: -90, color: '#eab308', label: 'Fair (-100 to -90)' },
                { min: -90, max: Infinity, color: '#22c55e', label: 'Excellent (> -90)' }
            ];
        } else if (attrLower.includes('sinr')) {
            ranges = [
                { min: -Infinity, max: 0, color: '#ef4444', label: 'Poor (< 0 dB)' },
                { min: 0, max: 15, color: '#eab308', label: 'Fair (0-15 dB)' },
                { min: 15, max: Infinity, color: '#22c55e', label: 'Excellent (> 15 dB)' }
            ];
        } else if (attrLower.includes('rsrq')) {
            ranges = [
                { min: -Infinity, max: -15, color: '#ef4444', label: 'Poor (< -15 dB)' },
                { min: -15, max: -10, color: '#eab308', label: 'Fair (-15 to -10 dB)' },
                { min: -10, max: Infinity, color: '#22c55e', label: 'Excellent (> -10 dB)' }
            ];
        }
        else {
            // Generic 5-bucket equal interval
            const step = (max - min) / 5;
            const colors = ['#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#b91c1c']; // Red ramp
            for (let i = 0; i < 5; i++) {
                ranges.push({
                    min: min + (i * step),
                    max: min + ((i + 1) * step),
                    color: colors[i],
                    label: `${Math.round(min + (i * step))} - ${Math.round(min + ((i + 1) * step))}`
                });
            }
        }

        // Calculate counts for each range
        numValues.forEach(val => {
            const range = ranges.find(r => val >= r.min && val <= r.max);
            if (range) {
                range.count = (range.count || 0) + 1;
            }
        });

        settings.ranges = ranges;
    } else {
        // Categorical Mapping
        const mapping = {};
        const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];
        settings.uniqueValues.forEach((val, index) => {
            mapping[val] = palette[index % palette.length];
        });
        settings.mapping = mapping;
    }

    return settings;
}

function clearThematicAnalysis() {
    activeThematicSettings = { sites: null, kml: null };
    document.getElementById('siteAttribute').value = 'n_a';
    document.getElementById('kmlAttribute').value = 'n_a';
    document.getElementById('thematicLegend').style.display = 'none';

    if (mapLegendControl) {
        map.removeControl(mapLegendControl);
        mapLegendControl = null;
    }

    renderVisibleSectors();
    updateMapMarkers({ fitBounds: false }); // Reset KML points too
    renderKmlList(); // Reset list colors
    showNotification('Thematic analysis cleared', 'info');
}

async function searchAddress(query) {
    if (!query || query.trim() === '') {
        showNotification('Please enter an address', 'warning');
        return;
    }

    try {
        showNotification('Searching...', 'info');
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data && data.length > 0) {
            const result = data[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);

            // Zoom to location
            map.setView([lat, lon], 16); // Increased zoom level for better visibility

            // Remove existing search marker if any
            if (window.searchMarker) {
                map.removeLayer(window.searchMarker);
            }

            // Add new marker
            window.searchMarker = L.marker([lat, lon])
                .addTo(map)
                .bindPopup(`<div style="max-width: 200px;"><b>Location Found</b><br>${result.display_name}</div>`)
                .openPopup();

            showNotification('Location found', 'success');

            // Clear suggestions and input
            document.getElementById('searchSuggestions').style.display = 'none';
        } else {
            showNotification('Address not found', 'error');
        }
    } catch (error) {
        console.error('Search error:', error);
        showNotification('Error searching address', 'error');
    }
}

// Autocomplete Logic
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function fetchSuggestions(query) {
    if (query.length < 3) {
        document.getElementById('searchSuggestions').style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`);
        const data = await response.json();
        renderSuggestions(data);
    } catch (error) {
        console.error('Error fetching suggestions:', error);
    }
}

function renderSuggestions(results) {
    const suggestionsContainer = document.getElementById('searchSuggestions');
    suggestionsContainer.innerHTML = '';

    if (results.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = result.display_name;
        div.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent document click from closing immediately
            document.getElementById('addressSearch').value = result.display_name;
            suggestionsContainer.style.display = 'none';
            searchAddress(result.display_name);
        });
        suggestionsContainer.appendChild(div);
    });

    suggestionsContainer.style.display = 'block';
}

let mapLegendControl = null;

function renderMapLegend() {
    if (mapLegendControl) {
        map.removeControl(mapLegendControl);
        mapLegendControl = null;
    }

    if (!activeThematicSettings.sites && !activeThematicSettings.kml) return;

    mapLegendControl = L.control({ position: 'topright' });

    mapLegendControl.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'info legend');

        // Dark Transparent Compact Style
        div.style.background = 'rgba(0, 0, 0, 0.5)';
        div.style.padding = '10px';
        div.style.borderRadius = '12px';
        div.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        div.style.backdropFilter = 'blur(4px)';
        div.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
        div.style.minWidth = '200px';
        div.style.color = '#f3f4f6';
        div.style.transition = 'all 0.3s ease';
        div.style.maxHeight = '80vh';
        div.style.overflowY = 'auto';

        const renderSection = (settings, titlePrefix) => {
            const title = settings.attribute.replace(/^custom:/, '');
            let html = `
                <div style="margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                    <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: #fff; letter-spacing: -0.01em; text-transform: capitalize;">
                        ${titlePrefix}: ${title}
                    </h4>
                </div>
            `;

            html += `
                <div style="display: flex; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 8px; font-weight: 600;">
                    <span style="flex: 1;">Range / Name</span>
                    <span style="margin-left: auto;">Count</span>
                </div>
            `;

            const renderItem = (label, color, count, total) => {
                const pct = ((count / total) * 100).toFixed(1);
                return `
                <div style="display: flex; align-items: center; margin-bottom: 6px; font-size: 11px; padding: 2px 0; border-radius: 4px;">
                    <div style="width: 12px; height: 12px; background: ${color}; border-radius: 3px; margin-right: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); flex-shrink: 0;"></div>
                    <span style="flex: 1; font-weight: 500; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 8px;" title="${label}">${label}</span>
                    <div style="margin-left: auto; text-align: right; line-height: 1.2;">
                        <div style="font-weight: 600; color: #f9fafb;">${count}</div>
                        <div style="font-size: 11px; font-weight: 500; color: #d1d5db;">${pct}%</div>
                    </div>
                </div>`;
            };

            if (settings.type === 'categorical') {
                settings.uniqueValues.forEach(val => {
                    const color = settings.mapping[val];
                    const count = settings.counts[val] || 0;
                    const label = settings.labels?.[val] || val;
                    html += renderItem(label, color, count, settings.total);
                });
            } else {
                settings.ranges.forEach(range => {
                    html += renderItem(range.label, range.color, range.count || 0, settings.total); // count might be missing if not recalculated
                });
            }
            return html;
        };

        if (activeThematicSettings.sites) {
            div.innerHTML += renderSection(activeThematicSettings.sites, 'Sites');
        }

        if (activeThematicSettings.sites && activeThematicSettings.kml) {
            div.innerHTML += '<div style="height: 15px;"></div>'; // Spacer
        }

        if (activeThematicSettings.kml) {
            div.innerHTML += renderSection(activeThematicSettings.kml, 'KML');
        }

        return div;
    };

    mapLegendControl.addTo(map);
}

function renderThematicLegend() {
    const container = document.getElementById('thematicLegend');
    const content = document.getElementById('legendContent');

    if (!activeThematicSettings.sites && !activeThematicSettings.kml) {
        container.classList.add('d-none');
        return;
    }

    container.classList.remove('d-none');
    content.innerHTML = '';

    if (activeThematicSettings.sites) {
        renderLegendControls(activeThematicSettings.sites, content, 'Site Sectors');
    }

    if (activeThematicSettings.sites && activeThematicSettings.kml) {
        const hr = document.createElement('hr');
        hr.style.margin = '15px 0';
        hr.style.borderColor = '#eee';
        content.appendChild(hr);
    }

    if (activeThematicSettings.kml) {
        renderLegendControls(activeThematicSettings.kml, content, 'KML Points');
    }
}

function renderLegendControls(settings, container, title) {
    const header = document.createElement('h5');
    header.textContent = `${title}: ${settings.attribute}`;
    header.style.marginBottom = '10px';
    header.style.color = '#333';
    container.appendChild(header);

    if (settings.type === 'categorical') {
        // Initialize labels map if not exists
        if (!settings.labels) settings.labels = {};

        settings.uniqueValues.forEach(val => {
            const color = settings.mapping[val];
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.marginBottom = '5px';
            item.style.gap = '10px';

            // Color Input
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = color;
            colorInput.style.width = '30px';
            colorInput.style.height = '30px';
            colorInput.style.padding = '0';
            colorInput.style.border = 'none';
            colorInput.style.cursor = 'pointer';

            colorInput.addEventListener('input', (e) => {
                settings.mapping[val] = e.target.value;
                renderMapLegend();
                if (settings.source === 'sites') renderVisibleSectors();
                else {
                    updateMapMarkers({ fitBounds: false });
                    renderKmlList();
                }
            });

            item.appendChild(colorInput);

            // Value Label (Read-only)
            const valueLabel = document.createElement('span');
            valueLabel.textContent = val;
            valueLabel.style.fontSize = '0.9em';
            valueLabel.style.color = '#333';
            valueLabel.style.marginRight = '5px';
            valueLabel.style.flex = '1';
            item.appendChild(valueLabel);

            // Custom Name Input
            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.value = settings.labels[val] || '';
            labelInput.placeholder = 'Custom Name';
            labelInput.className = 'form-control';
            labelInput.style.padding = '2px 5px';
            labelInput.style.fontSize = '0.9em';
            labelInput.style.width = '100px';

            labelInput.addEventListener('input', (e) => {
                settings.labels[val] = e.target.value;
                renderMapLegend();
            });

            item.appendChild(labelInput);
            container.appendChild(item);
        });
    } else {
        settings.ranges.forEach((range, index) => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.marginBottom = '5px';
            item.style.gap = '5px';

            // Color Input
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = range.color;
            colorInput.style.width = '30px';
            colorInput.style.height = '30px';
            colorInput.style.padding = '0';
            colorInput.style.border = 'none';
            colorInput.style.cursor = 'pointer';

            colorInput.addEventListener('input', (e) => {
                range.color = e.target.value;
                renderMapLegend();
                if (settings.source === 'sites') renderVisibleSectors();
                else {
                    updateMapMarkers({ fitBounds: false });
                    renderKmlList();
                }
            });

            item.appendChild(colorInput);

            // Min Input
            const minInput = document.createElement('input');
            minInput.type = 'number';
            minInput.value = Math.round(range.min);
            minInput.style.width = '50px';
            minInput.className = 'form-control';
            minInput.style.padding = '2px 5px';

            minInput.addEventListener('change', (e) => {
                range.min = parseFloat(e.target.value);
                // Only update label if it hasn't been customized
                if (!range.customLabel) {
                    range.label = `${Math.round(range.min)} - ${Math.round(range.max)}`;
                }
                renderMapLegend();
                if (settings.source === 'sites') renderVisibleSectors();
                else {
                    updateMapMarkers({ fitBounds: false });
                    renderKmlList();
                }
            });

            item.appendChild(minInput);
            item.appendChild(document.createTextNode(' - '));

            // Max Input
            const maxInput = document.createElement('input');
            maxInput.type = 'number';
            maxInput.value = Math.round(range.max);
            maxInput.style.width = '50px';
            maxInput.className = 'form-control';
            maxInput.style.padding = '2px 5px';

            maxInput.addEventListener('change', (e) => {
                range.max = parseFloat(e.target.value);
                if (!range.customLabel) {
                    range.label = `${Math.round(range.min)} - ${Math.round(range.max)}`;
                }
                renderMapLegend();
                if (settings.source === 'sites') renderVisibleSectors();
                else {
                    updateMapMarkers({ fitBounds: false });
                    renderKmlList();
                }
            });

            item.appendChild(maxInput);

            // Custom Name Input
            const labelInput = document.createElement('input');
            labelInput.type = 'text';
            labelInput.value = range.customLabel || '';
            labelInput.placeholder = 'Name';
            labelInput.className = 'form-control';
            labelInput.style.width = '80px';
            labelInput.style.padding = '2px 5px';

            labelInput.addEventListener('input', (e) => {
                range.customLabel = e.target.value;
                range.label = range.customLabel || `${Math.round(range.min)} - ${Math.round(range.max)}`;
                renderMapLegend();
            });

            item.appendChild(labelInput);

            // Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.className = 'btn btn-sm btn-secondary';
            deleteBtn.style.padding = '0 6px';
            deleteBtn.style.marginLeft = 'auto';
            deleteBtn.style.color = 'var(--error)';
            deleteBtn.title = 'Delete Range';

            deleteBtn.addEventListener('click', () => {
                deleteThematicRange(settings, index);
            });

            item.appendChild(deleteBtn);
            container.appendChild(item);
        });

        // Add Range Button
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm btn-secondary';
        addBtn.style.width = '100%';
        addBtn.style.marginTop = '10px';
        addBtn.innerHTML = '+ Add Range';
        addBtn.addEventListener('click', () => addThematicRange(settings));
        container.appendChild(addBtn);
    }
}

function addThematicRange(settings) {
    if (!settings || settings.type !== 'numerical') return;

    const ranges = settings.ranges;
    let newMin = 0;
    let newMax = 100;

    if (ranges.length > 0) {
        const lastRange = ranges[ranges.length - 1];
        newMin = lastRange.max;
        newMax = newMin + (lastRange.max - lastRange.min);
    }

    const newRange = {
        min: newMin,
        max: newMax,
        color: '#cccccc', // Default gray
        label: `${Math.round(newMin)} - ${Math.round(newMax)}`
    };

    ranges.push(newRange);
    renderThematicLegend();

    if (settings.source === 'sites') renderVisibleSectors();
    else {
        updateMapMarkers({ fitBounds: false });
        renderKmlList();
    }
}

function deleteThematicRange(settings, index) {
    if (!settings || settings.type !== 'numerical') return;

    settings.ranges.splice(index, 1);
    renderThematicLegend();

    if (settings.source === 'sites') renderVisibleSectors();
    else {
        updateMapMarkers({ fitBounds: false });
        renderKmlList();
    }
}

function generatePalette(count) {
    // Simple HSL generator
    const colors = [];
    const step = 360 / count;
    for (let i = 0; i < count; i++) {
        colors.push(`hsl(${i * step}, 70%, 50%)`);
    }
    return colors;
}

// ==================== ALARM DATA INTEGRATION ====================

function handleAlarmImport(event) {
    console.log('handleAlarmImport triggered');
    const file = event.target.files[0];
    if (!file) {
        console.warn('No file selected');
        return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Assume first sheet contains the data
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convert to JSON
            const jsonResults = XLSX.utils.sheet_to_json(worksheet);

            if (jsonResults.length === 0) {
                showNotification('No data found in the Excel file.', 'warning');
                return;
            }

            alarmsData = jsonResults;
            console.log('Imported Alarms:', alarmsData);

            showNotification(`Successfully imported ${alarmsData.length} alarm records.`, 'success');

            // Re-render map to update click handlers (optional, but good if markers are recreated)
            // Actually, markers are already created. We modified the click handler in updateMapMarkers.
            // But existing markers won't have the updated click logic unless we re-render.
            // Wait, I modified the code to ALWAYS check alarmsData. So if alarmsData is populated, it should work.
            // BUT, I need to make sure updateMapMarkers was actually updated in the previous step. Yes it was.

        } catch (error) {
            console.error('Error parsing Excel file:', error);
            showNotification('Error parsing Excel file: ' + error.message, 'error');
        }

        // Reset input
        event.target.value = '';
    };

    reader.readAsArrayBuffer(file);
}

function getAlarmsForSite(siteName) {
    if (!alarmsData || alarmsData.length === 0) return [];

    // Normalize site name for comparison (trim, lowercase?)
    // Let's try exact match first, then case-insensitive
    const target = siteName.toString().trim().toLowerCase();

    return alarmsData.filter(row => {
        // Try to find a column that looks like 'Site' or 'Site Name'
        // We'll search all keys of the first row to determine the column name?
        // Or just search all values in the row?
        // Let's assume common column names.

        const keys = Object.keys(row);
        let nameInRow = '';

        // Priority keys
        const nameKeys = ['Site', 'Site Name', 'SITE', 'Site_Name', 'Sitename', 'Node', 'NodeName'];

        for (const key of keys) {
            if (nameKeys.includes(key)) {
                nameInRow = row[key];
                break;
            }
        }

        // Fallback: Check if any value matches exactly
        if (!nameInRow) {
            return Object.values(row).some(val =>
                val && val.toString().trim().toLowerCase() === target
            );
        }

        return nameInRow && nameInRow.toString().trim().toLowerCase() === target;
    });
}

function showAlarmsModal(siteName, alarms) {
    const modal = document.getElementById('alarmsModal');
    const title = document.getElementById('alarmsModalTitle');
    const container = document.getElementById('alarmsTableContainer');

    title.textContent = `Alarms for ${siteName} (${alarms.length})`;

    if (alarms.length === 0) {
        container.innerHTML = '<p>No alarms found.</p>';
        modal.style.display = 'block';
        return;
    }

    // Create Table
    const headers = Object.keys(alarms[0]);

    let tableHtml = '<table class="data-table" style="width: 100%; border-collapse: collapse; margin-top: 10px;">';

    // Header
    tableHtml += '<thead><tr>';
    headers.forEach(h => {
        tableHtml += `<th style="text-align: left; padding: 12px; border-bottom: 2px solid var(--primary-600); background-color: rgba(0, 0, 0, 0.3); color: var(--text-primary); font-weight: 600;">${h}</th>`;
    });
    tableHtml += '</tr></thead>';

    // Body
    tableHtml += '<tbody>';
    alarms.forEach(row => {
        tableHtml += '<tr>';
        headers.forEach(h => {
            let val = row[h] !== undefined ? row[h] : '';
            tableHtml += `<td style="padding: 8px; border-bottom: 1px solid #eee;">${val}</td>`;
        });
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';

    container.innerHTML = tableHtml;
    modal.style.display = 'block';
}
