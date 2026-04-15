// API configuration
function resolveApiBase() {
    const { protocol, hostname, port } = window.location;

    if (protocol === 'file:') {
        return `http://localhost:8080/api/v1`;
    }

    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalHost && port && port !== '8080') {
        return `${protocol}//${hostname}:8080/api/v1`;
    }

    return '/api/v1';
}

const API_BASE = resolveApiBase();
let currentEditId = null;
const ADMIN_TOKEN_KEY = 'satplan_admin_token';

const getAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY) || '';

const setAdminToken = (token) => {
    if (token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
};

const showLogin = (message = '') => {
    const loginPanel = document.getElementById('loginPanel');
    const adminPanel = document.getElementById('adminPanel');
    const loginError = document.getElementById('loginError');

    if (adminPanel) {
        adminPanel.classList.add('hidden');
    }
    if (loginPanel) {
        loginPanel.classList.remove('hidden');
    }
    if (loginError) {
        loginError.textContent = message;
        loginError.style.display = message ? 'block' : 'none';
    }
};

const showAdmin = () => {
    const loginPanel = document.getElementById('loginPanel');
    const adminPanel = document.getElementById('adminPanel');

    if (loginPanel) {
        loginPanel.classList.add('hidden');
    }
    if (adminPanel) {
        adminPanel.classList.remove('hidden');
    }
};

const verifyAdminCredentials = async (credentials) => {
    const username = credentials?.username?.trim() || '';
    const password = credentials?.password || '';
    if (!username || !password) {
        return { ok: false, message: 'Please enter username and password.' };
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            return {
                ok: false,
                message: payload?.message || payload?.error || 'Authentication failed.'
            };
        }

        const token = payload?.data?.token;
        if (!token) {
            return { ok: false, message: 'Login succeeded but no token was returned.' };
        }

        return { ok: true, token };
    } catch (error) {
        return { ok: false, message: 'Unable to reach the admin API.' };
    }
};

// API helper function
async function apiCall(endpoint, options = {}) {
    const token = getAdminToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    const rawText = await response.text();
    let data = null;
    try {
        data = rawText ? JSON.parse(rawText) : null;
    } catch (error) {
        data = { message: rawText };
    }

    if (response.status === 401) {
        setAdminToken('');
        showLogin('Session expired. Please log in again.');
    }

    if (!response.ok) {
        throw new Error(data?.message || data?.error || 'API request failed');
    }

    return data?.data ?? null;
}

// Initial load
const startAdmin = () => {
    initializeAuth();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAdmin);
} else {
    startAdmin();
}

function initializeAuth() {
    const loginForm = document.getElementById('loginForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = loginUsername?.value.trim() || '';
            const password = loginPassword?.value || '';

            const submitButton = loginForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Checking...';
            }

            const result = await verifyAdminCredentials({ username, password });
            if (result.ok) {
                setAdminToken(result.token);
                showAdmin();
                loadAllData();
            } else {
                showLogin(result.message || 'Authentication failed.');
            }

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Login';
            }
        });
    }

    const existingToken = getAdminToken();
    if (existingToken) {
        apiCall('/user/me').then(() => {
            showAdmin();
            loadAllData();
        }).catch((error) => {
            setAdminToken('');
            showLogin(error.message || 'Authentication failed.');
        });
    } else {
        showLogin();
    }
}

// Tab switching
function switchTab(tabName, evt) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const targetButton = evt?.target || document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }
    document.getElementById(tabName).classList.add('active');

    // Load data when switching to specific tabs
    if (tabName === 'tleSites') {
        loadTLESites();
    }
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
        const satellites = response || [];

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
    document.getElementById('satParsedNoradID').value = '';
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
        const sat = await apiCall(`/sat/${id}`);

        document.getElementById('satName').value = sat.name;
        document.getElementById('satHexColor').value = sat.hex_color;
        
        // For edit mode, we need to fetch TLE data
        try {
            const tleResponse = await apiCall(`/tle/sat/${encodeURIComponent(sat.noard_id)}`);
            if (Array.isArray(tleResponse) && tleResponse.length > 0) {
                const tle = tleResponse[0];
                const tleText = `${sat.name}\n${tle.line1}\n${tle.line2}`;
                document.getElementById('satTLEData').value = tleText;
                document.getElementById('satParsedNoradID').value = sat.noard_id;
            } else {
                // No TLE data available, show placeholder
                document.getElementById('satTLEData').value = '';
                document.getElementById('satParsedNoradID').value = sat.noard_id;
            }
        } catch (tleError) {
            // TLE fetch failed, just show NORAD ID
            document.getElementById('satTLEData').value = '';
            document.getElementById('satParsedNoradID').value = sat.noard_id;
        }

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

// Parse TLE data from satellite form
function parseSatelliteTLE(tleText) {
    const lines = tleText.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let name = '';
    let line1 = '';
    let line2 = '';
    let noradId = '';
    
    if (lines.length === 2) {
        // 2-line format
        line1 = lines[0];
        line2 = lines[1];
    } else if (lines.length === 3) {
        // 3-line format
        name = lines[0];
        line1 = lines[1];
        line2 = lines[2];
    } else {
        throw new Error('TLE data must be either 2 lines (Line 1 and Line 2) or 3 lines (Name, Line 1, Line 2)');
    }
    
    // Validate TLE format
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
        throw new Error('Invalid TLE format. Lines must start with "1 " and "2 "');
    }
    
    // Extract NORAD ID from line 1 (columns 3-7)
    noradId = line1.substring(2, 7).trim();
    
    if (!noradId) {
        throw new Error('Could not extract NORAD ID from TLE data');
    }
    
    return { name, line1, line2, noradId };
}

// Add event listener for TLE data input to auto-parse
document.getElementById('satTLEData')?.addEventListener('input', function() {
    const tleText = this.value;
    const errorDiv = document.getElementById('satelliteModalError');
    
    if (!tleText.trim()) {
        document.getElementById('satParsedNoradID').value = '';
        return;
    }
    
    try {
        const parsed = parseSatelliteTLE(tleText);
        document.getElementById('satParsedNoradID').value = parsed.noradId;
        
        // Auto-fill name if it was parsed and name field is empty or matches old parsed value
        const nameField = document.getElementById('satName');
        if (parsed.name && (!nameField.value || nameField.dataset.autofilled === 'true')) {
            nameField.value = parsed.name;
            nameField.dataset.autofilled = 'true';
        }
        
        errorDiv.innerHTML = '';
    } catch (error) {
        document.getElementById('satParsedNoradID').value = '';
        // Don't show error while user is still typing
    }
});

// Mark manual name changes
document.getElementById('satName')?.addEventListener('input', function() {
    if (this.value) {
        this.dataset.autofilled = 'false';
    }
});

document.getElementById('satelliteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('satelliteModalError');
    errorDiv.innerHTML = '';

    const tleText = document.getElementById('satTLEData').value;
    const name = document.getElementById('satName').value;
    const hexColor = document.getElementById('satHexColor').value;
    
    try {
        // Parse TLE data
        const parsed = parseSatelliteTLE(tleText);
        
        const satelliteData = {
            noard_id: parsed.noradId,
            name: name,
            hex_color: hexColor
        };
        
        // Create or update satellite
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
        
        // Also update TLE data
        const tleData = [{
            sat_noard_id: parsed.noradId,
            time: Math.floor(Date.now() / 1000),
            line1: parsed.line1,
            line2: parsed.line2
        }];
        
        await apiCall('/sat/tle/update', {
            method: 'POST',
            body: JSON.stringify(tleData)
        });

        closeSatelliteModal();
        showToast(currentEditId ? 'Satellite updated successfully' : 'Satellite added successfully', 'success');
        loadSatellites();
        loadTLEs();
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
        const sensors = response || [];

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

// Load satellites into select dropdown
async function loadSatellitesIntoSelect() {
    const selectElement = document.getElementById('senSatelliteSelect');
    selectElement.innerHTML = '<option value="">Loading...</option>';
    
    try {
        const response = await apiCall('/sat/all');
        const satellites = response || [];
        
        selectElement.innerHTML = '<option value="">Select a satellite...</option>';
        satellites.forEach(sat => {
            const option = document.createElement('option');
            option.value = sat.noard_id;
            option.textContent = `${sat.name} (${sat.noard_id})`;
            option.dataset.satName = sat.name;
            selectElement.appendChild(option);
        });
    } catch (error) {
        selectElement.innerHTML = '<option value="">Error loading satellites</option>';
        console.error('Error loading satellites:', error);
    }
}

async function openAddSensorModal() {
    currentEditId = null;
    document.getElementById('sensorModalTitle').textContent = 'Add Sensor';
    document.getElementById('sensorForm').reset();
    document.getElementById('sensorModalError').innerHTML = '';
    
    // Load satellites into dropdown
    await loadSatellitesIntoSelect();
    
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
        // Load satellites into dropdown first
        await loadSatellitesIntoSelect();
        
        const sen = await apiCall(`/sen/${id}`);

        document.getElementById('senSatelliteSelect').value = sen.sat_noard_id;
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

    const selectElement = document.getElementById('senSatelliteSelect');
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    
    const sensorData = {
        sat_noard_id: selectElement.value,
        sat_name: selectedOption.dataset.satName || selectedOption.textContent.split('(')[0].trim(),
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
        const tles = response || [];

        loading.style.display = 'none';

        if (tles.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <p>No TLE data found. Update TLE data for your satellites!</p>
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

function openBulkTLEModal() {
    document.getElementById('bulkTLEForm').reset();
    document.getElementById('bulkTLEModalError').innerHTML = '';
    document.getElementById('bulkTLEModal').classList.add('active');
}

function closeBulkTLEModal() {
    document.getElementById('bulkTLEModal').classList.remove('active');
}

async function autoUpdateTLEs() {
    if (!confirm('This will automatically fetch TLE data from all configured sites. Continue?')) {
        return;
    }

    try {
        showToast('Fetching TLE data from sites...', 'success');
        
        const response = await apiCall('/tle/auto-update', {
            method: 'POST'
        });

        const count = response?.inserted ?? 0;
        showToast(`Refreshed ${count} TLE record(s)`, 'success');
        loadTLEs();
    } catch (error) {
        showToast('Auto-update failed: ' + error.message, 'error');
    }
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

// Parse TLE text in 3-line format (name, line1, line2)
function parseTLEText(text) {
    const lines = text.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const tles = [];
    
    for (let i = 0; i < lines.length; i += 3) {
        if (i + 2 >= lines.length) {
            break; // Not enough lines for a complete TLE
        }
        
        const name = lines[i];
        const line1 = lines[i + 1];
        const line2 = lines[i + 2];
        
        // Validate TLE format - lines should start with "1 " and "2 "
        if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) {
            throw new Error(`Invalid TLE format at line ${i + 1}. Expected lines starting with "1 " and "2 ".`);
        }
        
        // Extract NORAD ID from line 1 (columns 3-7)
        const noradId = line1.substring(2, 7).trim();
        
        if (!noradId) {
            throw new Error(`Could not extract NORAD ID from TLE at line ${i + 2}.`);
        }
        
        tles.push({
            sat_noard_id: noradId,
            time: Math.floor(Date.now() / 1000),
            line1: line1,
            line2: line2
        });
    }
    
    return tles;
}

// Show toast notification
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

document.getElementById('bulkTLEForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('bulkTLEModalError');
    errorDiv.innerHTML = '';

    const tleText = document.getElementById('bulkTLEText').value;

    try {
        // Parse the TLE text
        const tleData = parseTLEText(tleText);
        
        if (tleData.length === 0) {
            throw new Error('No valid TLE data found. Please check the format.');
        }

        // Send to backend
        await apiCall('/sat/tle/update', {
            method: 'POST',
            body: JSON.stringify(tleData)
        });

        closeBulkTLEModal();

        showToast(`Updated ${tleData.length} TLE record(s)`, 'success');
        loadTLEs();
    } catch (error) {
        errorDiv.innerHTML = `<div class="error">${error.message}</div>`;
    }
});

// Close modals when clicking outside
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// ==================== TLE SITES ====================

async function loadTLESites() {
    const loading = document.getElementById('tleSitesLoading');
    const content = document.getElementById('tleSitesContent');
    
    loading.style.display = 'block';
    content.innerHTML = '';

    try {
        const response = await apiCall('/tle/sites');
        const sites = response || [];

        loading.style.display = 'none';

        if (sites.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🌐</div>
                    <p>No TLE sites configured. Add a site to enable automatic updates!</p>
                </div>
            `;
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Site Name</th>
                        <th>URL</th>
                        <th>Description</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sites.forEach(site => {
            html += `
                <tr>
                    <td>${site.id}</td>
                    <td>${site.site}</td>
                    <td style="font-size: 12px; max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${site.url}</td>
                    <td>${site.description || '-'}</td>
                    <td>
                        <button class="btn btn-primary btn-small" onclick="editTLESite(${site.id})">Edit</button>
                        <button class="btn btn-danger btn-small" onclick="deleteTLESite(${site.id}, '${site.site.replace(/'/g, "\\'")}')">Delete</button>
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
        content.innerHTML = `<div class="error">Error loading TLE sites: ${error.message}</div>`;
    }
}

function openAddTLESiteModal() {
    currentEditId = null;
    document.getElementById('tleSiteModalTitle').textContent = 'Add TLE Site';
    document.getElementById('tleSiteForm').reset();
    document.getElementById('tleSiteModalError').innerHTML = '';
    document.getElementById('tleSiteModal').classList.add('active');
}

function closeTLESiteModal() {
    document.getElementById('tleSiteModal').classList.remove('active');
}

async function editTLESite(id) {
    currentEditId = id;
    document.getElementById('tleSiteModalTitle').textContent = 'Edit TLE Site';
    document.getElementById('tleSiteModalError').innerHTML = '';

    try {
        const site = await apiCall(`/tle/sites/${id}`);

        document.getElementById('tleSiteName').value = site.site;
        document.getElementById('tleSiteURL').value = site.url;
        document.getElementById('tleSiteDescription').value = site.description || '';

        document.getElementById('tleSiteModal').classList.add('active');
    } catch (error) {
        alert('Error loading TLE site: ' + error.message);
    }
}

async function deleteTLESite(id, name) {
    if (!confirm(`Are you sure you want to delete TLE site "${name}"?`)) {
        return;
    }

    try {
        await apiCall(`/tle/sites/${id}`, { method: 'DELETE' });
        showToast('TLE site deleted successfully', 'success');
        loadTLESites();
    } catch (error) {
        alert('Error deleting TLE site: ' + error.message);
    }
}

document.getElementById('tleSiteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('tleSiteModalError');
    errorDiv.innerHTML = '';

    const siteData = {
        site: document.getElementById('tleSiteName').value,
        url: document.getElementById('tleSiteURL').value,
        description: document.getElementById('tleSiteDescription').value
    };

    try {
        if (currentEditId) {
            await apiCall(`/tle/sites/update/${currentEditId}`, {
                method: 'PUT',
                body: JSON.stringify(siteData)
            });
            showToast('TLE site updated successfully', 'success');
        } else {
            await apiCall('/tle/sites/add', {
                method: 'POST',
                body: JSON.stringify(siteData)
            });
            showToast('TLE site added successfully', 'success');
        }

        closeTLESiteModal();
        loadTLESites();
    } catch (error) {
        errorDiv.innerHTML = `<div class="error">${error.message}</div>`;
    }
});
