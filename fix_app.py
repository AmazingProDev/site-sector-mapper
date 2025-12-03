
import os

file_path = '/Users/abdelilah/.gemini/antigravity/scratch/unified-portal/site-sector-mapper/app.js'

new_code = """function renderKmlList(searchTerm = '') {
    console.log('renderKmlList called');
    const kmlListContainer = document.getElementById('kmlListContainer');
    const kmlTotalCount = document.getElementById('kmlTotalCount');

    if (!kmlListContainer) {
        console.error('Error: kmlListContainer not found');
        return;
    }

    kmlListContainer.innerHTML = '';

    // Filter for KML points
    const kmlSites = sites.filter(site => site.type === 'kml_point' && site.name.toLowerCase().includes(searchTerm.toLowerCase()));
    console.log(`Found ${kmlSites.length} KML sites in global array (Total sites: ${sites.length})`);

    // Debug first site to check type
    if (sites.length > 0) {
        console.log('First site sample:', sites[0]);
    }

    if (kmlTotalCount) {
        kmlTotalCount.textContent = `(${kmlSites.length})`;
    }

    if (kmlSites.length === 0) {
        kmlListContainer.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
                <p>No KML files imported</p>
            </div>
        `;
        return;
    }

    // Group sites by filename (group property)
    const groups = {};
    kmlSites.forEach(site => {
        const groupName = site.group || 'Unknown KML';
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(site);
    });

    // Render groups
    kmlListContainer.innerHTML = Object.keys(groups).sort().map(groupName => {
        const groupSites = groups[groupName];
        const groupId = `kml-group-${groupName.replace(/\\s+/g, '-')}`;
        const initialLimit = 50;
        const hasMore = groupSites.length > initialLimit;
        const visibleSites = groupSites.slice(0, initialLimit);

        return `
            <div class="site-group">
                <div class="site-group-header" onclick="toggleGroup('${groupId}')">
                    <span class="group-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </span>
                    <span class="group-name">${groupName}</span>
                    <span class="group-count">${groupSites.length}</span>
                </div>
                <div id="${groupId}" class="site-group-content">
                    <div id="${groupId}-list">
                        ${visibleSites.map(site => `
                            <div class="site-list-item" onclick="panToSite('${site.id}')">
                                <div class="site-info">
                                    <div class="site-name">${site.name}</div>
                                    <div class="site-coords">${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}</div>
                                </div>
                                <button class="delete-btn" onclick="deleteSite('${site.id}'); event.stopPropagation();" title="Delete Point">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    ${hasMore ? `
                        <button class="btn btn-sm btn-secondary" style="width: 100%; margin-top: 8px;" onclick="loadMoreKmlPoints('${groupId}', '${groupName}', ${initialLimit})">
                            Load More (${groupSites.length - initialLimit} remaining)
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function loadMoreKmlPoints(groupId, groupName, currentCount) {
    const batchSize = 100;
    const listContainer = document.getElementById(`${groupId}-list`);
    const button = listContainer.nextElementSibling; // The "Load More" button
    
    // Find the group data
    const kmlSites = sites.filter(site => site.type === 'kml_point');
    const groupSites = kmlSites.filter(site => (site.group || 'Unknown KML') === groupName);
    
    const nextBatch = groupSites.slice(currentCount, currentCount + batchSize);
    
    // Append new items
    const newItemsHtml = nextBatch.map(site => `
        <div class="site-list-item" onclick="panToSite('${site.id}')">
            <div class="site-info">
                <div class="site-name">${site.name}</div>
                <div class="site-coords">${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}</div>
            </div>
            <button class="delete-btn" onclick="deleteSite('${site.id}'); event.stopPropagation();" title="Delete Point">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
    
    listContainer.insertAdjacentHTML('beforeend', newItemsHtml);
    
    // Update button or remove if done
    const newCount = currentCount + nextBatch.length;
    if (newCount < groupSites.length) {
        button.setAttribute('onclick', `loadMoreKmlPoints('${groupId}', '${groupName}', ${newCount})`);
        button.textContent = `Load More (${groupSites.length - newCount} remaining)`;
    } else {
        button.remove();
    }
}

// Helper to toggle groups
window.toggleGroup = function (groupId) {
    const content = document.getElementById(groupId);
    const header = content.previousElementSibling;
    content.classList.toggle('collapsed');
    header.classList.toggle('collapsed');
};

function handleSearch(e) {
    renderSitesList(e.target.value);
}

// ==================== MODAL ====================

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
"""

with open(file_path, 'r') as f:
    lines = f.readlines()

# Keep lines before 1811 (index 1810)
# Note: lines are 0-indexed in list, but 1-indexed in editor.
# Line 1811 is index 1810.
# We want to keep up to index 1810 (exclusive of 1810? No, 1810 is the start of bad code).
# So keep 0 to 1810.
part1 = lines[:1810]

# Find the index of 'function closeModal() {' after line 1810
start_search = 1810
end_index = -1
for i in range(start_search, len(lines)):
    if 'function closeModal() {' in lines[i]:
        end_index = i
        break

if end_index == -1:
    print("Error: Could not find closeModal function")
    exit(1)

part2 = lines[end_index:]

# Combine
final_content = "".join(part1) + new_code + "\n" + "".join(part2)

with open(file_path, 'w') as f:
    f.write(final_content)

print(f"Successfully patched {file_path}")
