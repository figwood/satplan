// API Base URL
const API_BASE = '/api/v1';

// Data storage
let treeData = null;
let map = null;
let drawInteraction = null;
let vectorSource = null;
let vectorLayer = null;
let isDrawing = false;
let planningDays = 3;
let planningArea = null;

// Satpath WebAssembly module
let satpathModule = null;

// Initialize satpath WASM module
async function initSatpath() {
    try {
        console.log('Initializing satpath WebAssembly module...');
        satpathModule = await createModule();
        console.log('Satpath module initialized successfully');
    } catch (error) {
        console.error('Failed to initialize satpath module:', error);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initSatpath();
    initMap();
    loadTreeData();
    initControls();
});

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

    // Check if local tiles exist by testing a sample tile
    let baseMapSource;
    const testImage = new Image();
    testImage.onload = function() {
        // Local tiles exist, switch to them
        const localSource = new ol.source.XYZ({
            url: 'tiles/{z}/{x}/{-y}.png',
            minZoom: 1,
            maxZoom: 4,
            attributions: 'Local Tiles'
        });
        map.getLayers().getArray()[0].setSource(localSource);
    };
    testImage.onerror = function() {
        // Local tiles don't exist, keep using OSM (already set as default)
    };
    testImage.src = 'tiles/1/0/0.png';

    // Default to OSM, will be replaced if local tiles are found
    baseMapSource = new ol.source.OSM();

    map = new ol.Map({
        target: 'map',
        controls: ol.control.defaults.defaults({
            zoom: false,  // Disable default zoom control
            attribution: true,
            rotate: true
        }),
        layers: [
            new ol.layer.Tile({
                source: baseMapSource
            }),
            vectorLayer
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([0, 0]),
            zoom: 2
        })
    });

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
}

// Initialize controls
function initControls() {
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
}

// Toggle draw mode
function toggleDrawMode() {
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
    const treeEl = document.getElementById('tree');
    
    loadingEl.style.display = 'block';
    
    try {
        const response = await fetch(`${API_BASE}/sat/tree`);
        const data = await response.json();
        
        loadingEl.style.display = 'none';
        
        if (data.success && data.data) {
            treeData = data.data;
            renderTree();
        } else {
            treeEl.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">Failed to load data</p>';
        }
    } catch (error) {
        loadingEl.style.display = 'none';
        console.error('Error loading tree data:', error);
        treeEl.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">Error loading data</p>';
    }
}

// Render tree view
function renderTree() {
    const treeEl = document.getElementById('tree');
    
    if (!treeData) {
        treeEl.innerHTML = '<p class="loading">No data found</p>';
        return;
    }
    
    treeEl.innerHTML = renderTreeNode(treeData);
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
    const view = map.getView();
    view.animate({
        center: ol.proj.fromLonLat([0, 0]),
        zoom: 2,
        duration: 500
    });
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
        
        // Create VectorSensor and populate with checked sensors
        const vecSensors = new satpathModule.VectorSensor();
        checkedSensors.forEach(s => {
            const sideAngle = s.cur_side_angle ?? s.left_side_angle ?? 0.0;
            const observeAngle = s.observe_angle ?? 60.0;
            const sensor = new satpathModule.Sensor(
                s.sat_norad_id || '',
                s.id,
                s.sat_name || '',
                s.name,
                s.init_angle || 0.0,
                sideAngle,
                observeAngle
            );
            if (sensor.setHexColor) {
                sensor.setHexColor(s.hex_color || '#000000');
            }
            vecSensors.push_back(sensor);
        });
        
        // Time range: use current UTC date at 00:00:00 + planning days
        const now = new Date();
        const utcStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
        const utcEndDate = new Date(utcStartDate.getTime() + planningDays * 24 * 60 * 60 * 1000);
        const utcStartTime = Math.floor(utcStartDate.getTime() / 1000);
        const utcEndTime = Math.floor(utcEndDate.getTime() / 1000);
        
        // For each satellite with checked sensors, compute regions
        const satelliteGroups = groupSensorsBySatellite(checkedSensors);
        const allRegions = [];
        
        for (const [satId, satInfo] of Object.entries(satelliteGroups)) {
            if (!satInfo.tle1 || !satInfo.tle2) {
                continue;
            }
            
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
        const satNoradId = sensor.sat_noard_id;
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
}

// Hide results table
function hideResultsTable() {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.style.display = 'none';
    
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
