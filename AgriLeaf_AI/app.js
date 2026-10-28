const $ = id => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`AgriLeaf: missing element with id "${id}" — check index.html.`);
  return el;
};
function toast(message) {
  const el = $('toast'); el.textContent = message; el.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.hidden = true, 3500);
}

/* ============ LEAF SCANNER — real client-side image analysis ============ */
let selectedFile = null;
let previewUrl = null;
const revokePreviewUrl = () => { if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; } };
const input = $('leafInput'), preview = $('preview'), previewWrap = $('previewWrap'), analyzeBtn = $('analyzeBtn');
const dropZone = $('dropZone');
$('chooseBtn').addEventListener('click', () => input.click());

function handleFileSelected(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please choose an image file.'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('Image is too large. Please use an image under 10 MB.'); return; }
  selectedFile = file;
  revokePreviewUrl();
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  previewWrap.hidden = false;
  dropZone.classList.add('has-image');
  analyzeBtn.disabled = false;
}
input.addEventListener('change', () => handleFileSelected(input.files && input.files[0]));
$('removeBtn').addEventListener('click', () => {
  selectedFile = null; revokePreviewUrl(); preview.src = ''; previewWrap.hidden = true;
  analyzeBtn.disabled = true; dropZone.classList.remove('has-image');
});
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = '#228454'; });
dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = '');
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.style.borderColor = '';
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleFileSelected(file);
  else toast('Drop an image file to continue.');
});

/* Analyse the actual pixels: estimate the affected-leaf color profile with a
   canvas, then map colour clusters to likely symptom categories. This runs
   fully in the browser — no server, no API key, no demo data. */
function analyzeImagePixels(img) {
  const maxSide = 200;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const total = w * h;

  let healthy = 0, yellow = 0, brown = 0, darkSpot = 0, background = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const brightness = (r + g + b) / 3;
    if (brightness > 235 || brightness < 15) { background++; continue; } // sky / paper / black bg
    const isGreen = g > r * 1.05 && g > b * 1.05 && g > 40;
    const isYellow = r > 110 && g > 90 && b < g * 0.75 && r >= g * 0.75;
    const isBrown = r > 70 && r > g * 1.15 && g >= b * 0.9 && brightness < 165;
    const isDark = max < 75;
    if (isDark && r >= g) { darkSpot++; continue; }
    if (isBrown) { brown++; continue; }
    if (isYellow) { yellow++; continue; }
    if (isGreen) { healthy++; continue; }
  }
  const pct = n => Math.round((n / total) * 1000) / 10;
  return {
    healthy: pct(healthy), yellow: pct(yellow), brown: pct(brown),
    darkSpot: pct(darkSpot), background: pct(background)
  };
}

const SYMPTOM_LIBRARY = {
  healthy: {
    name: 'Leaf looks mostly healthy',
    desc: 'Most of the visible surface is green, which usually indicates a healthy leaf. Yellowing that has just started or symptoms on the underside may not show in this photo.',
    steps: ['Keep monitoring the crop and re-scan new leaves every few days.', 'Maintain regular irrigation and avoid wetting the foliage late in the day.', 'Confirm with your local agriculture officer if any spots appear later.']
  },
  yellow: {
    name: 'Chlorosis (yellowing) detected',
    desc: 'A noticeable share of the leaf area is yellow. Yellowing is commonly linked to nitrogen or micronutrient deficiency, water stress, or early-stage viral and fungal infection.',
    steps: ['Check whether yellowing starts on older or newer leaves — older first suggests nitrogen deficiency.', 'Review irrigation: both drought and waterlogging cause yellowing.', 'Consider a soil test (Soil Health Card) before adding fertilizer.', 'Show photos to a KVK or agriculture officer before applying any treatment.']
  },
  brown: {
    name: 'Necrotic / brown lesions detected',
    desc: 'Brown, dried patches cover part of the leaf. This pattern is typical of fungal or bacterial leaf spot and blight diseases, or of fertilizer burn and wind damage.',
    steps: ['Remove and destroy badly affected leaves; do not compost them near the field.', 'Avoid overhead irrigation — wet leaves spread leaf-spot pathogens.', 'Improve airflow between plants by maintaining recommended spacing.', 'Consult a local agriculture officer for an approved fungicide or bactericide if spreading.']
  },
  dark: {
    name: 'Dark spots / lesions detected',
    desc: 'Dark, low-brightness areas were found on the leaf. Concentric or irregular dark spots often indicate early or late blight, anthracnose, or severe bacterial infection.',
    steps: ['Photograph several affected leaves from different plants to compare patterns.', 'Check whether lesions have concentric rings (typical of early blight).', 'Remove severely infected plant parts and keep tools clean between plants.', 'Seek an in-person diagnosis from a KVK before any pesticide application.']
  }
};

const CROP_HINTS = {
  Tomato: 'Tomatoes are prone to early blight, late blight and leaf spot — brown lesions with concentric rings are a common early-blight sign.',
  Potato: 'Potato leaves with brown/dark patches may indicate early or late blight; act quickly in humid weather.',
  Wheat: 'Yellow-orange pustules on wheat suggest rust; yellowing of older leaves can indicate nitrogen deficiency.',
  Rice: 'Brown spots on rice leaves may be brown spot disease, often linked to nutrient-poor soil.',
  Maize: 'Grey-green leaf lesions that later turn brown suggest northern corn leaf blight.',
  Cotton: 'Reddish leaf margins in cotton often relate to nutrient imbalance or water stress.'
};

const STATE = { last: null };

function analyzeLeaf() {
  if (!selectedFile) return;
  const crop = $('crop').value, location = ($('location').value || '').trim() || 'Not provided';
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = '⏳ Analyzing image…';
  $('emptyReport').hidden = true;

  const img = new Image();
  img.onload = () => {
    let stats;
    try { stats = analyzeImagePixels(img); }
    catch (err) {
      resetAnalyzeBtn();
      toast('Could not read the image pixels. Try a different photo.');
      console.error(err);
      return;
    }
    resetAnalyzeBtn();
    const report = buildReport(stats, crop, location);
    renderReport(report);
    STATE.last = report;
    toast('Analysis complete — based on the actual image colors.');
  };
  img.onerror = () => { resetAnalyzeBtn(); toast('Could not load the image. Try re-uploading it.'); };
  img.src = previewUrl || URL.createObjectURL(selectedFile);
}
const resetAnalyzeBtn = () => { analyzeBtn.disabled = false; analyzeBtn.textContent = '🔎 Analyze Leaf'; };

function buildReport(s, crop, location) {
  // Pick the dominant symptom category (ignore pure background pixels).
  const candidates = [
    ['yellow', s.yellow], ['brown', s.brown], ['dark', s.darkSpot]
  ].sort((a, b) => b[1] - a[1]);
  const [key] = candidates[0];
  const affected = Math.round((s.yellow + s.brown + s.darkSpot) * 10) / 10;
  const base = affected < 6 ? SYMPTOM_LIBRARY.healthy : SYMPTOM_LIBRARY[key];
  const confidence = Math.min(86, 55 + Math.round(affected)); // heuristic, not an ML score
  const hint = CROP_HINTS[crop] || 'Compare symptoms across several plants before drawing conclusions.';
  return {
    severity: affected < 6 ? 'Healthy' : affected < 20 ? 'Moderate' : 'High',
    severityLevel: affected < 6 ? 'ok' : affected < 20 ? 'warn' : 'bad',
    name: base.name,
    desc: base.desc,
    hint,
    affectedPct: affected,
    greenPct: s.healthy,
    lesionPct: s.brown,
    confidence,
    crop, location,
    date: new Date().toLocaleDateString(),
    steps: base.steps
  };
}

function renderReport(r) {
  $('reportContent').hidden = false;
  $('reportTitle').textContent = 'Leaf screening result';
  $('reportStatus').textContent = r.severity;
  $('reportStatus').className = 'report-status ' + r.severityLevel;
  $('diseaseName').textContent = r.name;
  $('diseaseDescription').textContent = r.desc;
  $('confidenceValue').textContent = r.confidence + '%';
  $('affectedValue').textContent = r.affectedPct + '%';
  $('greenValue').textContent = r.greenPct + '%';
  $('lesionValue').textContent = Math.round((r.lesionPct ?? 0) * 10) / 10 + '%';
  $('reportCrop').textContent = r.crop;
  $('reportLocation').textContent = r.location;
  $('reportDate').textContent = r.date;
  $('cropHint').textContent = r.hint;
  $('stepsList').innerHTML = '';
  r.steps.forEach(step => { const li = document.createElement('li'); li.textContent = step; $('stepsList').appendChild(li); });
  $('reportPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
}
analyzeBtn.addEventListener('click', analyzeLeaf);

$('downloadBtn').addEventListener('click', () => {
  if ($('reportContent').hidden) { toast('Create a report first, then download it.'); return; }
  const r = STATE.last;
  const content = [
    'AGRILEAF AI — LEAF SCREENING REPORT',
    'Crop: ' + r.crop,
    'Location: ' + r.location,
    'Date: ' + r.date,
    'Result: ' + r.name + ' (severity: ' + r.severity + ')',
    'Notes: ' + r.desc,
    'Leaf area analysed: ' + r.affectedPct + '% affected / ' + r.greenPct + '% green',
    'Heuristic confidence: ' + r.confidence + '%',
    'Crop note: ' + r.hint,
    '',
    'Recommended next steps:',
    ...r.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    'Safety: This is a colour-based screening, not a laboratory diagnosis.',
    'Confirm with a qualified local agriculture expert before applying pesticides or other treatments.'
  ].join('\r\n');
  const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'agrileaf-screening-report.txt'; a.click(); URL.revokeObjectURL(url);
});
$('newScanBtn').addEventListener('click', () => {
  $('removeBtn').click(); $('reportContent').hidden = true; $('emptyReport').hidden = false;
  $('reportTitle').textContent = 'Ready when you are'; $('reportStatus').textContent = 'Waiting';
  $('reportStatus').className = 'report-status';
});

/* ============ WEATHER — live data from Open-Meteo (free, no API key) ============ */
const weatherBtn = $('weatherBtn');
weatherBtn.addEventListener('click', async () => {
  const place = ($('weatherLocation').value || '').trim();
  if (!place) { toast('Type your village or district first.'); return; }
  $('weatherPanel').hidden = false;
  $('weatherBody').textContent = 'Loading weather for ' + place + '…';
  try {
    const geo = await fetchJson('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(place));
    if (!geo.results || !geo.results.length) throw new Error('place-not-found');
    const g = geo.results[0];
    const w = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}` +
      '&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&forecast_days=3&timezone=auto'
    );
    renderWeather(g, w);
  } catch (err) {
    $('weatherBody').textContent = err.message === 'place-not-found'
      ? 'Could not find that place. Try a nearby town or district name (e.g. "Ludhiana").'
      : 'Weather service is unreachable right now. Check your internet connection and try again.';
    console.error(err);
  }
});
$('weatherUseScanLocation').addEventListener('click', () => {
  const scanLoc = ($('location').value || '').trim();
  if (!scanLoc) { toast('No location from your scan — type one above.'); return; }
  $('weatherLocation').value = scanLoc;
  weatherBtn.click();
});
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('http-' + res.status);
  return res.json();
}
const WEATHER_CODES = {
  0:['Clear sky','☀️'],1:['Mainly clear','🌤️'],2:['Partly cloudy','⛅'],3:['Overcast','☁️'],
  45:['Fog','🌫️'],48:['Depositing rime fog','🌫️'],51:['Light drizzle','🌦️'],53:['Drizzle','🌦️'],55:['Dense drizzle','🌧️'],
  61:['Light rain','🌦️'],63:['Rain','🌧️'],65:['Heavy rain','🌧️'],66:['Freezing rain','🌧️'],67:['Freezing rain','🌧️'],
  71:['Light snow','🌨️'],73:['Snow','🌨️'],75:['Heavy snow','❄️'],77:['Snow grains','🌨️'],
  80:['Rain showers','🌦️'],81:['Rain showers','🌦️'],82:['Violent rain showers','⛈️'],
  85:['Snow showers','🌨️'],86:['Snow showers','🌨️'],95:['Thunderstorm','⛈️'],96:['Thunderstorm, hail','⛈️'],99:['Thunderstorm, hail','⛈️']
};
const weatherText = code => (WEATHER_CODES[code] || ['Unknown','🌡️']);
function renderWeather(g, w) {
  const [curText, curIcon] = weatherText(w.current.weather_code);
  const c = w.current;
  const days = w.daily;
  const irrigation = c.precipitation > 0.5
    ? '🌧 Rain is falling — pause irrigation today and check field drainage.'
    : c.relative_humidity_2m > 80
      ? '💧 Very humid — avoid overhead watering to reduce fungal disease risk.'
      : c.temperature_2m > 33
        ? '🌡 Hot and dry — irrigate early morning or evening to reduce evaporation loss.'
        : '✅ Conditions look suitable for normal irrigation scheduling.';
  const rows = days.time.map((t, i) => {
    const [txt, icon] = weatherText(days.weather_code[i]);
    return `<tr><td>${new Date(t).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}</td>
      <td>${icon} ${txt}</td><td>${Math.round(days.temperature_2m_min[i])}–${Math.round(days.temperature_2m_max[i])}°C</td>
      <td>${days.precipitation_sum[i] ?? 0} mm</td></tr>`;
  }).join('');
  $('weatherBody').innerHTML = `
    <div class="weather-now">
      <div><small>${g.name}${g.admin1 ? ', ' + g.admin1 : ''}</small>
      <b>${curIcon} ${Math.round(c.temperature_2m)}°C — ${curText}</b></div>
      <div class="weather-chips">
        <span>💧 ${c.relative_humidity_2m}% humidity</span>
        <span>🌬 ${Math.round(c.wind_speed_10m)} km/h wind</span>
        <span>🌧 ${c.precipitation ?? 0} mm rain now</span>
      </div>
    </div>
    <table class="weather-table"><thead><tr><th>Day</th><th>Sky</th><th>Temp</th><th>Rain</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="weather-tip"><b>Irrigation advice:</b> ${irrigation}</p>`;
}
$('weatherLocation').addEventListener('keydown', e => { if (e.key === 'Enter') weatherBtn.click(); });

/* ============ NUTRIENT GUIDE — interactive deficiency reference ============ */
const NUTRIENTS = {
  Nitrogen: {
    sign: 'Older, lower leaves turn uniformly yellow first; growth is stunted and plants look pale.',
    fix: 'Apply a nitrogen-rich fertilizer (e.g. urea) in the dose recommended by your soil-health report; split into 2–3 doses instead of one heavy application.',
    crops: 'All crops, especially leafy vegetables, maize and rice.'
  },
  Phosphorus: {
    sign: 'Leaves darken to a purple or reddish tint, especially underneath; roots develop poorly and flowering is delayed.',
    fix: 'Apply single super phosphate or DAP at sowing time, ideally placed near the seed band for young plants.',
    crops: 'Wheat, pulses, oilseeds at early growth stage.'
  },
  Potassium: {
    sign: 'Leaf edges turn yellow then brown and look scorched, starting on older leaves; stems weaken.',
    fix: 'Apply muriate of potash (MOP); add ash from crop residue where appropriate and avoid excessive nitrogen.',
    crops: 'Potato, banana, sugarcane, tomato — high-demand crops.'
  },
  Calcium: {
    sign: 'New growth deforms; blossom-end rot on tomato and pepper fruit; young leaves hook and die at tips.',
    fix: 'Apply gypsum or lime based on soil pH; keep watering even and steady — irregular water uptake is a major cause.',
    crops: 'Tomato, pepper, cabbage, cauliflower.'
  },
  Magnesium: {
    sign: 'Yellow patches between the green veins of older leaves (interveinal chlorosis) with green veins remaining.',
    fix: 'Apply magnesium sulphate (Epsom salt) as a soil dose or foliar spray; check that pH is not too acidic.',
    crops: 'Cotton, citrus, banana, maize.'
  },
  Iron: {
    sign: 'Youngest leaves turn yellow between veins while veins stay green; the whole plant may look pale if severe.',
    fix: 'Foliar spray of iron sulphate gives the fastest response; correct waterlogging and high lime soil first.',
    crops: 'Chickpea, groundnut, and crops on alkaline soils.'
  },
  Zinc: {
    sign: 'Middle leaves show rusty blotches and shortened internodes; khaira disease in rice seedlings.',
    fix: 'Apply zinc sulphate to soil or as a 0.5% foliar spray; common after heavy phosphorus application.',
    crops: 'Rice, maize, wheat on sandy or calcareous soil.'
  }
};
$('nutrientSelect').addEventListener('change', () => {
  const key = $('nutrientSelect').value;
  const n = NUTRIENTS[key];
  $('nutrientDetail').hidden = !n;
  if (!n) return;
  $('nutrientDetail').innerHTML = `
    <h3>${key} deficiency</h3>
    <p><b>What you see:</b> ${n.sign}</p>
    <p><b>What to do:</b> ${n.fix}</p>
    <p><b>Most affected crops:</b> ${n.crops}</p>
    <p class="muted">Always confirm with a soil test (Soil Health Card) before changing your fertilizer schedule.</p>`;
});

/* ============ Other feature cards ============ */
document.querySelectorAll('[data-feature]').forEach(button => button.addEventListener('click', () => {
  const name = button.dataset.feature;
  const messages = {
    'My Farms': 'My Farms: this prototype does not save farm data yet. A full version would store farm name, plot area, crop, sowing date and scan history.',
    'Weather & Irrigation': 'Scroll up to the live Weather panel in the Leaf Scanner section — it uses real forecast data from Open-Meteo.',
    'Nutrient Guide': 'Use the Nutrient Guide panel above the tool list — select a nutrient to see deficiency signs and corrective action.',
    'Yield Planning': 'Yield planning: add crop, field area, sowing date and historical harvest records to build a useful estimate.',
    'Pest & Disease Library': 'Disease library: a production version should include verified crop-specific references and locally approved management advice.',
    'Agri Assistant': 'Agri Assistant: add a securely hosted AI API to enable conversational crop support. Do not put private API keys in frontend files.'
  };
  toast(messages[name] || 'This tool is a prototype placeholder.');
}));
$('language').addEventListener('change', e => {
  if (e.target.value === 'hi') toast('हिन्दी भाषा विकल्प अभी जोड़ा नहीं गया है।');
  else toast('English selected.');
});
