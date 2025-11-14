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

    map = new ol.Map({
        target: 'map',
        controls: ol.control.defaults.defaults({
            zoom: false,  // Disable default zoom control
            attribution: true,
            rotate: true
        }),
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM()
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
        document.getElementById('coordinateLabel').textContent = `${lon}, ${lat}`;
    });
}

// Initialize controls
function initControls() {
    // Planning days select
    const planningDaysSelect = document.getElementById('planningDays');
    planningDaysSelect.addEventListener('change', function(e) {
        planningDays = parseInt(e.target.value);
        console.log('Planning days changed to:', planningDays);
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

        // Clear previous drawings
        vectorSource.clear();

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
    
    // You can add more functionality here, like showing/hiding on the map
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
        console.log('Calling SensorInRegion with:', area);
        
        // Get checked sensors from the tree
        const checkedSensors = getCheckedSensors();
        if (checkedSensors.length === 0) {
            console.warn('No sensors selected. Please check sensors in the tree.');
            return;
        }
        
        console.log('Checked sensors:', checkedSensors);
        
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
        
        // Time range: use current time + planning days
        const now = Date.now();
        const utcStartTime = Math.floor(now / 1000);
        const utcEndTime = Math.floor((now + planningDays * 24 * 60 * 60 * 1000) / 1000);
        
        // For each satellite with checked sensors, compute regions
        const satelliteGroups = groupSensorsBySatellite(checkedSensors);
        const allRegions = [];
        
        for (const [satId, satInfo] of Object.entries(satelliteGroups)) {
            if (!satInfo.tle1 || !satInfo.tle2) {
                console.warn(`Skipping satellite ${satId}: missing TLE data`);
                continue;
            }
            
            console.log(`Computing regions for satellite: ${satInfo.name}`);
            
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
                console.log(`Found ${n} regions for satellite ${satInfo.name}`);
                
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
        
        console.log('Total regions found:', allRegions.length);
        console.log('Regions:', allRegions);
        
        // Display regions on map
        displayRegionsOnMap(allRegions);
        
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
