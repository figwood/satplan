// API Base URL
const API_BASE = '/api/v1';

// Data storage
let satellitesData = [];
let sensorsData = [];
let map = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    loadTreeData();
});

// Initialize OpenLayers map
function initMap() {
    map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM()
            })
        ],
        view: new ol.View({
            center: ol.proj.fromLonLat([0, 0]),
            zoom: 2
        })
    });
}

// Load tree data
async function loadTreeData() {
    const loadingEl = document.getElementById('treeLoading');
    const treeEl = document.getElementById('tree');
    
    loadingEl.style.display = 'block';
    
    try {
        // Load satellites and sensors
        const [satResponse, sensorResponse] = await Promise.all([
            fetch(`${API_BASE}/satellites`),
            fetch(`${API_BASE}/sensors`)
        ]);
        
        const satData = await satResponse.json();
        const sensorData = await sensorResponse.json();
        
        loadingEl.style.display = 'none';
        
        if (satData.success && satData.data) {
            satellitesData = satData.data;
        }
        
        if (sensorData.success && sensorData.data) {
            sensorsData = sensorData.data;
        }
        
        renderTree();
    } catch (error) {
        loadingEl.style.display = 'none';
        console.error('Error loading tree data:', error);
        treeEl.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">Error loading data</p>';
    }
}

// Render tree view
function renderTree() {
    const treeEl = document.getElementById('tree');
    
    if (satellitesData.length === 0) {
        treeEl.innerHTML = '<p class="loading">No satellites found</p>';
        return;
    }
    
    let html = '';
    
    satellitesData.forEach(satellite => {
        const satelliteSensors = sensorsData.filter(s => s.sat_id === satellite.id);
        const hasChildren = satelliteSensors.length > 0;
        
        html += `
            <div class="tree-node">
                <div class="tree-item" onclick="toggleNode(${satellite.id})" data-sat-id="${satellite.id}">
                    <span class="tree-toggle ${hasChildren ? 'collapsed' : 'empty'}" id="toggle-${satellite.id}"></span>
                    <span class="tree-icon">🛰️</span>
                    <span class="tree-label">${satellite.name}</span>
                    ${satellite.hex_color ? `<span class="tree-color" style="background-color: ${satellite.hex_color}"></span>` : ''}
                </div>
                <div class="tree-children collapsed" id="children-${satellite.id}">
                    ${satelliteSensors.map(sensor => `
                        <div class="tree-item" onclick="selectSensor(event, ${sensor.id})" data-sensor-id="${sensor.id}">
                            <span class="tree-toggle empty"></span>
                            <span class="tree-icon">📡</span>
                            <span class="tree-label">${sensor.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    treeEl.innerHTML = html;
}

// Toggle tree node
function toggleNode(satelliteId) {
    const toggleEl = document.getElementById(`toggle-${satelliteId}`);
    const childrenEl = document.getElementById(`children-${satelliteId}`);
    
    if (!toggleEl || !childrenEl) return;
    
    if (toggleEl.classList.contains('empty')) return;
    
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

// Select sensor
function selectSensor(event, sensorId) {
    event.stopPropagation();
    
    // Remove previous selection
    document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selection to clicked item
    event.currentTarget.classList.add('selected');
    
    const sensor = sensorsData.find(s => s.id === sensorId);
    if (sensor) {
        console.log('Selected sensor:', sensor);
        // You can add more functionality here, like showing sensor details on the map
    }
}
