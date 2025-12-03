
import os
import re

file_path = '/Users/abdelilah/.gemini/antigravity/scratch/unified-portal/site-sector-mapper/app.js'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Remove duplicate updateMapMarkers (the first one, around line 977)
# It starts with "function updateMapMarkers" and ends before "function handleMeasureClick" or similar.
# We'll use a regex or string search.
start_marker = "function updateMapMarkers(options = { fitBounds: true }) {"
end_marker = "function handleMeasureClick(latlng) {"

# Find the first occurrence
idx1 = content.find(start_marker)
if idx1 != -1:
    # Find the second occurrence to make sure we delete the first one
    idx2 = content.find(start_marker, idx1 + 1)
    if idx2 != -1:
        # We have duplicates. Delete the first one.
        # Find where it ends. It seems to be followed by handleMeasureClick in the first block?
        # Actually, looking at the file view, the first one is around line 977.
        # The next function seems to be handleMeasureClick around line 1050?
        # Let's look for the closing brace before the next function.
        
        # Heuristic: The first one is the "dead" one.
        # It seems to end around line 1018 based on previous view, but let's be careful.
        # It is followed by "function handleMeasureClick" in the file view?
        # No, handleMeasureClick is usually later.
        # Let's just comment it out or remove it if we can identify it precisely.
        
        # Alternative: The second one is at line 1487.
        # We can just remove the first instance.
        pass

# 2. Update importKmlData to use points
# Search for "sites.push(...newSites);" and change to "points.push(...newSites);"
# Search for "type: 'kml_point'," and change to "type: 'kml_point'," (keep type, but maybe change group?)
# Actually, we need to change how newSites is created or just where it's pushed.

import_kml_pattern = r"sites\.push\(\.\.\.newSites\);"
content = re.sub(import_kml_pattern, "points.push(...newSites);", content)

# Update console log
content = content.replace("Added to global sites. Total sites: ${sites.length}", "Added to global points. Total points: ${points.length}")

# 3. Update renderKmlList to use points
# Change "const kmlSites = sites.filter" to "const kmlSites = points.filter"
content = content.replace("const kmlSites = sites.filter(site => site.type === 'kml_point'", "const kmlSites = points.filter(site => site.type === 'kml_point'")

# 4. Update loadMoreKmlPoints to use points
# Change "const kmlSites = sites.filter" to "const kmlSites = points.filter"
content = content.replace("const kmlSites = sites.filter(site => site.type === 'kml_point');", "const kmlSites = points.filter(site => site.type === 'kml_point');")

# 5. Remove the duplicate updateMapMarkers function
# We will identify it by its content which is different from the second one.
# The first one has "if (site.type === 'kml_point')" inside it.
# The second one does NOT have that check inside the sites loop.

# We'll split the file, find the function with that specific check, and remove it.
lines = content.split('\n')
new_lines = []
skip = False
skip_count = 0
found_duplicate = False

for i, line in enumerate(lines):
    if "function updateMapMarkers(options = { fitBounds: true }) {" in line:
        # Check if this is the one with kml_point check
        # Look ahead a few lines
        is_duplicate = False
        for j in range(1, 20):
            if i + j < len(lines) and "if (site.type === 'kml_point')" in lines[i+j]:
                is_duplicate = True
                break
        
        if is_duplicate:
            skip = True
            found_duplicate = True
            # print("Found duplicate updateMapMarkers at line", i)
    
    if skip:
        # We need to find the end of the function.
        # This is tricky with simple line iteration.
        # Let's assume it ends before the next function definition or a specific marker.
        # In the file view, it seems to be followed by "function handleMeasureClick" or similar?
        # Actually, let's just use the fact that we know the second one exists.
        # If we are skipping, we stop skipping when we hit the next function?
        # Or we can count braces?
        
        # Let's count braces
        open_braces = line.count('{')
        close_braces = line.count('}')
        skip_count += (open_braces - close_braces)
        
        if skip_count == 0 and open_braces == 0 and close_braces == 0:
             # This handles empty lines, but we started with skip_count=0?
             # No, the first line has {.
             pass
        elif skip_count == 0:
            skip = False
            # print("End of duplicate function at line", i)
            continue # Don't add the last closing brace line either? Or do?
            # If skip_count is 0, we just closed the function.
            # So we should not add this line.
    
    if not skip:
        new_lines.append(line)

content = '\n'.join(new_lines)

# 6. Ensure points are saved/loaded
# Check saveToLocalStorage
# It already has: localStorage.setItem('siteSectorMapper_points', JSON.stringify(points));
# Check loadFromLocalStorage
# It already has: const storedPoints = localStorage.getItem('siteSectorMapper_points');

# 7. Update clearAllSites
# It already clears points: if (typeof points !== 'undefined') points = [];

# 8. One more fix: renderKmlList logs "Total sites: ${sites.length}" -> change to points
content = content.replace("Total sites: ${sites.length})", "Total points: ${points.length})")

with open(file_path, 'w') as f:
    f.write(content)

print("Refactoring complete.")
