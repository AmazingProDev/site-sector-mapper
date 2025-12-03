# Site Sector Mapper

A modern web application for creating, managing, and visualizing telecom sites with sectors. Features interactive mapping, multiple import methods, and KML export capabilities.

![Site Sector Mapper](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- 🗺️ **Interactive Map** - Leaflet.js-powered map with pan, zoom, and clustering
- 📍 **Sector Visualization** - Display directional sectors with azimuth, beamwidth, and range
- ✏️ **Manual Entry** - Create sites with dynamic sector forms
- ✏️ **Edit & Update** - Modify existing sites and sectors
- 📁 **CSV Import** - Bulk import sites from CSV files with preview
- 🔗 **Airtable Integration** - Connect to Airtable databases
- 📤 **KML Export** - Export sites to Google Earth-compatible format
- 💾 **Data Persistence** - Automatic local storage
- 🔍 **Search & Filter** - Find sites quickly
- � **Locate Site** - Instantly center map on specific sites
- 👁️ **Visibility Controls** - Toggle site and sector labels
- �🎨 **Modern UI** - Dark theme with glassmorphism effects

## Quick Start

1. **Clone or download** this repository
2. **Start a local server:**

   ```bash
   python3 -m http.server 8080
   ```

3. **Open your browser** to `http://localhost:8080`

## Usage

### Manual Site Entry

1. Click the **Manual** tab
2. Fill in site details (name, latitude, longitude)
3. Click **Add Sector** to add sector information
4. Fill sector fields:
   - **Basic:** Azimuth, Beamwidth, Range
   - **Visual:** Sector Name, Color, Opacity
   - **Tech:** Technology, Frequency
5. Click **Add Site**

### CSV Import

Create a CSV file with the following format:

```csv
site_name,latitude,longitude,description,azimuth,beamwidth,range,technology,frequency
Tower1,33.5731,-7.5898,Main tower,0,65,500,5G,3500 MHz
Tower1,33.5731,-7.5898,Main tower,120,65,500,5G,3500 MHz
```

**Note:** Multiple rows with the same `site_name` will create one site with multiple sectors.

1. Click the **CSV Import** tab
2. Drag and drop your CSV file or click **Browse Files**
3. Review the preview
4. Click **Import Sites**

A sample CSV file is included: `sample_sites.csv`

### Airtable Integration

1. Click the **Airtable** tab
2. Enter your:
   - API Key or Personal Access Token
   - Base ID (starts with "app...")
   - Table Name
3. Click **Fetch from Airtable**

**Required Airtable Fields:**

- `name` or `site_name` - Site name
- `latitude` or `lat` - Latitude
- `longitude`, `lng`, or `lon` - Longitude
- `description` (optional) - Description
- `sectors` (optional) - JSON array of sector objects
- **OR** use one row per sector (multiple rows with same site name) including sector-specific fields (`azimuth`, `color`, etc.)

### KML Export

1. Add sites using any method
2. Click **Export KML** in the header
3. File downloads as `sites_YYYY-MM-DD.kml`
4. Open in Google Earth or any GIS software

## Sector Properties

Each sector can have the following properties:

- **Azimuth** (0-360°) - Direction the sector faces
- **Beamwidth** (degrees) - Coverage angle
- **Range** (meters) - Coverage distance
- **Technology** - e.g., 5G, 4G, LTE, 3G
- **Frequency** - e.g., 3500 MHz, 2100 MHz
- **Visuals** - Custom Color and Opacity

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript
- **Mapping:** Leaflet.js v1.9.4
- **Clustering:** Leaflet.markercluster
- **CSV Parsing:** Papa Parse v5.4.1
- **Storage:** Browser localStorage
- **API:** Fetch API for Airtable

## File Structure

```
site-sector-mapper/
├── index.html          # Main application file
├── style.css           # Design system and styles
├── app.js              # Application logic
├── sample_sites.csv    # Sample data for testing
└── README.md           # This file
```

## Browser Compatibility

Works on all modern browsers:

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

## Features in Detail

### Map Visualization

- Interactive pan and zoom
- Marker clustering for performance
- Sector polygons showing coverage
- Color-coded by technology:
  - 💜 5G - Purple
  - 💙 4G/LTE - Blue
  - 💚 3G - Green
  - 🧡 2G - Orange
  - 💗 Other - Pink
- **Visibility Toggles**: Show/hide site and sector labels
- **Locate Feature**: Click the target icon in the site list to fly to a site

### Data Management

- **Search** - Filter sites by name
- **View Details** - Click any site for full information
- **Delete** - Remove individual sites
- **Clear All** - Reset all data
- **Auto-save** - Data persists in browser localStorage

### Export Format

KML files include:

- Site locations as placemarks
- Sector details in descriptions
- Custom styling and icons
- Compatible with Google Earth, ArcGIS, QGIS

## Tips

- **Add Multiple Sectors:** Click "Add Sector" multiple times for sites with multiple antennas
- **CSV Format:** Ensure your CSV has headers matching the expected format
- **Airtable Setup:** Generate a Personal Access Token in Airtable settings for better security
- **Map Navigation:** Use scroll to zoom, drag to pan, click markers for details
- **Data Backup:** Export to KML regularly to backup your data

## Troubleshooting

**Map not loading?**

- Check your internet connection (tiles load from OpenStreetMap)
- Open browser console (F12) to see any errors

**CSV import not working?**

- Verify CSV format matches the expected structure
- Ensure latitude/longitude are valid numbers
- Check file encoding (should be UTF-8)

**Airtable connection fails?**

- Verify your API key is correct
- Check Base ID starts with "app"
- Ensure table name matches exactly (case-sensitive)
- Verify your API key has read permissions

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues or questions, please check the walkthrough documentation included with this project.

---

Built with ❤️ using modern web technologies
