// API configuration
const API_BASE = '/api/v1';
let authToken = localStorage.getItem('authToken');
let currentEditId = null;

// API helper function
async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'API request failed');
    }

    return data;
}

// Login functionality
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await apiCall('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (response.success && response.data.token) {
            authToken = response.data.token;
            localStorage.setItem('authToken', authToken);
            document.getElementById('loginContainer').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            loadAllData();
        }
    } catch (error) {
        errorDiv.innerHTML = `<div class="error">${error.message}</div>`;
    }
});

// Check if already logged in
if (authToken) {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadAllData();
}

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

// Load all data
function loadAllData() {
    loadSatellites();
    loadSensors();
    loadTLEs();
}

// ==================== SATELLITES ====================

async function loadSatellites() {
    const loading = document.getElementById('satellitesLoading');
    const content = document.getElementById('satellitesContent');
    
    loading.style.display = 'block';
    content.innerHTML = '';

    try {
        const response = await apiCall('/sat/all');
        const satellites = response.data || [];

        loading.style.display = 'none';

        if (satellites.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🛰️</div>
                    <p>No satellites found. Add your first satellite!</p>
                </div>
            `;
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>NORAD ID</th>
                        <th>Name</th>
                        <th>Color</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        satellites.forEach(sat => {
            html += `
                <tr>
                    <td>${sat.id}</td>
                    <td>${sat.noard_id}</td>
                    <td>${sat.name}</td>
                    <td>
                        <span class="color-preview" style="background-color: ${sat.hex_color}"></span>
                        ${sat.hex_color}
                    </td>
                    <td>
                        <button class="btn btn-primary btn-small" onclick="editSatellite(${sat.id})">Edit</button>
                        <button class="btn btn-danger btn-small" onclick="deleteSatellite(${sat.id}, '${sat.name}')">Delete</button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        content.innerHTML = html;
    } catch (error) {
        loading.style.display = 'none';
        content.innerHTML = `<div class="error">Error loading satellites: ${error.message}</div>`;
    }
}

function openAddSatelliteModal() {
    currentEditId = null;
    document.getElementById('satelliteModalTitle').textContent = 'Add Satellite';
    document.getElementById('satelliteForm').reset();
    document.getElementById('satelliteModalError').innerHTML = '';
    document.getElementById('satelliteModal').classList.add('active');
}

function closeSatelliteModal() {
    document.getElementById('satelliteModal').classList.remove('active');
}

async function editSatellite(id) {
    currentEditId = id;
    document.getElementById('satelliteModalTitle').textContent = 'Edit Satellite';
    document.getElementById('satelliteModalError').innerHTML = '';

    try {
        const response = await apiCall(`/sat/${id}`);
        const sat = response.data;

        document.getElementById('satNoardID').value = sat.noard_id;
        document.getElementById('satName').value = sat.name;
        document.getElementById('satHexColor').value = sat.hex_color;

        document.getElementById('satelliteModal').classList.add('active');
    } catch (error) {
        alert('Error loading satellite: ' + error.message);
    }
}

async function deleteSatellite(id, name) {
    if (!confirm(`Are you sure you want to delete satellite "${name}"?`)) {
        return;
    }

    try {
        await apiCall(`/sat/${id}`, { method: 'DELETE' });
        loadSatellites();
    } catch (error) {
        alert('Error deleting satellite: ' + error.message);
    }
}

document.getElementById('satelliteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('satelliteModalError');
    errorDiv.innerHTML = '';

    const satelliteData = {
        noard_id: document.getElementById('satNoardID').value,
        name: document.getElementById('satName').value,
        hex_color: document.getElementById('satHexColor').value
    };

    try {
        if (currentEditId) {
            await apiCall(`/sat/update/${currentEditId}`, {
                method: 'PUT',
                body: JSON.stringify(satelliteData)
            });
        } else {
            await apiCall('/sat/add', {
                method: 'POST',
                body: JSON.stringify(satelliteData)
            });
        }

        closeSatelliteModal();
        loadSatellites();
    } catch (error) {
        errorDiv.innerHTML = `<div class="error">${error.message}</div>`;
    }
});

// ==================== SENSORS ====================

async function loadSensors() {
    const loading = document.getElementById('sensorsLoading');
    const content = document.getElementById('sensorsContent');
    
    loading.style.display = 'block';
    content.innerHTML = '';

    try {
        const response = await apiCall('/sen/all');
        const sensors = response.data || [];

        loading.style.display = 'none';

        if (sensors.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📡</div>
                    <p>No sensors found. Add your first sensor!</p>
                </div>
            `;
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Satellite</th>
                        <th>Sensor Name</th>
                        <th>Resolution</th>
                        <th>Width</th>
                        <th>Color</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sensors.forEach(sen => {
            html += `
                <tr>
                    <td>${sen.id}</td>
                    <td>${sen.sat_name} (${sen.sat_noard_id})</td>
                    <td>${sen.name}</td>
                    <td>${sen.resolution}m</td>
                    <td>${sen.width}km</td>
                    <td>
                        <span class="color-preview" style="background-color: ${sen.hex_color}"></span>
                        ${sen.hex_color}
                    </td>
                    <td>
                        <button class="btn btn-primary btn-small" onclick="editSensor(${sen.id})">Edit</button>
                        <button class="btn btn-danger btn-small" onclick="deleteSensor(${sen.id}, '${sen.name}')">Delete</button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        content.innerHTML = html;
    } catch (error) {
        loading.style.display = 'none';
        content.innerHTML = `<div class="error">Error loading sensors: ${error.message}</div>`;
    }
}

function openAddSensorModal() {
    currentEditId = null;
    document.getElementById('sensorModalTitle').textContent = 'Add Sensor';
    document.getElementById('sensorForm').reset();
    document.getElementById('sensorModalError').innerHTML = '';
    document.getElementById('sensorModal').classList.add('active');
}

function closeSensorModal() {
    document.getElementById('sensorModal').classList.remove('active');
}

async function editSensor(id) {
    currentEditId = id;
    document.getElementById('sensorModalTitle').textContent = 'Edit Sensor';
    document.getElementById('sensorModalError').innerHTML = '';

    try {
        const response = await apiCall(`/sen/${id}`);
        const sen = response.data;

        document.getElementById('senSatNoardID').value = sen.sat_noard_id;
        document.getElementById('senSatName').value = sen.sat_name;
        document.getElementById('senName').value = sen.name;
        document.getElementById('senResolution').value = sen.resolution;
        document.getElementById('senWidth').value = sen.width;
        document.getElementById('senRightSideAngle').value = sen.right_side_angle;
        document.getElementById('senLeftSideAngle').value = sen.left_side_angle;
        document.getElementById('senObserveAngle').value = sen.observe_angle;
        document.getElementById('senInitAngle').value = sen.init_angle;
        document.getElementById('senHexColor').value = sen.hex_color;

        document.getElementById('sensorModal').classList.add('active');
    } catch (error) {
        alert('Error loading sensor: ' + error.message);
    }
}

async function deleteSensor(id, name) {
    if (!confirm(`Are you sure you want to delete sensor "${name}"?`)) {
        return;
    }

    try {
        await apiCall(`/sen/${id}`, { method: 'DELETE' });
        loadSensors();
    } catch (error) {
        alert('Error deleting sensor: ' + error.message);
    }
}

document.getElementById('sensorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('sensorModalError');
    errorDiv.innerHTML = '';

    const sensorData = {
        sat_noard_id: document.getElementById('senSatNoardID').value,
        sat_name: document.getElementById('senSatName').value,
        name: document.getElementById('senName').value,
        resolution: parseFloat(document.getElementById('senResolution').value) || 0,
        width: parseFloat(document.getElementById('senWidth').value) || 0,
        right_side_angle: parseFloat(document.getElementById('senRightSideAngle').value) || 0,
        left_side_angle: parseFloat(document.getElementById('senLeftSideAngle').value) || 0,
        observe_angle: parseFloat(document.getElementById('senObserveAngle').value) || 0,
        init_angle: parseFloat(document.getElementById('senInitAngle').value) || 0,
        hex_color: document.getElementById('senHexColor').value
    };

    try {
        if (currentEditId) {
            await apiCall(`/sen/update/${currentEditId}`, {
                method: 'PUT',
                body: JSON.stringify(sensorData)
            });
        } else {
            await apiCall('/sen/add', {
                method: 'POST',
                body: JSON.stringify(sensorData)
            });
        }

        closeSensorModal();
        loadSensors();
    } catch (error) {
        errorDiv.innerHTML = `<div class="error">${error.message}</div>`;
    }
});

// ==================== TLE ====================

async function loadTLEs() {
    const loading = document.getElementById('tleLoading');
    const content = document.getElementById('tleContent');
    
    loading.style.display = 'block';
    content.innerHTML = '';

    try {
        const response = await apiCall('/tle/all');
        const tles = response.data || [];

        loading.style.display = 'none';

        if (tles.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <p>No TLE data found. Add your first TLE record!</p>
                </div>
            `;
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>NORAD ID</th>
                        <th>Time</th>
                        <th>Line 1</th>
                        <th>Line 2</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        tles.forEach(tle => {
            const date = new Date(tle.time * 1000).toLocaleString();
            html += `
                <tr>
                    <td>${tle.id}</td>
                    <td>${tle.sat_noard_id}</td>
                    <td>${date}</td>
                    <td style="font-family: monospace; font-size: 11px;">${tle.line1.substring(0, 30)}...</td>
                    <td style="font-family: monospace; font-size: 11px;">${tle.line2.substring(0, 30)}...</td>
                    <td>
                        <button class="btn btn-danger btn-small" onclick="deleteTLE(${tle.id}, '${tle.sat_noard_id}')">Delete</button>
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;

        content.innerHTML = html;
    } catch (error) {
        loading.style.display = 'none';
        content.innerHTML = `<div class="error">Error loading TLE data: ${error.message}</div>`;
    }
}

function openAddTLEModal() {
    currentEditId = null;
    document.getElementById('tleModalTitle').textContent = 'Add TLE';
    document.getElementById('tleForm').reset();
    document.getElementById('tleModalError').innerHTML = '';
    
    // Set current timestamp
    const currentTime = Math.floor(Date.now() / 1000);
    document.getElementById('tleTime').value = currentTime;
    document.getElementById('currentTimestamp').textContent = currentTime;
    
    document.getElementById('tleModal').classList.add('active');
}

function closeTLEModal() {
    document.getElementById('tleModal').classList.remove('active');
}

async function deleteTLE(id, noradId) {
    if (!confirm(`Are you sure you want to delete TLE record for satellite ${noradId}?`)) {
        return;
    }

    try {
        await apiCall(`/tle/${id}`, { method: 'DELETE' });
        loadTLEs();
    } catch (error) {
        alert('Error deleting TLE: ' + error.message);
    }
}

document.getElementById('tleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('tleModalError');
    errorDiv.innerHTML = '';

    const tleData = [{
        sat_noard_id: document.getElementById('tleSatNoardID').value,
        time: parseInt(document.getElementById('tleTime').value),
        line1: document.getElementById('tleLine1').value,
        line2: document.getElementById('tleLine2').value
    }];

    try {
        await apiCall('/sat/tle/update', {
            method: 'POST',
            body: JSON.stringify(tleData)
        });

        closeTLEModal();
        alert('TLE added successfully!');
        loadTLEs();
    } catch (error) {
        errorDiv.innerHTML = `<div class="error">${error.message}</div>`;
    }
});

// Update current timestamp every second for TLE modal
setInterval(() => {
    const timestampElement = document.getElementById('currentTimestamp');
    if (timestampElement) {
        timestampElement.textContent = Math.floor(Date.now() / 1000);
    }
}, 1000);

// Close modals when clicking outside
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});
