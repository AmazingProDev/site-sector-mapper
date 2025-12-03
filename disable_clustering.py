
import os

file_path = '/Users/abdelilah/.gemini/antigravity/scratch/unified-portal/site-sector-mapper/app.js'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add pointsLayer to global state
if "let pointsLayer = null;" not in content:
    content = content.replace("let markersLayer = null;", "let markersLayer = null;\nlet pointsLayer = null;")

# 2. Initialize pointsLayer in initializeMap
# Look for markersLayer initialization
init_marker = "markersLayer = L.markerClusterGroup({"
if "pointsLayer = L.layerGroup().addTo(map);" not in content:
    # We want to add it after markersLayer is added to map
    # markersLayer is usually added with .addTo(map) or map.addLayer(markersLayer)
    # Let's find where markersLayer is initialized and add pointsLayer after it.
    
    # Find the end of markersLayer initialization
    idx = content.find(init_marker)
    if idx != -1:
        # Find the closing });
        end_idx = content.find("});", idx)
        if end_idx != -1:
            # Add pointsLayer init after that
            insertion = "\n    map.addLayer(markersLayer);\n\n    // Initialize points layer (unclustered)\n    pointsLayer = L.layerGroup().addTo(map);"
            # Check if map.addLayer(markersLayer) is already there
            if "map.addLayer(markersLayer)" not in content and "markersLayer.addTo(map)" not in content:
                 # It seems it wasn't explicitly added in the snippet I saw? 
                 # Wait, looking at previous view, it was just initialized.
                 # Let's check if it's added later.
                 pass
            
            # Let's just append it after the block
            content = content[:end_idx+3] + insertion + content[end_idx+3:]

# 3. Update updateMapMarkers to use pointsLayer
# We need to find where points are processed.
# "points.forEach(point => {"
# Inside that loop, we have "markersLayer.addLayer(marker);"
# We need to change that to "pointsLayer.addLayer(marker);"

# We also need to clear pointsLayer at start of function
if "pointsLayer.clearLayers();" not in content:
    content = content.replace("markersLayer.clearLayers();", "markersLayer.clearLayers();\n    if (pointsLayer) pointsLayer.clearLayers();")

# Replace addLayer for points
# We need to be careful not to replace it for sites.
# The points loop starts with "points.forEach(point => {"
# We can use a regex or just string replacement if unique enough.
# The points loop has "const customIcon = createCustomIcon(point);"
# And ends with "markersLayer.addLayer(marker);"

# Let's find the points loop
start_loop = "points.forEach(point => {"
idx_loop = content.find(start_loop)
if idx_loop != -1:
    # Find the addLayer call inside this loop
    # It should be the next markersLayer.addLayer(marker) after start_loop
    idx_add = content.find("markersLayer.addLayer(marker);", idx_loop)
    if idx_add != -1:
        content = content[:idx_add] + "pointsLayer.addLayer(marker);" + content[idx_add + len("markersLayer.addLayer(marker);"):]

# 4. Update panToSite to handle pointsLayer
# We need to modify panToSite to check pointsLayer.
# Current panToSite checks markersLayer.
# We can add a check for pointsLayer.

pan_func = """function panToSite(id) {
    const site = sites.find(s => s.id === id);
    const point = points.find(p => p.id === id);
    
    const target = site || point;
    if (!target) return;

    // Check if it's a point (unclustered)
    if (point) {
        const marker = pointsLayer.getLayers().find(l => l.options.pointId === id);
        if (marker) {
            map.setView(marker.getLatLng(), 18);
            marker.openPopup();
            
            // Highlight
            const icon = marker.getElement();
            if (icon) {
                icon.classList.add('highlight-marker');
                setTimeout(() => icon.classList.remove('highlight-marker'), 2000);
            }
            return;
        }
    }

    // It's a site (clustered)
    if (site) {
        // Zoom to site
        // map.setView([site.latitude, site.longitude], 18); // Removed to avoid conflict

        // Find and open popup
        let markerFound = false;
        
        markersLayer.eachLayer(layer => {
            // Check if it's a cluster
            if (layer instanceof L.MarkerCluster) {
                const markers = layer.getAllChildMarkers();
                const marker = markers.find(m => m.options.siteId === id);
                if (marker) {
                    markersLayer.zoomToShowLayer(marker, () => {
                        marker.openPopup();
                    });
                    markerFound = true;
                }
            } else if (layer.options.siteId === id) {
                 markersLayer.zoomToShowLayer(layer, () => {
                    layer.openPopup();
                 });
                 markerFound = true;
            }
        });
    }
}"""

# Replace existing panToSite
# Find start of panToSite
start_pan = "function panToSite(id) {"
idx_pan = content.find(start_pan)
if idx_pan != -1:
    # Find end of function (heuristic: next function or end of file)
    # We can just replace the whole function if we know what it looks like, 
    # but since we modified it before, let's just use the start and find the matching closing brace?
    # Or just replace until "function locateSite" or similar?
    
    # Let's try to find the next function
    next_func = "function locateSite" # heuristic
    idx_next = content.find(next_func, idx_pan)
    if idx_next != -1:
        content = content[:idx_pan] + pan_func + "\n\n" + content[idx_next:]
    else:
        # Maybe it's at the end?
        # Let's count braces to be safe? No, that's hard with regex.
        # Let's just assume it ends before "window.panToSite =" if it's near end?
        pass

with open(file_path, 'w') as f:
    f.write(content)

print("Clustering disabled for points.")
