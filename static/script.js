// API Base URL
const API_BASE = '/api/v1';

// Current tab
let currentTab = 'satellites';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadHealthStats();
    loadSatellites();
    
    // Refresh data every 5 minutes
    setInterval(loadHealthStats, 300000);
});

// Switch tabs
function switchTab(tabName) {
    currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
    
    // Load data for the selected tab
    switch(tabName) {
        case 'satellites':
            loadSatellites();
            break;
        case 'sensors':
            loadSensors();
            break;
        case 'tle':
            loadTLE();
            break;
    }
}

// Load health stats
async function loadHealthStats() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        if (data.success && data.data) {
            document.getElementById('totalSatellites').textContent = data.data.satellites || '-';
            document.getElementById('totalSensors').textContent = data.data.sensors || '-';
            document.getElementById('totalTLE').textContent = data.data.tle_count || '-';
        }
    } catch (error) {
        console.error('Error loading health stats:', error);
    }
}

// Load satellites
async function loadSatellites() {
    const loadingEl = document.getElementById('satellitesLoading');
    const tableEl = document.getElementById('satellitesTable');
    
    loadingEl.style.display = 'block';
    tableEl.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE}/satellites`);
        const data = await response.json();
        
        loadingEl.style.display = 'none';
        
        if (data.success && data.data) {
            const satellites = data.data;
            
            if (satellites.length === 0) {
                tableEl.innerHTML = '<p style="text-align: center; padding: 20px;">No satellites found</p>';
                return;
            }
            
            const table = `
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>NORAD ID</th>
                            <th>Name</th>
                            <th>Color</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${satellites.map(sat => `
                            <tr>
                                <td>${sat.id}</td>
                                <td>${sat.noard_id}</td>
                                <td><strong>${sat.name}</strong></td>
                                <td>
                                    <div class="color-badge">
                                        <div class="color-box" style="background-color: ${sat.hex_color || '#000000'}"></div>
                                        <span>${sat.hex_color || 'N/A'}</span>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            tableEl.innerHTML = table;
        }
    } catch (error) {
        loadingEl.style.display = 'none';
        tableEl.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">Error loading satellites</p>';
        console.error('Error loading satellites:', error);
    }
}

// Load sensors
async function loadSensors() {
    const loadingEl = document.getElementById('sensorsLoading');
    const tableEl = document.getElementById('sensorsTable');
    
    loadingEl.style.display = 'block';
    tableEl.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE}/sensors`);
        const data = await response.json();
        
        loadingEl.style.display = 'none';
        
        if (data.success && data.data) {
            const sensors = data.data;
            
            if (sensors.length === 0) {
                tableEl.innerHTML = '<p style="text-align: center; padding: 20px;">No sensors found</p>';
                return;
            }
            
            const table = `
                <table>
                    <thead>
                        <tr>
                            <th>Satellite</th>
                            <th>Sensor</th>
                            <th>Resolution (m)</th>
                            <th>Width (km)</th>
                            <th>Observe Angle (°)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sensors.map(sensor => `
                            <tr>
                                <td><strong>${sensor.sat_name}</strong></td>
                                <td>${sensor.name}</td>
                                <td>${sensor.resolution}</td>
                                <td>${sensor.width}</td>
                                <td>${sensor.observe_angle}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            tableEl.innerHTML = table;
        }
    } catch (error) {
        loadingEl.style.display = 'none';
        tableEl.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">Error loading sensors</p>';
        console.error('Error loading sensors:', error);
    }
}

// Load TLE data
async function loadTLE() {
    const loadingEl = document.getElementById('tleLoading');
    const tableEl = document.getElementById('tleTable');
    
    loadingEl.style.display = 'block';
    tableEl.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE}/tle`);
        const data = await response.json();
        
        loadingEl.style.display = 'none';
        
        if (data.success && data.data) {
            const tles = data.data;
            
            if (tles.length === 0) {
                tableEl.innerHTML = '<p style="text-align: center; padding: 20px;">No TLE data found</p>';
                return;
            }
            
            const table = `
                <table>
                    <thead>
                        <tr>
                            <th>NORAD ID</th>
                            <th>Timestamp</th>
                            <th>TLE Data</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tles.map(tle => `
                            <tr>
                                <td><strong>${tle.sat_noard_id}</strong></td>
                                <td>${new Date(tle.time * 1000).toLocaleString()}</td>
                                <td>
                                    <div class="tle-line">${tle.line1}</div>
                                    <div class="tle-line">${tle.line2}</div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            tableEl.innerHTML = table;
        }
    } catch (error) {
        loadingEl.style.display = 'none';
        tableEl.innerHTML = '<p style="text-align: center; padding: 20px; color: #EF4444;">Error loading TLE data</p>';
        console.error('Error loading TLE data:', error);
    }
}
