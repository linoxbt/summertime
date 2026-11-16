// Renders application/src/*.html to PDF. Usage: node render.js <in.html> <out.pdf> <deck|a4>
const { chromium } = require('playwright');
(async () => {
  const [,, input, output, mode] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + require('path').resolve(input));
  await page.evaluate(() => document.fonts.ready);
  const opts = mode === 'deck'
    ? { path: output, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true }
    : { path: output, format: 'A4', printBackground: true, preferCSSPageSize: true };
  await page.pdf(opts);
  // Overflow check: report any slide/page whose content is taller than its box.
  const overflow = await page.evaluate(() => [...document.querySelectorAll('.slide, .page')]
    .map((el, i) => ({ i: i + 1, over: el.scrollHeight - el.clientHeight }))
    .filter(x => x.over > 1));
  console.log('overflow:', JSON.stringify(overflow));
  await browser.close();
})();
