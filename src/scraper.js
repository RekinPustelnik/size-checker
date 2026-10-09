// =============================================================================
// scraper.js — Pobieranie HTML i wyciąganie dostępnych rozmiarów
// =============================================================================

import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
];

const TIMEOUT_MS = 30_000;

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildHeaders(url) {
  const origin = new URL(url).origin;
  return {
    'User-Agent': randomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': origin + '/',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };
}

export async function scrapeSizes(url) {
  let lastError = '';

  console.log(`  → Pobieranie strony...`);
  try {
    const response = await fetch(url, {
      headers: buildHeaders(url),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Ekstrakcja og:image
    let ogImage = $('meta[property="og:image"]').attr('content') ||
                  $('meta[property="og:image:url"]').attr('content') ||
                  null;

    if (ogImage) {
      ogImage = ogImage.trim();
      try {
        ogImage = new URL(ogImage, url).href;
      } catch {
        ogImage = null;
      }
    }

    let availableSizes = [];

    // --- ESOTIQ PARSING ---
    const nextDataStr = $('#__NEXT_DATA__').html();
    if (nextDataStr) {
      try {
        const data = JSON.parse(nextDataStr);
        const products = data.props?.pageProps?.contentData?.modelColor?.products;
        if (products && Array.isArray(products)) {
          for (const p of products) {
            // availability = 0 (brak), > 0 (dostępne)
            if (p.availability > 0 || p.availability === true || p.availability === 'true') {
              if (p.size_label) {
                availableSizes.push(p.size_label);
              }
            }
          }
          const uniqueSizes = [...new Set(availableSizes)].sort();
          console.log(`  ✓ Znaleziono dostępne rozmiary (Esotiq): ${uniqueSizes.length > 0 ? uniqueSizes.join(', ') : 'Brak'}`);
          return { sizes: uniqueSizes, ogImage, error: null };
        }
      } catch (e) {
         console.error('Błąd parsowania Esotiq __NEXT_DATA__', e);
      }
    }

    // --- LPP (SINSAY/RESERVED) PARSING ---
    let productDataJson = null;
    $('script').each((_, el) => {
      const scriptContent = $(el).html();
      if (scriptContent && scriptContent.includes('getProductData')) {
         const match = scriptContent.match(/window\['getProductData'\]\s*=\s*function\(\)\s*\{\s*return\s*(\{.*?\});\s*\}/s);
         if (match && match[1]) {
             try {
                 productDataJson = JSON.parse(match[1]);
             } catch (e) {}
         }
      }
    });

    if (productDataJson && productDataJson.sizes && Array.isArray(productDataJson.sizes)) {
        for (const sizeInfo of productDataJson.sizes) {
            if (sizeInfo.isInStock && sizeInfo.stockQuantity > 0) {
                if (sizeInfo.sizeName) {
                    availableSizes.push(sizeInfo.sizeName);
                }
            }
        }
        const uniqueSizes = [...new Set(availableSizes)].sort();
        console.log(`  ✓ Znaleziono dostępne rozmiary (LPP): ${uniqueSizes.length > 0 ? uniqueSizes.join(', ') : 'Brak'}`);
        return { sizes: uniqueSizes, ogImage, error: null };
    }

    throw new Error('Nie rozpoznano struktury danych na stronie (ani LPP, ani Esotiq).');

  } catch (err) {
    lastError = err.message;
    console.error(`  ✗ Błąd: ${err.message}`);
  }

  return { sizes: [], ogImage: null, error: lastError };
}
