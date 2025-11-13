// API Base URL
const API_BASE = '/api/v1';

// Data storage
let treeData = null;
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
    const colorBadge = node.hex_color ? `<span class="tree-color" style="background-color: ${node.hex_color}"></span>` : '';
    
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
                    ${colorBadge}
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
