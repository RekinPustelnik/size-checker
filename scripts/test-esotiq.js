import * as cheerio from 'cheerio';
import fs from 'fs';

async function scrapeSizes(url) {
  console.log(`  → Pobieranie strony...`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  let availableSizes = [];
  
  const nextDataStr = $('#__NEXT_DATA__').html();
  if (nextDataStr) {
    try {
      const data = JSON.parse(nextDataStr);
      const products = data.props?.pageProps?.contentData?.modelColor?.products;
      if (products && Array.isArray(products)) {
        for (const p of products) {
          if (p.availability > 0 || p.availability === true || p.availability === 'true') {
            if (p.size_label) {
              availableSizes.push(p.size_label);
            }
          }
        }
        const uniqueSizes = [...new Set(availableSizes)].sort();
        console.log(`  ✓ Znaleziono dostępne rozmiary (Esotiq): ${uniqueSizes.length > 0 ? uniqueSizes.join(', ') : 'Brak'}`);
        return { sizes: uniqueSizes, error: null };
      }
    } catch(e) {}
  }
  console.log('Nie rozpoznano Esotiq.');
}
scrapeSizes('https://esotiq.com/pl/pl/top-bloovii-kyleena-bordowy-43789-49X');
