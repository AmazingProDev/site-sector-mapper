
import os

file_path = '/Users/abdelilah/.gemini/antigravity/scratch/unified-portal/site-sector-mapper/app.js'

# 1. Fix createCustomIcon (malformed HTML)
createCustomIcon_code = """function createCustomIcon(site) {
    const shape = site.iconShape || 'default';
    const color = site.iconColor || '#3b82f6';
    const size = site.iconSize || 30;

    if (shape === 'default') {
        // Default Leaflet-like pin but with custom color
        return L.divIcon({
            className: 'custom-site-marker',
            html: `
                <div style="position: relative; width: ${size}px; height: ${size}px;">
                    <svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                    <div class="site-marker-label" style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%);">${site.name}</div>
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size]
        });
    }

    let svgShape = '';
    switch (shape) {
        case 'circle':
            svgShape = `<circle cx="12" cy="12" r="10" />`;
            break;
        case 'square':
            svgShape = `<rect x="4" y="4" width="16" height="16" rx="2" />`;
            break;
        case 'triangle':
            svgShape = `<path d="M12 2L2 22h20L12 2z" />`;
            break;
        case 'star':
            svgShape = `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />`;
            break;
        case 'diamond':
            svgShape = `<path d="M12 2L2 12l10 10 10-10L12 2z" />`;
            break;
    }

    return L.divIcon({
        className: 'custom-site-marker',
        html: `
            <div style="position: relative; width: ${size}px; height: ${size}px;">
                <svg viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1" style="width: 100%; height: 100%; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                    ${svgShape}
                </svg>
                <div class="site-marker-label" style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%);">${site.name}</div>
            </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}"""

# 2. Update renderKmlList to show color dot
renderKmlList_code = """function renderKmlList(searchTerm = '') {
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
                                    <div class="site-name">
                                        <span class="site-color-dot" style="background-color: ${site.iconColor || '#ef4444'};"></span>
                                        ${site.name}
                                    </div>
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
}"""

# 3. Update loadMoreKmlPoints to show color dot
loadMoreKmlPoints_code = """function loadMoreKmlPoints(groupId, groupName, currentCount) {
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
                <div class="site-name">
                    <span class="site-color-dot" style="background-color: ${site.iconColor || '#ef4444'};"></span>
                    ${site.name}
                </div>
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
}"""

# Helper to replace function
def replace_function(content, func_name, new_code):
    start_marker = f"function {func_name}"
    start_idx = content.find(start_marker)
    if start_idx == -1:
        print(f"Could not find {func_name}")
        return content
    
    # Find end of function
    # We can use the start of the next known function or a heuristic
    # For createCustomIcon, it's followed by toggleAddMarkerMode
    # For renderKmlList, it's followed by loadMoreKmlPoints
    # For loadMoreKmlPoints, it's followed by toggleGroup
    
    next_funcs = {
        'createCustomIcon': 'toggleAddMarkerMode',
        'renderKmlList': 'loadMoreKmlPoints',
        'loadMoreKmlPoints': 'toggleGroup'
    }
    
    next_func = next_funcs.get(func_name)
    end_idx = -1
    
    if next_func:
        next_marker = f"function {next_func}"
        end_idx = content.find(next_marker, start_idx + len(start_marker))
    
    if end_idx == -1:
         # Fallback: look for window.toggleGroup if loadMoreKmlPoints
         if func_name == 'loadMoreKmlPoints':
             end_idx = content.find('function toggleGroup', start_idx + len(start_marker))
    
    if end_idx == -1:
        print(f"Could not find end of {func_name}")
        return content

    return content[:start_idx] + new_code + "\n\n" + content[end_idx:]

with open(file_path, 'r') as f:
    content = f.read()

content = replace_function(content, 'createCustomIcon', createCustomIcon_code)
content = replace_function(content, 'renderKmlList', renderKmlList_code)
content = replace_function(content, 'loadMoreKmlPoints', loadMoreKmlPoints_code)

with open(file_path, 'w') as f:
    f.write(content)

print(f"Successfully patched {file_path}")
