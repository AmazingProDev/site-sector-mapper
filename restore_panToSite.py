
import os

file_path = '/Users/abdelilah/.gemini/antigravity/scratch/unified-portal/site-sector-mapper/app.js'

missing_code = """
function panToSite(id) {
    const site = sites.find(s => s.id === id);
    if (!site) return;

    // Zoom to site
    map.setView([site.latitude, site.longitude], 18);

    // Find and open popup
    // We need to find the marker in the markersLayer
    let markerFound = false;
    
    markersLayer.eachLayer(layer => {
        // Check if it's a cluster
        if (layer instanceof L.MarkerCluster) {
            const markers = layer.getAllChildMarkers();
            const marker = markers.find(m => m.options.title === site.name || (m.getPopup() && m.getPopup().getContent().includes(site.name)));
            if (marker) {
                markersLayer.zoomToShowLayer(marker, () => {
                    marker.openPopup();
                });
                markerFound = true;
            }
        } else if (layer.getPopup && layer.getPopup()) {
             // Standard marker (not clustered or already expanded)
             // This check is a bit weak, relying on content. Ideally we'd store ID on marker.
             // But let's try to match by location if ID isn't available
             const latLng = layer.getLatLng();
             if (Math.abs(latLng.lat - site.latitude) < 0.00001 && Math.abs(latLng.lng - site.longitude) < 0.00001) {
                 markersLayer.zoomToShowLayer(layer, () => {
                    layer.openPopup();
                 });
                 markerFound = true;
             }
        }
    });

    // If not found in cluster (maybe it's a single marker in the group), try iterating directly
    if (!markerFound) {
        markersLayer.eachLayer(layer => {
             const latLng = layer.getLatLng();
             if (latLng && Math.abs(latLng.lat - site.latitude) < 0.00001 && Math.abs(latLng.lng - site.longitude) < 0.00001) {
                 map.setView(latLng, 18);
                 layer.openPopup();
                 markerFound = true;
             }
        });
    }
}
"""

with open(file_path, 'r') as f:
    content = f.read()

# Find insertion point - let's put it before locateSite
marker = "function locateSite"
idx = content.find(marker)

if idx != -1:
    new_content = content[:idx] + missing_code + "\n\n" + content[idx:]
    with open(file_path, 'w') as f:
        f.write(new_content)
    print(f"Successfully restored panToSite in {file_path}")
else:
    # Fallback: append to end if locateSite not found (unlikely since we just restored it)
    print("Error: Could not find insertion marker 'function locateSite'")
