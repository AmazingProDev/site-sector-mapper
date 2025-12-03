
import os

file_path = '/Users/abdelilah/.gemini/antigravity/scratch/unified-portal/site-sector-mapper/app.js'

missing_code = """
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
    document.getElementById('siteModal').classList.remove('active');
    document.getElementById('pointModal').classList.remove('active');
    editingId = null;
    editingPointId = null;
}

function editSite(id) {
    const site = sites.find(s => s.id === id);
    if (!site) return;

    // Close detail modal if open
    document.getElementById('siteModal').classList.remove('active');

    // Reuse point modal for editing
    openPointModal(site);
}

function deleteSite(id) {
    if (confirm('Are you sure you want to delete this site?')) {
        sites = sites.filter(s => s.id !== id);
        saveToLocalStorage();
        updateUI();
        updateMapMarkers();
        closeModal();
        showNotification('Site deleted successfully', 'success');
    }
}

function locateSite(lat, lng) {
    map.setView([lat, lng], 18);
}

function openPointModal(site = null, lat = null, lng = null) {
    const modal = document.getElementById('pointModal');
    const title = document.getElementById('pointModalTitle');
    
    // Reset form
    document.getElementById('pointName').value = '';
    document.getElementById('pointDesc').value = '';
    document.getElementById('pointLat').value = '';
    document.getElementById('pointLng').value = '';
    document.getElementById('pointColor').value = '#3b82f6';
    document.getElementById('pointColorText').value = '#3b82f6';

    if (site) {
        // Edit mode
        editingId = site.id;
        title.textContent = 'Edit Point';
        document.getElementById('pointName').value = site.name;
        document.getElementById('pointDesc').value = site.description || '';
        document.getElementById('pointLat').value = site.latitude;
        document.getElementById('pointLng').value = site.longitude;
        if (site.iconColor) {
            document.getElementById('pointColor').value = site.iconColor;
            document.getElementById('pointColorText').value = site.iconColor;
        }
    } else {
        // Add mode
        editingId = null;
        title.textContent = 'Add New Point';
        if (lat && lng) {
            document.getElementById('pointLat').value = lat.toFixed(6);
            document.getElementById('pointLng').value = lng.toFixed(6);
        }
    }

    modal.classList.add('active');
}

function handlePointSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('pointName').value;
    const description = document.getElementById('pointDesc').value;
    const lat = parseFloat(document.getElementById('pointLat').value);
    const lng = parseFloat(document.getElementById('pointLng').value);
    const color = document.getElementById('pointColor').value;

    if (!name || isNaN(lat) || isNaN(lng)) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    if (editingId) {
        // Update existing
        const siteIndex = sites.findIndex(s => s.id === editingId);
        if (siteIndex !== -1) {
            sites[siteIndex] = {
                ...sites[siteIndex],
                name,
                description,
                latitude: lat,
                longitude: lng,
                iconColor: color
            };
            showNotification('Point updated successfully', 'success');
        }
    } else {
        // Create new
        const newSite = {
            id: `manual-${Date.now()}`,
            name,
            description,
            latitude: lat,
            longitude: lng,
            type: 'manual_point',
            group: 'Manual',
            sectors: [],
            iconShape: 'default',
            iconColor: color,
            iconSize: 30
        };
        sites.push(newSite);
        showNotification('Point added successfully', 'success');
    }

    saveToLocalStorage();
    updateUI();
    updateMapMarkers();
    closeModal();
    
    // Reset add marker mode
    if (isAddingMarker) {
        toggleAddMarkerMode(false);
    }
}

function deletePoint(id) {
    if (confirm('Are you sure you want to delete this point?')) {
        sites = sites.filter(s => s.id !== id);
        saveToLocalStorage();
        updateUI();
        updateMapMarkers();
        showNotification('Point deleted', 'success');
    }
}
"""

with open(file_path, 'r') as f:
    content = f.read()

# Find insertion point
marker = "// ==================== UTILITY FUNCTIONS ===================="
idx = content.find(marker)

if idx != -1:
    new_content = content[:idx] + missing_code + "\n\n" + content[idx:]
    with open(file_path, 'w') as f:
        f.write(new_content)
    print(f"Successfully restored functions in {file_path}")
else:
    print("Error: Could not find insertion marker")
