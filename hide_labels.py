
import os
import re

file_path = '/Users/abdelilah/.gemini/antigravity/scratch/unified-portal/site-sector-mapper/app.js'

with open(file_path, 'r') as f:
    content = f.read()

# Remove the label div from createCustomIcon
# Pattern: <div class="site-marker-label" ...>${site.name}</div>
# We can just replace it with empty string or comment it out.

# The label div looks like:
# <div class="site-marker-label" style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%);">${site.name}</div>

# We'll use regex to be safe about spacing
pattern = r'<div class="site-marker-label"[^>]*>\${site\.name}</div>'

# Check if it exists
if re.search(pattern, content):
    content = re.sub(pattern, '', content)
    print("Labels removed from createCustomIcon")
else:
    print("Could not find label pattern in createCustomIcon")

with open(file_path, 'w') as f:
    f.write(content)
