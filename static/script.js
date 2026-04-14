const TLE_CACHE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

const EMBEDDED_TREE_DATA = {
    id: 0,
    type: 'root',
    name: 'Satellites',
    children: [
        {
            id: 1,
            type: 'satellite',
            name: 'HJ-1A',
            hex_color: '#2563eb',
            sat_norad_id: '33321',
            tle1: '1 33321U 08041B   26039.21169248  .00002209  00000+0  27521-3 0  9990',
            tle2: '2 33321  97.6452  33.6805 0034993 246.1151 113.6395 14.83026247939297',
            children: [
                {
                    id: 101,
                    type: 'sensor',
                    name: 'CCD1',
                    hex_color: '#f97316',
                    sat_norad_id: '33321',
                    sat_name: 'HJ-1A',
                    resolution: 30.0,
                    init_angle: -14.5,
                    left_side_angle: 0.0,
                    cur_side_angle: 0.0,
                    observe_angle: 30.0
                },
                {
                    id: 102,
                    type: 'sensor',
                    name: 'CCD2',
                    hex_color: '#10b981',
                    sat_norad_id: '33321',
                    sat_name: 'HJ-1A',
                    resolution: 30.0,
                    init_angle: 14.5,
                    left_side_angle: 0.0,
                    cur_side_angle: 0.0,
                    observe_angle: 30.0
                },
                {
                    id: 103,
                    type: 'sensor',
                    name: 'HSI',
                    hex_color: '#1fee81',
                    sat_norad_id: '33321',
                    sat_name: 'HJ-1A',
                    resolution: 10.0,
                    init_angle: 0.0,
                    left_side_angle: 30.0,
                    cur_side_angle: 0.0,
                    observe_angle: 4.5
                }
            ]
        },
        {
            id: 2,
            type: 'satellite',
            name: 'HJ-1B',
            hex_color: '#0ea5e9',
            sat_norad_id: '33320',
            tle1: '1 33320U 08041A   26039.16302942  .00001368  00000+0  17158-3 0  9993',
            tle2: '2 33320  97.6601  30.0900 0018300 198.0175 162.0394 14.83620033939272',
            children: [
                {
                    id: 201,
                    type: 'sensor',
                    name: 'CCD1',
                    hex_color: '#c026d3',
                    sat_norad_id: '33320',
                    sat_name: 'HJ-1B',
                    resolution: 30,
                    init_angle: -14.5,
                    left_side_angle: 0.0,
                    cur_side_angle: 0.0,
                    observe_angle: 30.0
                },
                {
                    id: 202,
                    type: 'sensor',
                    name: 'CCD2',
                    hex_color: '#fbbf24',
                    sat_norad_id: '33320',
                    sat_name: 'HJ-1B',
                    resolution: 30.0,
                    init_angle: 14.5,
                    left_side_angle: 0.0,
                    cur_side_angle: 0.0,
                    observe_angle: 30.0
                },
                {
                    id: 203,
                    type: 'sensor',
                    name: 'IRS',
                    hex_color: '#a4ff2e',
                    sat_norad_id: '33320',
                    sat_name: 'HJ-1B',
                    resolution: 30.0,
                    init_angle: 0.0,
                    left_side_angle: 0.0,
                    cur_side_angle: 0.0,
                    observe_angle: 60.0
                }
            ]
        }
    ]
};

// Data storage
let treeData = null;
let map = null;
let baseMapLayer = null;
let drawInteraction = null;
let vectorSource = null;
let vectorLayer = null;
let solarOverlaySource = null;
let solarOverlayLayer = null;
let solarRefreshTimer = null;
let solarOverlayReferenceTimeMs = null;
let isDrawing = false;
let planningDays = 3;
let planningArea = null;
let availableBaseMaps = ['osm', 'google', 'googleSatellite', 'bing', 'bingSatellite'];
let activeBaseMapKey = 'osm';

const BASE_MAP_DEFINITIONS = {
    osm: {
        label: 'OpenStreetMap',
        createSource: () => new ol.source.OSM()
    },
    google: {
        label: 'Google Road',
        createSource: () => new ol.source.XYZ({
            url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            maxZoom: 20,
            crossOrigin: 'anonymous',
            attributions: 'Google'
        })
    },
    googleSatellite: {
        label: 'Google Satellite',
        createSource: () => new ol.source.XYZ({
            url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
            maxZoom: 20,
            crossOrigin: 'anonymous',
            attributions: 'Google'
        })
    },
    bing: {
        label: 'Bing Road',
        createSource: () => createBingTileSource('r')
    },
    bingSatellite: {
        label: 'Bing Satellite',
        createSource: () => createBingTileSource('a')
    }
};

// Satpath WebAssembly module
let satpathModule = null;
let satpathReady = false;
let lastSuccessfulTLEUpdate = null;

// Initialize satpath WASM module
async function initSatpath() {
    try {
        console.log('Initializing satpath WebAssembly module...');
        satpathModule = await createModule();
        console.log('Satpath module initialized successfully');
        satpathReady = true;
        setDrawButtonState(true);
    } catch (error) {
        console.error('Failed to initialize satpath module:', error);
        setDrawButtonState(false);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initSatpath();
    initMap();
    loadTreeData();
    initControls();
    setDrawButtonState(false);
});

function scheduleMapResize() {
    if (!map) {
        return;
    }

    window.requestAnimationFrame(() => {
        map.updateSize();
    });
}

function getFullMapExtent() {
    const projection = ol.proj.get('EPSG:3857');
    const projectionExtent = projection?.getExtent?.();
    if (projectionExtent) {
        return projectionExtent.slice();
    }

    return ol.proj.transformExtent([-180, -85, 180, 85], 'EPSG:4326', projection);
}

function getBaseLayerMinZoom() {
    if (!map) {
        return null;
    }

    const baseLayer = map.getLayers().item(0);
    const source = baseLayer?.getSource?.();
    const tileGrid = source?.getTileGrid?.();

    if (tileGrid && typeof tileGrid.getMinZoom === 'function') {
        return tileGrid.getMinZoom();
    }

    return null;
}

function createBingTileSource(imageryPrefix) {
    return new ol.source.XYZ({
        maxZoom: 19,
        crossOrigin: 'anonymous',
        attributions: 'Bing',
        tileUrlFunction: tileCoord => createBingTileUrl(tileCoord, imageryPrefix)
    });
}

function createBingTileUrl(tileCoord, imageryPrefix = 'r') {
    if (!tileCoord) {
        return undefined;
    }

    const z = tileCoord[0];
    const x = tileCoord[1];
    const y = tileCoord[2];
    const quadKey = tileXYToQuadKey(x, y, z);
    const subdomain = Math.abs((x + y) % 4);

    return `https://ecn.t${subdomain}.tiles.virtualearth.net/tiles/${imageryPrefix}${quadKey}.jpeg?g=13239&mkt=en-US&n=z`;
}

function tileXYToQuadKey(x, y, z) {
    let quadKey = '';

    for (let index = z; index > 0; index -= 1) {
        let digit = 0;
        const mask = 1 << (index - 1);

        if ((x & mask) !== 0) {
            digit += 1;
        }

        if ((y & mask) !== 0) {
            digit += 2;
        }

        quadKey += digit.toString();
    }

    return quadKey;
}

function getBaseMapDefinition(baseMapKey) {
    return BASE_MAP_DEFINITIONS[baseMapKey] || BASE_MAP_DEFINITIONS.osm;
}

function syncBaseMapSelect() {
    const baseMapSelect = document.getElementById('baseMapSource');
    if (!baseMapSelect) {
        return;
    }

    const optionsMarkup = availableBaseMaps
        .map(baseMapKey => {
            const definition = getBaseMapDefinition(baseMapKey);
            const selected = baseMapKey === activeBaseMapKey ? ' selected' : '';
            return `<option value="${baseMapKey}"${selected}>${definition.label}</option>`;
        })
        .join('');

    baseMapSelect.innerHTML = optionsMarkup;
    baseMapSelect.value = activeBaseMapKey;
}

function setBaseMapSource(baseMapKey) {
    const resolvedKey = availableBaseMaps.includes(baseMapKey) ? baseMapKey : 'osm';
    const definition = getBaseMapDefinition(resolvedKey);

    activeBaseMapKey = resolvedKey;
    if (baseMapLayer) {
        baseMapLayer.setSource(definition.createSource());
    }

    syncBaseMapSelect();

    if (!map) {
        return;
    }

    const minZoom = getBaseLayerMinZoom();
    const view = map.getView();
    if (typeof minZoom === 'number' && view.getZoom() < minZoom) {
        view.setZoom(minZoom);
    }
}

function setDrawButtonState(enabled) {
    const drawAreaBtn = document.getElementById('drawAreaBtn');
    if (!drawAreaBtn) {
        return;
    }

    drawAreaBtn.disabled = !enabled;
    drawAreaBtn.classList.toggle('disabled', !enabled);
}

// Initialize OpenLayers map
function initMap() {
    // Create vector source and layer for drawing
    vectorSource = new ol.source.Vector();
    vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(59, 130, 246, 0.2)'
            }),
            stroke: new ol.style.Stroke({
                color: '#3B82F6',
                width: 2
            })
        })
    });

    solarOverlaySource = new ol.source.Vector({
        wrapX: true
    });
    solarOverlayLayer = new ol.layer.Vector({
        source: solarOverlaySource,
        style: getSolarFeatureStyle,
        updateWhileAnimating: true,
        updateWhileInteracting: true
    });
    solarOverlayLayer.setZIndex(5);
    vectorLayer.setZIndex(10);

    baseMapLayer = new ol.layer.Tile({
        source: getBaseMapDefinition(activeBaseMapKey).createSource()
    });

    map = new ol.Map({
        target: 'map',
        controls: ol.control.defaults.defaults({
            zoom: false,  // Disable default zoom control
            attribution: true,
            rotate: true
        }),
        layers: [
            baseMapLayer,
            solarOverlayLayer,
            vectorLayer
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([0, 0]),
            zoom: 2,
            multiWorld: true
        })
    });

    syncBaseMapSelect();

    window.addEventListener('resize', scheduleMapResize);

    // Add mouse move listener to update coordinates
    map.on('pointermove', function(evt) {
        const coordinate = ol.proj.toLonLat(evt.coordinate);
        const lon = coordinate[0].toFixed(3);
        const lat = coordinate[1].toFixed(3);
        const coordText = `${lon}, ${lat}`;
        
        // Update map coordinate label (always visible on map)
        const mapLabel = document.getElementById('mapCoordinateLabel');
        if (mapLabel) {
            mapLabel.textContent = coordText;
        }
        
        // Update table coordinate label (if results are showing)
        const tableLabel = document.getElementById('tableCoordinateLabel');
        if (tableLabel) {
            tableLabel.textContent = coordText;
        }
    });

    updateSolarOverlay();
    solarRefreshTimer = window.setInterval(updateSolarOverlay, 60000);
}

function getSolarFeatureStyle(feature) {
    const featureType = feature.get('featureType');

    if (featureType === 'night') {
        return new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(0, 0, 0, 0.24)'
            })
        });
    }

    if (featureType === 'terminator') {
        return new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: 'rgba(245, 158, 11, 0.95)',
                width: 2,
                lineDash: [8, 8]
            })
        });
    }

    if (featureType === 'sun') {
        return [
            new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 16,
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 196, 0, 0.3)'
                    })
                })
            }),
            new ol.style.Style({
                image: new ol.style.RegularShape({
                    points: 8,
                    radius: 12,
                    radius2: 6,
                    angle: Math.PI / 8,
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 149, 0, 0.98)'
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 248, 220, 1)',
                        width: 2
                    })
                })
            }),
            new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 7,
                    fill: new ol.style.Fill({
                        color: 'rgba(255, 244, 122, 1)'
                    }),
                    stroke: new ol.style.Stroke({
                        color: 'rgba(255, 255, 255, 1)',
                        width: 2
                    })
                })
            })
        ];
    }

    return null;
}

function resolveSolarOverlayTime(explicitTime) {
    if (explicitTime instanceof Date) {
        return new Date(explicitTime.getTime());
    }

    if (typeof explicitTime === 'number' && Number.isFinite(explicitTime)) {
        return new Date(explicitTime);
    }

    if (typeof solarOverlayReferenceTimeMs === 'number' && Number.isFinite(solarOverlayReferenceTimeMs)) {
        return new Date(solarOverlayReferenceTimeMs);
    }

    return new Date();
}

function setSolarOverlayReferenceTime(timestampMs) {
    if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) {
        return;
    }

    solarOverlayReferenceTimeMs = timestampMs;
    updateSolarOverlay();
}

function resetSolarOverlayToNow() {
    solarOverlayReferenceTimeMs = null;
    updateSolarOverlay();
}

function updateSolarOverlay(explicitTime) {
    if (!map || !solarOverlaySource) {
        return;
    }

    const now = resolveSolarOverlayTime(explicitTime);
    const sunPosition = calculateSunPosition(now);
    const terminatorPoints = getTerminatorPoints(sunPosition.lat, sunPosition.lng);
    const features = [];

    features.push(new ol.Feature({
        geometry: buildNightGeometry(terminatorPoints, sunPosition.lat),
        featureType: 'night'
    }));

    features.push(new ol.Feature({
        geometry: new ol.geom.LineString(
            terminatorPoints.map(([lat, lng]) => ol.proj.fromLonLat([lng, lat]))
        ),
        featureType: 'terminator'
    }));

    features.push(new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat([sunPosition.lng, sunPosition.lat])),
        featureType: 'sun'
    }));

    solarOverlaySource.clear(true);
    solarOverlaySource.addFeatures(features);
    updateSolarInfo(now, sunPosition);
}

function buildNightGeometry(terminatorPoints, sunLat) {
    const poleLat = sunLat > 0 ? -90 : 90;
    const points = sunLat > 0 ? terminatorPoints : [...terminatorPoints].reverse();
    const ring = points.map(([lat, lng]) => ol.proj.fromLonLat([lng, lat]));
    const lastPoint = points[points.length - 1];
    const firstPoint = points[0];

    ring.push(ol.proj.fromLonLat([lastPoint[1], poleLat]));
    ring.push(ol.proj.fromLonLat([firstPoint[1], poleLat]));
    ring.push(ring[0]);

    return new ol.geom.Polygon([ring]);
}

function updateSolarInfo(date, sunPosition) {
    const timeEl = document.getElementById('solarTime');
    const coordsEl = document.getElementById('solarCoords');

    if (timeEl) {
        timeEl.textContent = `UTC: ${date.toUTCString()}`;
    }

    if (coordsEl) {
        coordsEl.textContent = `Sun: ${formatSignedDegrees(sunPosition.lat, 'N', 'S')}, ${formatSignedDegrees(sunPosition.lng, 'E', 'W')}`;
    }
}

function formatSignedDegrees(value, positiveSuffix, negativeSuffix) {
    const suffix = value >= 0 ? positiveSuffix : negativeSuffix;
    return `${Math.abs(value).toFixed(2)}°${suffix}`;
}

function getJulianDay(date) {
    const a = Math.floor((14 - (date.getUTCMonth() + 1)) / 12);
    const year = date.getUTCFullYear() + 4800 - a;
    const month = date.getUTCMonth() + 1 + 12 * a - 3;

    const julianDayNumber = date.getUTCDate()
        + Math.floor((153 * month + 2) / 5)
        + 365 * year
        + Math.floor(year / 4)
        - Math.floor(year / 100)
        + Math.floor(year / 400)
        - 32045;

    return julianDayNumber
        + (date.getUTCHours() - 12) / 24
        + date.getUTCMinutes() / 1440
        + date.getUTCSeconds() / 86400;
}

function calculateSunPosition(date) {
    const julianDay = getJulianDay(date);
    const elapsedDays = julianDay - 2451545.0;
    const meanLongitude = (280.46 + 0.9856474 * elapsedDays) % 360;
    const meanAnomaly = ((357.528 + 0.9856003 * elapsedDays) % 360) * Math.PI / 180;
    const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * Math.PI / 180;
    const obliquity = (23.439 - 0.0000004 * elapsedDays) * Math.PI / 180;
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude)) * 180 / Math.PI;
    const rightAscension = Math.atan2(
        Math.cos(obliquity) * Math.sin(eclipticLongitude),
        Math.cos(eclipticLongitude)
    ) * 180 / Math.PI;
    const greenwichMeanSiderealTime = (18.697374558 + 24.06570982441908 * elapsedDays) % 24;

    let longitude = -(greenwichMeanSiderealTime * 15 - rightAscension);
    while (longitude > 180) {
        longitude -= 360;
    }
    while (longitude < -180) {
        longitude += 360;
    }

    return {
        lat: declination,
        lng: longitude
    };
}

function getTerminatorPoints(sunLat, sunLng, segments = 360) {
    const points = [];
    const sunLatRadians = sunLat * Math.PI / 180;
    const tangent = Math.tan(sunLatRadians);

    for (let index = 0; index <= segments; index += 1) {
        const lng = -180 + (index * 360 / segments);
        let deltaLng = lng - sunLng;

        while (deltaLng > 180) {
            deltaLng -= 360;
        }
        while (deltaLng < -180) {
            deltaLng += 360;
        }

        const lat = Math.atan(-Math.cos(deltaLng * Math.PI / 180) / tangent) * 180 / Math.PI;
        points.push([lat, lng]);
    }

    return points;
}

// Initialize controls
function initControls() {
    const baseMapSelect = document.getElementById('baseMapSource');
    syncBaseMapSelect();
    baseMapSelect.addEventListener('change', function(e) {
        setBaseMapSource(e.target.value);
    });

    // Planning days select
    const planningDaysSelect = document.getElementById('planningDays');
    planningDaysSelect.addEventListener('change', function(e) {
        planningDays = parseInt(e.target.value);
        console.log('Planning days changed to:', planningDays);
        
        // If planning area is defined and results are displayed, refresh the results
        if (planningArea && isResultsTableVisible()) {
            refreshResults();
        }
    });

    // Draw area button
    const drawAreaBtn = document.getElementById('drawAreaBtn');
    drawAreaBtn.addEventListener('click', toggleDrawMode);

    // Zoom controls
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const fullExtentBtn = document.getElementById('fullExtentBtn');

    zoomInBtn.addEventListener('click', zoomIn);
    zoomOutBtn.addEventListener('click', zoomOut);
    fullExtentBtn.addEventListener('click', zoomToFullExtent);

    // Clear button
    const clearBtn = document.getElementById('clearBtn');
    clearBtn.addEventListener('click', clearMap);

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    exportBtn.addEventListener('click', exportToPDF);

    // TLE refresh is now automatic during planning
}

async function refreshTLEData(options = {}) {
    const { notifyOnError = false, showStatus = false } = options;
    try {
        if (showStatus) {
            showTLEFeedback('Refreshing TLE data…', 'info');
        }
        const response = await fetch('/api/tle/refresh', {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({ source: 'celestrak' })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        const timestamp = typeof payload?.timestamp === 'number' ? payload.timestamp : null;

        const fetched = await fetchTreeFromD1();
        if (fetched && fetched.tree) {
            treeData = fetched.tree;
        }

        if (typeof fetched?.tleLastSync === 'number') {
            lastSuccessfulTLEUpdate = fetched.tleLastSync;
        } else if (timestamp) {
            lastSuccessfulTLEUpdate = timestamp;
        }

        const preserved = getCheckedSensorIds();
        renderTree(preserved);

        if (planningArea && isResultsTableVisible()) {
            refreshResults();
        }

        if (showStatus) {
            updateTLEStatusFromCache(lastSuccessfulTLEUpdate);
            showTLEFeedback('TLE data refreshed successfully', 'success');
        }
        return true;
    } catch (error) {
        console.error('Failed to refresh TLE data:', error);
        if (showStatus) {
            showTLEFeedback(`Failed to refresh TLE: ${error.message}`, 'error');
        }
        if (notifyOnError) {
            alert(`Failed to refresh TLE data: ${error.message}`);
        }
        return false;
    }
}

async function ensureTLEFreshForPlanning(planningStartMs) {
    const planTime = typeof planningStartMs === 'number' ? planningStartMs : Date.now();
    const lastSync = typeof lastSuccessfulTLEUpdate === 'number' ? lastSuccessfulTLEUpdate : null;

    if (!lastSync) {
        return await refreshTLEData({ notifyOnError: true, showStatus: false });
    }

    const isStaleForPlan = planTime - lastSync > TLE_CACHE_MAX_AGE_MS;
    if (isStaleForPlan) {
        return await refreshTLEData({ notifyOnError: true, showStatus: false });
    }

    return true;
}

// Toggle draw mode
function toggleDrawMode() {
    if (!satpathReady) {
        console.warn('Satpath module still loading; please wait before drawing.');
        return;
    }
    const drawAreaBtn = document.getElementById('drawAreaBtn');
    const btnIcon = document.getElementById('btnIcon');
    const btnText = document.getElementById('btnText');

    if (!isDrawing) {
        // Start drawing mode
        isDrawing = true;
        drawAreaBtn.classList.add('active');
        btnIcon.textContent = '✖️';
        btnText.textContent = 'Cancel Drawing';

        // Clear previous drawings and results
        vectorSource.clear();
        hideResultsTable();

        // Create DragBox interaction for rectangle drawing
        drawInteraction = new ol.interaction.DragBox({
            condition: ol.events.condition.always
        });

        // Handle box end (when user releases mouse)
        drawInteraction.on('boxend', function() {
            const extent = drawInteraction.getGeometry().getExtent();
            
            // Create a polygon feature from the extent
            const feature = new ol.Feature({
                geometry: new ol.geom.Polygon.fromExtent(extent)
            });
            
            // Clear and add the new feature
            vectorSource.clear();
            vectorSource.addFeature(feature);
            
            // Convert extent to lon/lat coordinates
            const bottomLeft = ol.proj.toLonLat([extent[0], extent[1]]);
            const topRight = ol.proj.toLonLat([extent[2], extent[3]]);
            
            planningArea = {
                minLon: bottomLeft[0],
                minLat: bottomLeft[1],
                maxLon: topRight[0],
                maxLat: topRight[1]
            };

            console.log('Planning area defined:', planningArea);
            
            // Call SensorInRegion function with the drawn area
            callSensorInRegion(planningArea);
            
            // Exit drawing mode
            setTimeout(() => {
                toggleDrawMode();
            }, 100);
        });

        map.addInteraction(drawInteraction);
    } else {
        // Stop drawing mode
        isDrawing = false;
        drawAreaBtn.classList.remove('active');
        btnIcon.textContent = '📐';
        btnText.textContent = 'Draw Planning Area';

        if (drawInteraction) {
            map.removeInteraction(drawInteraction);
            drawInteraction = null;
        }
    }
}

// Load tree data
async function loadTreeData() {
    const loadingEl = document.getElementById('treeLoading');
    if (loadingEl) {
        loadingEl.style.display = 'block';
    }

    const fetchedTree = await fetchTreeFromD1();
    if (fetchedTree && fetchedTree.tree) {
        treeData = fetchedTree.tree;
        lastSuccessfulTLEUpdate = fetchedTree.tleLastSync ?? null;
    } else {
        treeData = cloneEmbeddedTree();
        lastSuccessfulTLEUpdate = null;
    }

    renderTree();

    if (loadingEl) {
        loadingEl.style.display = 'none';
    }

    updateTLEStatusFromCache(lastSuccessfulTLEUpdate);
}

function cloneEmbeddedTree() {
    return JSON.parse(JSON.stringify(EMBEDDED_TREE_DATA));
}

async function fetchTreeFromD1() {
    try {
        const response = await fetch('/api/satellites', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const payload = await response.json();
        if (payload && payload.tree && payload.tree.type === 'root') {
            return {
                tree: payload.tree,
                tleLastSync: typeof payload.tleLastSync === 'number' ? payload.tleLastSync : null
            };
        }

        console.warn('SatPlan: unexpected payload from D1 API');
    } catch (error) {
        console.error('SatPlan: failed to fetch tree data from D1', error);
    }

    return null;
}

function applyTLERecords(node, records) {
    if (!node || !records || records.length === 0) {
        return;
    }

    const recordMap = {};
    records.forEach(record => {
        if (record.noradId) {
            recordMap[record.noradId] = record;
        }
    });

    const walk = (current) => {
        if (current.type === 'satellite' && current.sat_norad_id) {
            const record = recordMap[current.sat_norad_id];
            if (record) {
                current.tle1 = record.line1;
                current.tle2 = record.line2;
            }
        }

        if (Array.isArray(current.children)) {
            current.children.forEach(child => walk(child));
        }
    };

    walk(node);
}

function updateTLEStatusFromCache(timestamp) {
    if (!timestamp) {
        showTLEFeedback('Embedded snapshot is in use. Refresh to fetch live TLEs.', 'info');
        updateLastSyncLabel(null);
        return;
    }

    const stale = isCacheStale(timestamp);
    const message = stale
        ? 'Stored TLE data is stale. Refresh when needed.'
        : 'Stored TLE data is loaded.';
    const severity = stale ? 'warning' : 'success';
    showTLEFeedback(message, severity);
    updateLastSyncLabel(timestamp);
}

function showTLEFeedback(message, severity = 'info') {
    const statusEl = document.getElementById('tleStatusMessage');
    if (!statusEl) {
        return;
    }

    statusEl.textContent = message;
    statusEl.classList.remove('info', 'success', 'error', 'warning');
    statusEl.classList.add(severity);
}

function updateLastSyncLabel(timestamp) {
    const label = document.getElementById('tleLastSync');
    if (!label) {
        return;
    }

    if (!timestamp) {
        label.textContent = 'Last sync: embedded snapshot';
        return;
    }

    label.textContent = `Last sync: ${formatDateTime(new Date(timestamp))} UTC`;
}

function isCacheStale(timestamp) {
    if (!timestamp) {
        return false;
    }

    return Date.now() - timestamp > TLE_CACHE_MAX_AGE_MS;
}

// Render tree view
function renderTree(checkedSensorIds = []) {
    const treeEl = document.getElementById('tree');
    
    if (!treeData) {
        treeEl.innerHTML = '<p class="loading">No data found</p>';
        return;
    }
    
    treeEl.innerHTML = renderTreeNode(treeData);

    if (checkedSensorIds && checkedSensorIds.length > 0) {
        restoreCheckedSensors(checkedSensorIds);
    }
}

function restoreCheckedSensors(sensorIds) {
    if (!sensorIds || sensorIds.length === 0) {
        return;
    }

    sensorIds.forEach(sensorId => {
        const checkbox = document.getElementById(`check-sensor-${sensorId}`);
        if (checkbox) {
            checkbox.checked = true;
            updateParentSatelliteState(sensorId);
        }
    });
}

// Render a tree node recursively
function renderTreeNode(node) {
    const hasChildren = node.children && node.children.length > 0;
    const icon = getNodeIcon(node.type);
    
    let html = '';
    
    if (node.type === 'root') {
        // Root node is always expanded, no checkbox
        html = `
            <div class="tree-node">
                <div class="tree-item root-item">
                    <span class="tree-toggle expanded" onclick="toggleNode(event, 'node-${node.id}')"></span>
                    <span class="tree-icon">${icon}</span>
                    <span class="tree-label"><strong>${node.name}</strong></span>
                </div>
                <div class="tree-children" id="children-node-${node.id}">
                    ${hasChildren ? node.children.map(child => renderTreeNode(child)).join('') : ''}
                </div>
            </div>
        `;
    } else if (node.type === 'satellite') {
        html = `
            <div class="tree-node">
                <div class="tree-item" onclick="selectNode(event, ${node.id}, '${node.type}')">
                    <input type="checkbox" class="tree-checkbox" onclick="handleCheckbox(event, ${node.id}, '${node.type}')" id="check-${node.type}-${node.id}">
                    <span class="tree-toggle ${hasChildren ? 'collapsed' : 'empty'}" onclick="toggleNode(event, 'node-${node.type}-${node.id}')"></span>
                    <span class="tree-icon">${icon}</span>
                    <span class="tree-label">${node.name}</span>
                </div>
                ${hasChildren ? `
                    <div class="tree-children collapsed" id="children-node-${node.type}-${node.id}">
                        ${node.children.map(child => renderTreeNode(child)).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        // Sensor node
        const colorBadge = node.hex_color ? `<span class="tree-color" style="background-color: ${node.hex_color}"></span>` : '';
        html = `
            <div class="tree-node">
                <div class="tree-item" onclick="selectNode(event, ${node.id}, '${node.type}')">
                    <input type="checkbox" class="tree-checkbox" onclick="handleCheckbox(event, ${node.id}, '${node.type}')" id="check-${node.type}-${node.id}">
                    <span class="tree-toggle empty"></span>
                    <span class="tree-icon">${icon}</span>
                    <span class="tree-label">${node.name}</span>
                    ${colorBadge}
                </div>
            </div>
        `;
    }
    
    return html;
}

// Get icon for node type
function getNodeIcon(type) {
    switch (type) {
        case 'root':
            return '📁';
        case 'satellite':
            return '🛰️';
        case 'sensor':
            return '📡';
        default:
            return '•';
    }
}

// Toggle tree node
function toggleNode(event, nodeId) {
    event.stopPropagation();
    
    const toggleEl = event.target;
    const childrenEl = document.getElementById(`children-${nodeId}`);
    
    if (!toggleEl || !childrenEl || toggleEl.classList.contains('empty')) {
        return;
    }
    
    if (childrenEl.classList.contains('collapsed')) {
        childrenEl.classList.remove('collapsed');
        toggleEl.classList.remove('collapsed');
        toggleEl.classList.add('expanded');
    } else {
        childrenEl.classList.add('collapsed');
        toggleEl.classList.remove('expanded');
        toggleEl.classList.add('collapsed');
    }
}

// Select node
function selectNode(event, nodeId, nodeType) {
    event.stopPropagation();
    
    // Remove previous selection
    document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selection to clicked item
    event.currentTarget.classList.add('selected');
    
    console.log(`Selected ${nodeType}:`, nodeId);
    // You can add more functionality here, like showing details on the map
}

// Handle checkbox changes
function handleCheckbox(event, nodeId, nodeType) {
    event.stopPropagation();
    
    const isChecked = event.target.checked;
    console.log(`${nodeType} ${nodeId} ${isChecked ? 'checked' : 'unchecked'}`);
    
    // If it's a satellite, check/uncheck all its sensors
    if (nodeType === 'satellite') {
        const childrenContainer = document.getElementById(`children-node-${nodeType}-${nodeId}`);
        if (childrenContainer) {
            const sensorCheckboxes = childrenContainer.querySelectorAll('.tree-checkbox');
            sensorCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
            });
        }
        // Remove half-checked state when manually checking/unchecking
        event.target.classList.remove('half-checked');
    }
    
    // If it's a sensor, update the parent satellite's state
    if (nodeType === 'sensor') {
        updateParentSatelliteState(nodeId);
    }
    
    // If a planning area is defined and results are displayed, refresh the results
    if (planningArea && isResultsTableVisible()) {
        refreshResults();
    }
}

// Update the parent satellite's checkbox state based on its sensors
function updateParentSatelliteState(sensorId) {
    // Find the satellite node that contains this sensor
    const sensorCheckbox = document.getElementById(`check-sensor-${sensorId}`);
    if (!sensorCheckbox) return;
    
    // Find the parent tree-children container
    const childrenContainer = sensorCheckbox.closest('.tree-children');
    if (!childrenContainer) return;
    
    // Get the satellite ID from the children container's ID
    const containerId = childrenContainer.id; // e.g., "children-node-satellite-1"
    const satelliteId = containerId.match(/children-node-satellite-(\d+)/)?.[1];
    if (!satelliteId) return;
    
    // Get the satellite checkbox
    const satelliteCheckbox = document.getElementById(`check-satellite-${satelliteId}`);
    if (!satelliteCheckbox) return;
    
    // Get all sensor checkboxes in this satellite
    const sensorCheckboxes = Array.from(childrenContainer.querySelectorAll('.tree-checkbox'));
    const checkedCount = sensorCheckboxes.filter(cb => cb.checked).length;
    const totalCount = sensorCheckboxes.length;
    
    // Update satellite checkbox state
    if (checkedCount === 0) {
        // No sensors checked
        satelliteCheckbox.checked = false;
        satelliteCheckbox.classList.remove('half-checked');
        satelliteCheckbox.indeterminate = false;
    } else if (checkedCount === totalCount) {
        // All sensors checked
        satelliteCheckbox.checked = true;
        satelliteCheckbox.classList.remove('half-checked');
        satelliteCheckbox.indeterminate = false;
    } else {
        // Some sensors checked (half-checked state)
        satelliteCheckbox.checked = false;
        satelliteCheckbox.classList.add('half-checked');
        satelliteCheckbox.indeterminate = true;
    }
}

// Zoom controls
function zoomIn() {
    const view = map.getView();
    const zoom = view.getZoom();
    view.animate({
        zoom: zoom + 1,
        duration: 250
    });
}

function zoomOut() {
    const view = map.getView();
    const zoom = view.getZoom();
    view.animate({
        zoom: zoom - 1,
        duration: 250
    });
}

function zoomToFullExtent() {
    if (!map) {
        return;
    }

    const view = map.getView();
    const fullExtent = getFullMapExtent();
    if (!fullExtent) {
        return;
    }

    map.updateSize();
    view.cancelAnimations();
    view.fit(fullExtent, {
        size: map.getSize(),
        padding: [16, 16, 16, 16],
        nearest: true,
        duration: 500
    });

    const minZoom = getBaseLayerMinZoom();
    if (typeof minZoom === 'number' && view.getZoom() < minZoom) {
        view.setZoom(minZoom);
    }
}

function clearMap() {
    // Clear all features from the vector source
    vectorSource.clear();
    
    // Reset planning area
    planningArea = null;
    
    // Hide results table
    hideResultsTable();
    
    console.log('Map cleared');
}

// Call SensorInRegion function from satpath WASM module
async function callSensorInRegion(area) {
    if (!satpathModule) {
        console.error('Satpath module not initialized yet');
        return;
    }
    
    if (!area) {
        console.error('No area defined');
        return;
    }
    
    try {
        // Get checked sensors from the tree
        const checkedSensors = getCheckedSensors();
        if (checkedSensors.length === 0) {
            // Clear regions from map
            const features = vectorSource.getFeatures();
            const planningAreaFeature = features.find(f => !f.get('regionData'));
            vectorSource.clear();
            if (planningAreaFeature) {
                vectorSource.addFeature(planningAreaFeature);
            }
            // Clear table content but keep it visible
            displayResultsTable([], []);
            return;
        }
        
        // Create Calculator instance
        const calc = new satpathModule.Calculator();
        
        // Create TargetArea with west, east, north, south
        const targetArea = new satpathModule.TargetArea(
            area.minLon, // west
            area.maxLon, // east
            area.maxLat, // north
            area.minLat  // south
        );
        
        // Time range: use current UTC date at 00:00:00 + planning days
        const now = new Date();
        const utcStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
        const utcEndDate = new Date(utcStartDate.getTime() + planningDays * 24 * 60 * 60 * 1000);
        const utcStartTime = Math.floor(utcStartDate.getTime() / 1000);
        const utcEndTime = Math.floor(utcEndDate.getTime() / 1000);

        await ensureTLEFreshForPlanning(utcStartDate.getTime());
        
        // For each satellite with checked sensors, compute regions
        const satelliteGroups = groupSensorsBySatellite(checkedSensors);
        const allRegions = [];
        
        for (const [satId, satInfo] of Object.entries(satelliteGroups)) {
            if (!satInfo.tle1 || !satInfo.tle2) {
                continue;
            }

            const vecSensors = new satpathModule.VectorSensor();
            satInfo.sensors.forEach(sensorInfo => {
                const sideAngle = sensorInfo.cur_side_angle ?? sensorInfo.left_side_angle ?? 0.0;
                const observeAngle = sensorInfo.observe_angle ?? 60.0;
                const sensor = new satpathModule.Sensor(
                    sensorInfo.sat_norad_id || '',
                    sensorInfo.id,
                    sensorInfo.sat_name || '',
                    sensorInfo.name,
                    sensorInfo.init_angle || 0.0,
                    sideAngle,
                    observeAngle
                );
                if (sensor.setHexColor) {
                    sensor.setHexColor(sensorInfo.hex_color || '#000000');
                }
                vecSensors.push_back(sensor);
            });
            
            const regions = calc.SensorInRegion(
                String(satId),
                String(satInfo.name),
                String(satInfo.tle1),
                String(satInfo.tle2),
                vecSensors,
                utcStartTime,
                utcEndTime,
                targetArea
            );
            
            // Extract region data
            if (regions && typeof regions.size === 'function') {
                const n = regions.size();
                
                for (let i = 0; i < n; i++) {
                    const region = regions.get(i);
                    if (!region || typeof region.getpGeometry !== 'function') continue;
                    
                    const geom = region.getpGeometry();
                    const coords = [];
                    if (geom && typeof geom.size === 'function') {
                        const m = geom.size();
                        for (let j = 0; j < m; j++) {
                            const pt = geom.get(j);
                            if (pt && typeof pt.getX === 'function' && typeof pt.getY === 'function') {
                                coords.push([pt.getX(), pt.getY()]);
                            }
                        }
                    }
                    
                    allRegions.push({
                        coordinates: coords,
                        startTimestamp: region.getStartTimestamp ? region.getStartTimestamp() : utcStartTime,
                        endTimestamp: region.getStopTimestamp ? region.getStopTimestamp() : utcEndTime,
                        color: region.getHexColor ? region.getHexColor() : '#ffcc33',
                        sensorId: region.getSenId ? region.getSenId() : '',
                        satId: String(satId),
                        satName: String(satInfo.name),
                    });
                }
            }
        }
        
        // Display regions on map
        displayRegionsOnMap(allRegions);
        
        // Display results in table
        displayResultsTable(allRegions, checkedSensors);
        
    } catch (error) {
        console.error('Error calling SensorInRegion:', error);
    }
}

// Get checked sensors from the tree
function getCheckedSensors() {
    const sensors = [];
    const sensorCheckboxes = document.querySelectorAll('input[id^="check-sensor-"]:checked');
    
    sensorCheckboxes.forEach(checkbox => {
        const sensorId = checkbox.id.replace('check-sensor-', '');
        // Find sensor data from treeData
        const sensorData = findSensorById(treeData, parseInt(sensorId));
        if (sensorData) {
            sensors.push(sensorData);
        }
    });
    
    return sensors;
}

function getCheckedSensorIds() {
    return getCheckedSensors().map(sensor => sensor.id);
}

// Find sensor by ID in tree data
function findSensorById(node, sensorId) {
    if (node.type === 'sensor' && node.id === sensorId) {
        return node;
    }
    
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            const found = findSensorById(child, sensorId);
            if (found) return found;
        }
    }
    
    return null;
}

// Find satellite node by norad_id
function findSatelliteByNoradId(node, noradId) {
    if (node.type === 'satellite' && node.sat_norad_id === noradId) {
        return node;
    }
    
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            const found = findSatelliteByNoradId(child, noradId);
            if (found) return found;
        }
    }
    
    return null;
}

// Group sensors by satellite and collect TLE data
function groupSensorsBySatellite(sensors) {
    const groups = {};
    
    sensors.forEach(sensor => {
        const satNoradId = sensor.sat_norad_id;
        if (!groups[satNoradId]) {
            // Find the satellite node to get TLE data
            const satNode = findSatelliteByNoradId(treeData, satNoradId);
            groups[satNoradId] = {
                name: sensor.sat_name || 'Unknown',
                tle1: satNode ? satNode.tle1 : '',
                tle2: satNode ? satNode.tle2 : '',
                sensors: []
            };
        }
        groups[satNoradId].sensors.push(sensor);
    });
    
    return groups;
}

// Display regions on map
function displayRegionsOnMap(regions) {
    if (!regions || regions.length === 0) {
        console.log('No regions to display');
        return;
    }
    
    regions.forEach(region => {
        if (!region.coordinates || region.coordinates.length === 0) return;
        
        // Create polygon from coordinates
        const polygon = new ol.geom.Polygon([region.coordinates.map(coord => 
            ol.proj.fromLonLat([coord[0], coord[1]])
        )]);
        
        const feature = new ol.Feature({
            geometry: polygon,
            regionData: region
        });
        
        // Style with region color
        const color = region.color || '#ffcc33';
        feature.setStyle(new ol.style.Style({
            fill: new ol.style.Fill({
                color: hexToRgba(color, 0.3)
            }),
            stroke: new ol.style.Stroke({
                color: color,
                width: 2
            })
        }));
        
        vectorSource.addFeature(feature);
    });
    
    console.log(`Displayed ${regions.length} regions on map`);
}

// Helper function to convert hex color to rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Helper function to format date to YYYY-MM-DD HH:mm:ss in UTC
function formatDateTime(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Display results in table
function displayResultsTable(regions, sensors) {
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsTableBody = document.getElementById('resultsTableBody');
    
    // Clear existing table rows
    resultsTableBody.innerHTML = '';
    
    if (!regions || regions.length === 0) {
        // Show empty table with headers only
        resultsContainer.style.display = 'flex';
        
        // Disable export button when no results
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.disabled = true;
        }
        
        // Show table coordinate label
        const mapCoordLabel = document.getElementById('mapCoordinateLabel');
        if (mapCoordLabel) {
            mapCoordLabel.style.display = 'none';
        }
        const tableCoordLabel = document.getElementById('tableCoordinateLabel');
        if (tableCoordLabel) {
            tableCoordLabel.style.display = 'block';
        }
        scheduleMapResize();
        return;
    }
    
    // Create a map of sensor ID to sensor data for quick lookup
    const sensorMap = {};
    sensors.forEach(sensor => {
        sensorMap[sensor.id] = sensor;
    });
    
    // Sort regions by start time
    const sortedRegions = [...regions].sort((a, b) => a.startTimestamp - b.startTimestamp);
    
    // Add rows for each region
    sortedRegions.forEach((region, index) => {
        const sensor = sensorMap[region.sensorId];
        const row = document.createElement('tr');
        
        // Format timestamps to YYYY-MM-DD HH:mm:ss
        const startTime = formatDateTime(new Date(region.startTimestamp * 1000));
        const stopTime = formatDateTime(new Date(region.endTimestamp * 1000));
        
        // Get sensor name and resolution
        const sensorName = sensor ? sensor.name : region.sensorId;
        const resolution = sensor ? (sensor.resolution || 'N/A') : 'N/A';
        
        row.innerHTML = `
            <td>${region.satName}</td>
            <td>${sensorName}</td>
            <td>${resolution}</td>
            <td>${startTime}</td>
            <td>${stopTime}</td>
        `;
        
        // Store region data on the row for later access
        row.dataset.regionIndex = index;
        
        // Add click handler
        row.addEventListener('click', function() {
            highlightRegion(region, row);
        });
        
        resultsTableBody.appendChild(row);
    });
    
    // Show the results container
    resultsContainer.style.display = 'flex';
    
    // Enable export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.disabled = false;
    }
    
    // Hide the map coordinate label and show table coordinate label
    const mapCoordLabel = document.getElementById('mapCoordinateLabel');
    if (mapCoordLabel) {
        mapCoordLabel.style.display = 'none';
    }
    const tableCoordLabel = document.getElementById('tableCoordinateLabel');
    if (tableCoordLabel) {
        tableCoordLabel.style.display = 'block';
    }

    scheduleMapResize();
}

// Hide results table
function hideResultsTable() {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.style.display = 'none';

    // When planning results are cleared/hidden, restore real-time solar overlay.
    resetSolarOverlayToNow();
    
    // Disable export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.disabled = true;
    }
    
    // Show the map coordinate label and hide table coordinate label
    const mapCoordLabel = document.getElementById('mapCoordinateLabel');
    if (mapCoordLabel) {
        mapCoordLabel.style.display = 'block';
    }
    const tableCoordLabel = document.getElementById('tableCoordinateLabel');
    if (tableCoordLabel) {
        tableCoordLabel.style.display = 'none';
    }

    scheduleMapResize();
}

// Check if results table is visible
function isResultsTableVisible() {
    const resultsContainer = document.getElementById('resultsContainer');
    return resultsContainer && resultsContainer.style.display !== 'none';
}

// Refresh results by re-running the sensor region calculation
function refreshResults() {
    if (!planningArea) {
        console.warn('No planning area defined, cannot refresh results');
        return;
    }
    
    console.log('Refreshing results...');
    
    // Clear existing regions from map (keep the planning area rectangle)
    const features = vectorSource.getFeatures();
    const planningAreaFeature = features.find(f => !f.get('regionData'));
    vectorSource.clear();
    if (planningAreaFeature) {
        vectorSource.addFeature(planningAreaFeature);
    }
    
    // Re-run the sensor region calculation
    callSensorInRegion(planningArea);
}

// Highlight a region on both table and map
function highlightRegion(region, clickedRow) {
    // Remove previous highlights from table rows
    const allRows = document.querySelectorAll('#resultsTableBody tr');
    allRows.forEach(row => row.classList.remove('highlighted'));
    
    // Highlight the clicked row
    clickedRow.classList.add('highlighted');
    
    // Reset all features to normal style
    vectorSource.getFeatures().forEach(feature => {
        const featureRegion = feature.get('regionData');
        if (featureRegion) {
            const color = featureRegion.color || '#ffcc33';
            feature.setStyle(new ol.style.Style({
                fill: new ol.style.Fill({
                    color: hexToRgba(color, 0.3)
                }),
                stroke: new ol.style.Stroke({
                    color: color,
                    width: 2
                })
            }));
        }
    });
    
    // Find and highlight the corresponding map feature
    vectorSource.getFeatures().forEach(feature => {
        const featureRegion = feature.get('regionData');
        if (featureRegion && 
            featureRegion.satId === region.satId && 
            featureRegion.sensorId === region.sensorId &&
            featureRegion.startTimestamp === region.startTimestamp) {
            
            const color = region.color || '#ffcc33';
            feature.setStyle(new ol.style.Style({
                fill: new ol.style.Fill({
                    color: hexToRgba(color, 0.7)
                }),
                stroke: new ol.style.Stroke({
                    color: '#FF0000',
                    width: 5
                })
            }));
        }
    });

    // Show terminator at this scan strip's start time.
    setSolarOverlayReferenceTime(region.startTimestamp * 1000);
}

// Export results to PDF
function exportToPDF() {
    const resultsTableBody = document.getElementById('resultsTableBody');
    
    // Check if there are any results
    if (!resultsTableBody || resultsTableBody.children.length === 0) {
        alert('No results to export. Please draw a planning area and run the analysis first.');
        return;
    }

    // Get jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Add title
    doc.setFontSize(18);
    doc.text('Satellite Planning Report', 14, 20);

    // Add generation date and UTC note
    doc.setFontSize(10);
    const generationDate = new Date();
    const dateStr = formatDateTime(generationDate);
    doc.text(`Generated: ${dateStr} UTC`, 14, 28);

    // Add planning area info if available
    if (planningArea) {
        doc.text(`Planning Area: [${planningArea.minLon.toFixed(3)}, ${planningArea.minLat.toFixed(3)}] to [${planningArea.maxLon.toFixed(3)}, ${planningArea.maxLat.toFixed(3)}]`, 14, 34);
    }
    
    // Add note about UTC
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Note: All times are in UTC (Coordinated Universal Time)', 14, planningArea ? 40 : 34);
    doc.setTextColor(0);

    // Prepare table data and calculate time range
    const tableData = [];
    const rows = resultsTableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 5) {
            tableData.push([
                cells[0].textContent, // Satellite
                cells[1].textContent, // Sensor
                cells[2].textContent, // Resolution
                cells[3].textContent, // Start Time
                cells[4].textContent  // Stop Time
            ]);
        }
    });

    // Calculate planning period from current UTC date at 00:00:00
    const now = new Date();
    const utcStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const utcEndDate = new Date(utcStartDate.getTime() + planningDays * 24 * 60 * 60 * 1000);
    const planningStart = formatDateTime(utcStartDate);
    const planningEnd = formatDateTime(utcEndDate);
    
    // Add time range info
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Planning Period: ${planningStart} to ${planningEnd}`, 14, planningArea ? 46 : 40);

    // Add table using autoTable plugin
    doc.autoTable({
        head: [['Satellite', 'Sensor', 'Resolution (m)', 'Start Time (UTC)', 'Stop Time (UTC)']],
        body: tableData,
        startY: planningArea ? 52 : 46,
        theme: 'grid',
        styles: {
            fontSize: 9,
            cellPadding: 3
        },
        headStyles: {
            fillColor: [59, 130, 246],
            textColor: 255,
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [245, 247, 250]
        }
    });

    // Add footer with page numbers
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 10, { align: 'center' });
    }

    // Generate filename with YYMMDD format
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const filename = `report_${year}${month}${day}.pdf`;

    // Save the PDF
    doc.save(filename);
}
