const { JSDOM } = require("jsdom");
const { window } = new JSDOM(`<!DOCTYPE html>`);
global.DOMParser = window.DOMParser;

function parseKml(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    const parsedPoints = [];

    function getElementsByLocalName(parent, localName) {
        const result = [];
        const all = parent.getElementsByTagName("*");
        for (let i = 0; i < all.length; i++) {
            if (all[i].localName === localName) {
                result.push(all[i]);
            }
        }
        return result;
    }

    function getText(el, tag) {
        const found = getElementsByLocalName(el, tag);
        return found.length > 0 ? found[0].textContent.trim() : "";
    };

    for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i];
        const name = getText(placemark, "name");

        const customProperties = [];

        // Handle <Data> tags
        const dataElements = getElementsByLocalName(placemark, "Data");
        for (let j = 0; j < dataElements.length; j++) {
            const dataEl = dataElements[j];
            const key = dataEl.getAttribute("name");
            const value = getText(dataEl, "value");
            if (key && value) {
                customProperties.push({ name: key, value: value });
            }
        }

        // Handle <SimpleData> tags
        const simpleDataElements = getElementsByLocalName(placemark, "SimpleData");
        for (let j = 0; j < simpleDataElements.length; j++) {
            const dataEl = simpleDataElements[j];
            const key = dataEl.getAttribute("name");
            const value = dataEl.textContent.trim();
            if (key && value) {
                customProperties.push({ name: key, value: value });
            }
        }

        // 4. Parse HTML Table in Description
        const description = getText(placemark, "description");
        if (description && description.includes('<table')) {
            try {
                const parser = new DOMParser();
                const htmlDoc = parser.parseFromString(description, 'text/html');
                const rows = htmlDoc.getElementsByTagName('tr');

                for (let j = 0; j < rows.length; j++) {
                    const cells = rows[j].getElementsByTagName('td');
                    if (cells.length >= 2) {
                        let key = cells[0].textContent.trim().replace(/:$/, ''); // Remove trailing colon
                        let value = cells[1].textContent.trim();

                        if (key && value) {
                            if (!customProperties.some(p => p.name === key)) {
                                customProperties.push({ name: key, value: value });
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('Error parsing HTML description:', e);
            }
        }

        // 5. Parse Text-based Key-Value pairs (e.g. "Key = Value<br>")
        if (description) {
            // Remove HTML tags to get clean text for regex matching if needed
            // But we can also split by <br> which is common
            const textLines = description.split(/<br\s*\/?>/i);
            textLines.forEach(line => {
                // Simple Split by '='
                // We need to be careful not to split attributes inside HTML tags if mixed
                // But the user sample shows clean lines: "Site ID = CoMPT..."

                // Regex to match "Key = Value" where Key and Value don't contain < or > (to avoid HTML tags)
                // And ignore lines that look like HTML tags
                if (line.trim().startsWith('<')) return;

                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    // Join the rest in case value has =
                    const value = parts.slice(1).join('=').trim();

                    // Validate
                    if (key && value) {
                        // Check if already exists
                        if (!customProperties.some(p => p.name === key)) {
                            customProperties.push({ name: key, value: value });
                        }
                    }
                }
            });
        }

        parsedPoints.push({
            name,
            customProperties
        });
    }

    return parsedPoints;
}

// Test Case 3: Namespaced Data
const kml3 = `
<kml xmlns:gx="http://www.google.com/kml/ext/2.2">
<Placemark>
  <name>Point 3</name>
  <ExtendedData>
    <gx:Data name="Categorized RSCP">
      <gx:value>A3</gx:value>
    </gx:Data>
  </ExtendedData>
</Placemark>
</kml>
`;

// Test Case 4: HTML Table in Description
const kml4 = `
<kml>
<Placemark>
  <name>Point 4</name>
  <description>
    <![CDATA[
      <table border=0 style='font-size: 12px; width: 200px;'>
        <tr><td>RSRP (dBm):</td> <td><p align=right>-85</p></td></tr>
        <tr><td>Cinr (dB):</td> <td><p align=right>12</p></td></tr>
      </table>
    ]]>
  </description>
</Placemark>
</kml>
`;

console.log("\nTesting HTML Table in Description:");
console.log(JSON.stringify(parseKml(kml4), null, 2));


// Test Case 5: Text-based Key-Value Pairs in Description
const kml5 = `
<kml>
<Placemark>
    <name>Point 5</name>
    <description>
<![CDATA[
<b>CoMPT_RAB_GAREAGDALBIS</b>
<hr>
<b>VENDOR</b>
<br>
<br>
<img src='http://www.xconomy.com/wordpress/wp-content/images/2011/11/question-mark-stockimage.jpg' width=100><br>
<hr>
<b>INFORMATION</b>
<br>
<br>
Site ID = CoMPT_RAB_GAREAGDALBIS<br>
Site Name = CoMPT_RAB_GAREAGDALBIS<br>
GPS Lat = 34.001503<br>
Serving Cell RSRP (dBm) = -90,6999969482422<br>
<hr>]]>
    </description>
</Placemark>
</kml>
`;

console.log("\nTesting Text Attributes in Description:");
console.log(JSON.stringify(parseKml(kml5), null, 2));
