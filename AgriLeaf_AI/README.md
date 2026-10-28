# AgriLeaf AI — Smart Farming Website Prototype

A responsive front-end prototype inspired by the feature categories on https://myagri.farm/:
- Leaf photo upload / phone camera capture
- Sample leaf screening report and downloadable text report
- My Farms, weather/irrigation, nutrient guide, yield planning, pest library and assistant placeholders
- Sample mandi-price dashboard (values are explicitly demo data)
- Official links for farmer schemes
- Mobile responsive layout

## Run it
1. Extract the ZIP.
2. Open `index.html` in Chrome, Edge or Firefox.
3. Use **Scan a Leaf** and upload a leaf image.

No Node.js installation is needed for this static prototype.

## Important limitations
**The leaf scan is a UI demonstration, not actual AI.** It does not analyze the pixels of the image and does not provide a real disease prediction or confidence score. The report is deliberately labelled as a demo. The mandi prices are sample values, not live market data. Weather, yield prediction, chat, account login, database, saved farm history and live market feeds are not connected.

## To make it production-ready
- Connect a plant disease model (for example, a validated crop-specific classifier) through a backend API.
- Add image validation, model confidence calibration, crop/location context, and an expert-confirmation flow.
- Add a backend/database for accounts, farms, scan history and report storage.
- Connect trusted weather and official mandi-price data sources.
- Use a secure server for AI API keys; never place secrets in `app.js`.
- Verify all crop-treatment advice against local agricultural authorities and product labels.

## Files
- `index.html` — page structure
- `style.css` — responsive styling
- `app.js` — upload preview, demo report, report download and prototype interactions

Built as an original prototype; it does not copy MyAgri's source code or branding.
