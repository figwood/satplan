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
        // Handle expired/invalid token - redirect to login
        if (response.status === 401) {
            localStorage.removeItem('authToken');
            authToken = null;
            document.getElementById('loginContainer').style.display = 'block';
            document.getElementById('adminPanel').style.display = 'none';
            const loginError = document.getElementById('loginError');
            if (loginError) {
                loginError.innerHTML = '<div class="error">Session expired. Please login again.</div>';
            }
        }
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
    
    // Load data when switching to specific tabs
    if (tabName === 'account') {
        loadUserInfo();
    } else if (tabName === 'tleSites') {
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

        let message = response.message;
        if (response.data && response.data.failed_sites && response.data.failed_sites.length > 0) {
            message += `\nWarning: Failed to fetch from sites: ${response.data.failed_sites.join(', ')}`;
        }
        
        showToast(message, 'success');
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
        const response = await apiCall('/sat/tle/update', {
            method: 'POST',
            body: JSON.stringify(tleData)
        });

        closeBulkTLEModal();
        
        let message = `Updated ${response.data.inserted} TLE record(s)`;
        if (response.data.skipped > 0) {
            message += ` (${response.data.skipped} skipped)`;
        }
        
        showToast(message, 'success');
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
        const sites = response.data || [];

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
        const response = await apiCall(`/tle/sites/${id}`);
        const site = response.data;

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

// ==================== ACCOUNT ====================

async function loadUserInfo() {
    const content = document.getElementById('userInfoContent');
    
    content.innerHTML = '<div class="loading">Loading user information...</div>';

    try {
        const response = await apiCall('/user/me');
        const user = response.data;

        content.innerHTML = `
            <div style="padding: 20px;">
                <div style="margin-bottom: 15px;">
                    <strong>Username:</strong> ${user.username}
                </div>
                <div style="margin-bottom: 15px;">
                    <strong>Email:</strong> ${user.email || 'Not set'}
                </div>
                <div style="margin-bottom: 15px;">
                    <strong>User ID:</strong> ${user.id}
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<div class="error" style="margin: 20px;">${error.message}</div>`;
    }
}

function openChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('active');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordModalError').innerHTML = '';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.remove('active');
}

// Handle change password form submission
document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('changePasswordModalError');
    errorDiv.innerHTML = '';

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validate passwords match
    if (newPassword !== confirmPassword) {
        errorDiv.innerHTML = '<div class="error">New passwords do not match</div>';
        return;
    }

    // Validate password length
    if (newPassword.length < 6) {
        errorDiv.innerHTML = '<div class="error">Password must be at least 6 characters long</div>';
        return;
    }

    try {
        const response = await apiCall('/user/password', {
            method: 'PUT',
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        closeChangePasswordModal();
        showToast('Password changed successfully', 'success');
    } catch (error) {
        errorDiv.innerHTML = `<div class="error">${error.message}</div>`;
    }
});
