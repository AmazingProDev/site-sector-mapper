
import os

file_path = '/Users/abdelilah/.gemini/antigravity/scratch/unified-portal/site-sector-mapper/app.js'

new_code = """    // Group sites
    const groups = {};
    filteredSites.forEach(site => {
        const groupName = site.group || 'Other';
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(site);
    });

    // Render groups
    container.innerHTML = Object.keys(groups).sort().map(groupName => {
        const groupSites = groups[groupName];
        const groupId = `group-${groupName.replace(/\\s+/g, '-')}`;
        
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
                    ${groupSites.map(site => `
                        <div class="site-list-item" onclick="panToSite('${site.id}')">
                            <div class="site-info">
                                <div class="site-name">${site.name}</div>
                                <div class="site-coords">${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}</div>
                            </div>
                            <div class="site-actions">
                                <button class="btn-icon" onclick="editSite('${site.id}'); event.stopPropagation();" title="Edit Site">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                </button>
                                <button class="delete-btn" onclick="deleteSite('${site.id}'); event.stopPropagation();" title="Delete Site">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}
"""

with open(file_path, 'r') as f:
    lines = f.readlines()

# We want to replace lines 1800 to 1809 (inclusive of 1800, exclusive of 1810? No, 1809 is '}')
# Line 1800 is index 1799.
# Line 1809 is index 1808.
# We want to keep lines before 1800.
part1 = lines[:1799]

# We want to keep lines after 1809.
# Line 1810 starts with empty line, then 1811 is function renderKmlList...
# Let's verify where renderKmlList starts.
start_next_func = -1
for i in range(1800, len(lines)):
    if 'function renderKmlList' in lines[i]:
        start_next_func = i
        break

if start_next_func == -1:
    print("Error: Could not find renderKmlList function")
    exit(1)

# We want to insert before start_next_func.
# But we also want to consume the corrupted block.
# The corrupted block ends at 1809 in the view, but let's just say we replace everything from 1800 up to renderKmlList.
part2 = lines[start_next_func:]

final_content = "".join(part1) + new_code + "\n" + "".join(part2)

with open(file_path, 'w') as f:
    f.write(final_content)

print(f"Successfully patched {file_path}")
