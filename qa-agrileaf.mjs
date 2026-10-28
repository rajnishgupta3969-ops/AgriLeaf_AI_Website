export default async function run(page, ui) {
  const results = {};

  // 1. Scan: inject a synthetic yellow leaf image directly into the pipeline.
  results.scan = await page.evaluate(async () => {
    // Build a test leaf image on a canvas: mostly green with a big yellow blotch
    const c = document.createElement('canvas'); c.width = 100; c.height = 100;
    const x = c.getContext('2d');
    x.fillStyle = '#3a7d2c'; x.fillRect(0, 0, 100, 100);
    x.fillStyle = '#d8c93a'; x.fillRect(15, 15, 70, 70); // large yellow lesion
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const file = new File([blob], 'leaf.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    document.getElementById('leafInput').files = dt.files;
    document.getElementById('leafInput').dispatchEvent(new Event('change'));
    document.getElementById('analyzeBtn').click();
    await new Promise(r => setTimeout(r, 300));
    return {
      status: document.getElementById('reportStatus').textContent,
      name: document.getElementById('diseaseName').textContent,
      affected: document.getElementById('affectedValue').textContent,
      green: document.getElementById('greenValue').textContent,
      lesion: document.getElementById('lesionValue').textContent,
      score: document.getElementById('confidenceValue').textContent,
      steps: document.querySelectorAll('#stepsList li').length,
      visible: !document.getElementById('reportContent').hidden
    };
  });

  // 2. Weather: real Open-Meteo fetch
  await page.fill('#weatherLocation', 'Ludhiana');
  await page.click('#weatherBtn');
  await page.waitForFunction(() => document.querySelector('#weatherBody table'), null, { timeout: 15000 }).catch(() => { });
  results.weather = await page.evaluate(() => document.getElementById('weatherBody').innerText.slice(0, 220));

  // 3. Nutrient guide
  await page.selectOption('#nutrientSelect', 'Nitrogen');
  results.nutrient = await page.evaluate(() => document.getElementById('nutrientDetail').innerText.slice(0, 180));

  return results;
}
