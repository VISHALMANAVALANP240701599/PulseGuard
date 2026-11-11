PULSEGUARD — LIVE ENVIRONMENT INTELLIGENCE

Files:
- index.html: page structure
- style.css: responsive dark UI
- script.js: live API calls, geocoding, recommendations, hourly forecast

Run:
1. Extract the ZIP.
2. Open the folder in VS Code.
3. Recommended: run index.html using the Live Server extension.
   (Geolocation works on localhost/HTTPS; city search works in a modern browser.)
4. Search for a city or use current location.

Tech:
- HTML, CSS, Vanilla JavaScript only
- Open-Meteo Geocoding API
- Open-Meteo Forecast API
- Open-Meteo Air Quality API

Notes:
- No backend or API key required.
- Data is fetched from public APIs and auto-refreshes every 10 minutes while the page stays open.
- This is an informational dashboard, not an official emergency or medical warning system.
