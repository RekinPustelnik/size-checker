// =============================================================================
// scraper.js — Pobieranie HTML (Impit TLS/HTTP2 + retry + detekcja blokad) i parsowanie rozmiarów
// =============================================================================

import * as cheerio from 'cheerio';
import { Impit } from 'impit';

const TIMEOUT_MS = 30_000;
const MAX_FETCH_ATTEMPTS = 3;
const BROWSER_PROFILES = ['chrome', 'firefox'];
const BLOCKED_STATUS_CODES = new Set([401, 403, 406, 429, 503]);
const IN_STOCK_PATTERN = /^(?:https?:\/\/schema\.org\/)?(InStock|LimitedAvailability|OnlineOnly)$/i;

const FALLBACK_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
];

/**
 * Creates a lightweight per-domain in-memory cookie jar compatible with Impit.
 * Keeps Akamai/session cookies isolated per browser profile across retries and requests.
 */
export function createCookieJar() {
  const store = new Map();

  const matchesDomain = (hostname, cookieDomain) =>
    hostname === cookieDomain || hostname.endsWith('.' + cookieDomain);

  return {
    setCookie(rawCookie, url) {
      if (!rawCookie || !url) return;
      let host;
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return;
      }

      const segments = rawCookie.split(';').map((s) => s.trim()).filter(Boolean);
      const eqIdx = segments[0]?.indexOf('=') ?? -1;
      if (eqIdx <= 0) return;

      const name = segments[0].slice(0, eqIdx).trim();
      const value = segments[0].slice(eqIdx + 1).trim();

      let domain = host;
      let expired = value === '';
      for (const attr of segments.slice(1)) {
        const [rawKey, ...rawVal] = attr.split('=');
        const key = rawKey.toLowerCase();
        const attrVal = rawVal.join('=').trim();
        if (key === 'domain' && attrVal) {
          const cleanDomain = attrVal.replace(/^\./, '').toLowerCase();
          if (matchesDomain(host, cleanDomain)) {
            domain = cleanDomain;
          }
        } else if (key === 'max-age' && Number(attrVal) <= 0) {
          expired = true;
        }
      }

      if (!store.has(domain)) store.set(domain, new Map());
      if (expired) {
        store.get(domain).delete(name);
      } else {
        store.get(domain).set(name, value);
      }
    },

    getCookieString(url) {
      let host;
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return '';
      }

      const pairs = [];
      for (const [domain, cookies] of store.entries()) {
        if (matchesDomain(host, domain)) {
          for (const [name, value] of cookies.entries()) {
            pairs.push(`${name}=${value}`);
          }
        }
      }
      return pairs.join('; ');
    },
  };
}

const clients = new Map();

function getHttpClient(profile) {
  if (clients.has(profile)) {
    return clients.get(profile);
  }

  let client;
  try {
    const cookieJar = createCookieJar();
    const impit = new Impit({
      browser: profile,
      cookieJar,
      timeout: TIMEOUT_MS,
      followRedirects: true,
    });
    client = {
      profile,
      cookieJar,
      fetch: (url, init) => impit.fetch(url, init),
    };
  } catch {
    // Fallback to Node fetch if native Impit bindings are unavailable in the current environment
    const ua = profile === 'firefox' ? FALLBACK_USER_AGENTS[1] : FALLBACK_USER_AGENTS[0];
    client = {
      profile,
      cookieJar: null,
      fetch: (url, init) => globalThis.fetch(url, {
        ...init,
        headers: { 'User-Agent': ua, ...(init?.headers || {}) },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'follow',
      }),
    };
  }

  clients.set(profile, client);
  return client;
}

function buildRequestHeaders(url) {
  const origin = new URL(url).origin;
  return {
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': origin + '/',
  };
}

/**
 * Detects anti-bot challenge/block responses (Akamai, Cloudflare, PerimeterX)
 * from HTTP status codes or HTML challenge markers served with HTTP 200.
 *
 * @param {number} status
 * @param {string} [html='']
 * @returns {string|null} Reason description if blocked, otherwise null.
 */
export function detectBotBlock(status, html = '') {
  if (BLOCKED_STATUS_CODES.has(status)) {
    return `HTTP ${status}`;
  }

  if (!html) return null;

  const head = html.slice(0, 6000).toLowerCase();
  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? titleMatch[1].trim() : '';

  const blockedByTitle =
    pageTitle === 'access denied' ||
    pageTitle.includes('attention required') ||
    pageTitle.includes('just a moment') ||
    pageTitle.includes('robot or human') ||
    pageTitle.includes('verify you are human');

  const blockedByBody =
    head.includes("you don't have permission to access") ||
    head.includes('errors.edgesuite.net') ||
    head.includes('cf-browser-verification') ||
    head.includes('challenge-platform') ||
    head.includes('_sec/cp_challenge') ||
    head.includes('bm-verify');

  if (blockedByTitle || blockedByBody) {
    return 'Strona blokady antybotowej (Akamai / Cloudflare / Challenge)';
  }

  return null;
}

function isZalandoUrl(url) {
  if (!url) return false;
  try {
    return /(^|\.)zalando\./i.test(new URL(url).hostname);
  } catch {
    return /zalando\./i.test(url);
  }
}

function hasSchemaType(node, expectedType) {
  const type = node?.['@type'];
  return Array.isArray(type) ? type.includes(expectedType) : type === expectedType;
}

/**
 * Collects all Schema.org JSON-LD nodes from the document, flattening arrays and `@graph` containers.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {object[]}
 */
function extractLdJsonNodes($) {
  const nodes = [];
  const collect = (item) => {
    if (Array.isArray(item)) {
      for (const entry of item) collect(entry);
    } else if (item && typeof item === 'object') {
      if (Array.isArray(item['@graph'])) {
        collect(item['@graph']);
      }
      nodes.push(item);
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html());
      collect(parsed);
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  });

  return nodes;
}

/**
 * Extracts a balanced `{...}` JSON substring starting at `startIdx`.
 * @param {string} str
 * @param {number} startIdx
 * @returns {string|null}
 */
function extractBalancedJson(str, startIdx) {
  if (startIdx < 0 || str[startIdx] !== '{') return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return str.slice(startIdx, i + 1);
      }
    }
  }

  return null;
}

function resolveImageUrl(imgUrl, baseUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return null;
  const trimmed = imgUrl.trim();
  if (!trimmed) return null;
  if (!baseUrl) return trimmed;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

function extractOgImage($, url, ldNodes) {
  let ogImage = $('meta[property="og:image"]').attr('content') ||
                $('meta[property="og:image:url"]').attr('content') ||
                null;

  if (ogImage && (ogImage.includes('logo_share') || ogImage.includes('default_share'))) {
    ogImage = null; // Ignoruj domyślne generyczne logo sklepu
  }

  ogImage = resolveImageUrl(ogImage, url);

  // Fallback dla obrazka z LD+JSON (np. Answear, Modivo, Zalando)
  if (!ogImage) {
    for (const node of ldNodes) {
      if ((hasSchemaType(node, 'Product') || hasSchemaType(node, 'ProductGroup')) && node.image) {
        const firstImg = Array.isArray(node.image) ? node.image[0] : node.image;
        const imgUrl = typeof firstImg === 'string' ? firstImg : firstImg?.contentUrl || firstImg?.url;
        const resolved = resolveImageUrl(imgUrl, url);
        if (resolved) {
          ogImage = resolved;
          break;
        }
      }
    }
  }

  return ogImage;
}

function isOfferInStock(offers) {
  const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
  return offerList.some((offer) => IN_STOCK_PATTERN.test(String(offer?.availability || '').trim()));
}

/**
 * Extracts available variant sizes from Schema.org `ProductGroup` JSON-LD nodes (Modivo, Zalando).
 * @param {object[]} ldNodes
 * @returns {{ found: boolean, sizes: string[] }}
 */
function parseLdJsonSizes(ldNodes) {
  let found = false;
  const sizes = [];

  for (const node of ldNodes) {
    if (hasSchemaType(node, 'ProductGroup') && Array.isArray(node.hasVariant)) {
      found = true;
      for (const variant of node.hasVariant) {
        const rawSize = typeof variant?.size === 'string' ? variant.size : variant?.size?.name;
        const size = typeof rawSize === 'string' ? rawSize.trim() : '';
        if (size && isOfferInStock(variant.offers)) {
          sizes.push(size);
        }
      }
    }
  }

  return { found, sizes: [...new Set(sizes)].sort() };
}

/**
 * Fallback parser for Zalando SSR hydration payloads (`runtime['hydratePartial']` / `__hydrationDataConsume`).
 * @param {import('cheerio').CheerioAPI} $
 * @returns {{ found: boolean, sizes: string[] }}
 */
function parseZalandoHydration($) {
  const markers = ["runtime['hydratePartial'](", 'window.__hydrationDataConsume('];
  let foundFromSimples = false;
  let foundFromSimplesWithStock = false;
  const simplesSizes = [];
  const stockSizes = [];

  $('script').each((_, el) => {
    const scriptContent = $(el).html();
    if (!scriptContent) return;

    for (const marker of markers) {
      let searchPos = 0;
      while ((searchPos = scriptContent.indexOf(marker, searchPos)) !== -1) {
        const braceStart = scriptContent.indexOf('{', searchPos + marker.length);
        const jsonStr = extractBalancedJson(scriptContent, braceStart);
        searchPos += marker.length;
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const cache = parsed.cache || parsed.graphqlCache;
          if (!cache || typeof cache !== 'object') continue;

          for (const entry of Object.values(cache)) {
            const product = entry?.data?.product;
            if (!product) continue;

            // Zalando caches multiple partial GraphQL queries; only `simples` with both size and stock are authoritative.
            if (Array.isArray(product.simples)) {
              const hasStockFields = product.simples.some((s) => s?.size && s?.offer?.stock?.quantity);
              if (hasStockFields) {
                foundFromSimples = true;
                for (const simple of product.simples) {
                  const size = typeof simple?.size === 'string' ? simple.size.trim() : '';
                  const quantity = simple?.offer?.stock?.quantity;
                  if (size && quantity && quantity !== 'OUT_OF_STOCK') {
                    simplesSizes.push(size);
                  }
                }
              }
            }

            if (Array.isArray(product.simplesWithStock) && product.simplesWithStock.length > 0) {
              foundFromSimplesWithStock = true;
              for (const simple of product.simplesWithStock) {
                const size = typeof simple?.size === 'string' ? simple.size.trim() : '';
                if (size && !simple.isSample) {
                  stockSizes.push(size);
                }
              }
            }
          }
        } catch {
          // Ignore unparseable hydration chunk
        }
      }
    }
  });

  if (foundFromSimples) {
    return { found: true, sizes: [...new Set(simplesSizes)].sort() };
  }
  if (foundFromSimplesWithStock) {
    return { found: true, sizes: [...new Set(stockSizes)].sort() };
  }
  return { found: false, sizes: [] };
}

function parseEsotiqSizes($) {
  const nextDataStr = $('#__NEXT_DATA__').html();
  if (!nextDataStr) return { found: false, sizes: [] };

  try {
    const data = JSON.parse(nextDataStr);
    const products = data.props?.pageProps?.contentData?.modelColor?.products;
    if (Array.isArray(products)) {
      const sizes = [];
      for (const p of products) {
        // availability = 0 (brak), > 0 (dostępne)
        if (p.availability > 0 || p.availability === true || p.availability === 'true') {
          if (p.size_label) {
            sizes.push(p.size_label);
          }
        }
      }
      return { found: true, sizes: [...new Set(sizes)].sort() };
    }
  } catch (e) {
    console.error('Błąd parsowania Esotiq __NEXT_DATA__', e);
  }

  return { found: false, sizes: [] };
}

function parseLppSizes($) {
  let productDataJson = null;
  $('script').each((_, el) => {
    const scriptContent = $(el).html();
    if (scriptContent && scriptContent.includes('getProductData')) {
      const match = scriptContent.match(/window\['getProductData'\]\s*=\s*function\(\)\s*\{\s*return\s*(\{.*?\});\s*\}/s);
      if (match && match[1]) {
        try {
          productDataJson = JSON.parse(match[1]);
        } catch {}
      }
    }
  });

  if (productDataJson && Array.isArray(productDataJson.sizes)) {
    const sizes = [];
    for (const sizeInfo of productDataJson.sizes) {
      if (sizeInfo.isInStock && sizeInfo.stockQuantity > 0 && sizeInfo.sizeName) {
        sizes.push(sizeInfo.sizeName);
      }
    }
    return { found: true, sizes: [...new Set(sizes)].sort() };
  }

  return { found: false, sizes: [] };
}

function parseAnswearSizes($) {
  let found = false;
  const sizes = [];
  let fallbackImage = null;

  $('script').each((_, el) => {
    const scriptContent = $(el).html();
    if (scriptContent && scriptContent.includes('window.__REACT_QUERY_STATE__')) {
      try {
        const marker = 'window.__REACT_QUERY_STATE__ = ';
        const start = scriptContent.indexOf(marker);
        if (start !== -1) {
          let jsonStr = scriptContent.slice(start + marker.length).trim();
          const lastBrace = jsonStr.lastIndexOf('}');
          if (lastBrace !== -1) {
            jsonStr = jsonStr.slice(0, lastBrace + 1);
          }
          const state = JSON.parse(jsonStr);
          for (const q of state.queries || []) {
            const p = q.state?.data?.product;
            if (p && Array.isArray(p.allSizes)) {
              found = true;
              for (const s of p.allSizes) {
                const avail = s.variation?.availability;
                if (avail && avail !== 'OUT_OF_STOCK' && s.name) {
                  sizes.push(s.name);
                }
              }
              if (Array.isArray(p.productImages) && p.productImages.length > 0) {
                const firstImg = p.productImages[0];
                const imgUrl = typeof firstImg === 'string' ? firstImg : firstImg?.url || firstImg?.imageUrl || firstImg?.src;
                if (imgUrl) fallbackImage = imgUrl;
              }
              break;
            }
          }
        }
      } catch (e) {
        console.error('Błąd parsowania Answear __REACT_QUERY_STATE__', e);
      }
    }
  });

  return { found, sizes: [...new Set(sizes)].sort(), image: fallbackImage };
}

/**
 * Parses available sizes and preview image from already-fetched product HTML.
 * @param {string} html
 * @param {string} [url='']
 * @returns {{ sizes: string[], ogImage: string|null, blocked: false, error: null }}
 */
export function parseSizesFromHtml(html, url = '') {
  const $ = cheerio.load(html);
  const ldNodes = extractLdJsonNodes($);
  let ogImage = extractOgImage($, url, ldNodes);

  const ldResult = parseLdJsonSizes(ldNodes);
  if (ldResult.found) {
    const source = isZalandoUrl(url) ? 'Zalando/Schema.org' : 'Modivo/Schema.org';
    console.log(`  ✓ Znaleziono dostępne rozmiary (${source}): ${ldResult.sizes.length > 0 ? ldResult.sizes.join(', ') : 'Brak'}`);
    return { sizes: ldResult.sizes, ogImage, blocked: false, error: null };
  }

  const zalandoResult = parseZalandoHydration($);
  if (zalandoResult.found) {
    console.log(`  ✓ Znaleziono dostępne rozmiary (Zalando): ${zalandoResult.sizes.length > 0 ? zalandoResult.sizes.join(', ') : 'Brak'}`);
    return { sizes: zalandoResult.sizes, ogImage, blocked: false, error: null };
  }

  const esotiqResult = parseEsotiqSizes($);
  if (esotiqResult.found) {
    console.log(`  ✓ Znaleziono dostępne rozmiary (Esotiq): ${esotiqResult.sizes.length > 0 ? esotiqResult.sizes.join(', ') : 'Brak'}`);
    return { sizes: esotiqResult.sizes, ogImage, blocked: false, error: null };
  }

  const lppResult = parseLppSizes($);
  if (lppResult.found) {
    console.log(`  ✓ Znaleziono dostępne rozmiary (LPP): ${lppResult.sizes.length > 0 ? lppResult.sizes.join(', ') : 'Brak'}`);
    return { sizes: lppResult.sizes, ogImage, blocked: false, error: null };
  }

  const answearResult = parseAnswearSizes($);
  if (answearResult.found) {
    if (answearResult.image) {
      ogImage = answearResult.image;
    }
    console.log(`  ✓ Znaleziono dostępne rozmiary (Answear): ${answearResult.sizes.length > 0 ? answearResult.sizes.join(', ') : 'Brak'}`);
    return { sizes: answearResult.sizes, ogImage, blocked: false, error: null };
  }

  throw new Error('Nie rozpoznano struktury danych na stronie (ani Modivo/Zalando Schema.org, ani Zalando, ani Esotiq, ani LPP, ani Answear).');
}

async function warmupOriginCookie(client, url) {
  if (!client.cookieJar) return;
  const origin = new URL(url).origin;
  if (client.cookieJar.getCookieString(url)) return;

  try {
    await client.fetch(origin + '/', {
      headers: {
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
  } catch {
    // Best-effort warmup only
  }
}

/**
 * Fetches and parses available product sizes, rotating browser TLS fingerprints across retries
 * and classifying anti-bot blocks separately from genuine scraping/URL errors.
 *
 * @param {string} url
 * @param {{ fetchImpl?: Function, maxAttempts?: number, retryDelayMs?: number }} [options]
 * @returns {Promise<{ sizes: string[], ogImage: string|null, blocked: boolean, error: string|null }>}
 */
export async function scrapeSizes(url, options = {}) {
  const maxAttempts = options.maxAttempts ?? MAX_FETCH_ATTEMPTS;
  const customFetch = options.fetchImpl;
  const getRetryDelay = () => options.retryDelayMs ?? (1200 + Math.random() * 1800);

  console.log(`  → Pobieranie strony...`);

  let lastError = '';
  let allBlocked = true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const profile = BROWSER_PROFILES[(attempt - 1) % BROWSER_PROFILES.length];
    const client = customFetch ? { fetch: customFetch, cookieJar: null } : getHttpClient(profile);

    try {
      const response = await client.fetch(url, {
        headers: buildRequestHeaders(url),
      });

      const blockFromStatus = detectBotBlock(response.status);
      if (blockFromStatus) {
        throw Object.assign(new Error(`${blockFromStatus} ${response.statusText || ''}`.trim()), { isBlocked: true });
      }

      if (!response.ok) {
        allBlocked = false;
        const err = new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
        // Don't retry permanent client errors like 404/410
        if (response.status === 404 || response.status === 410) {
          console.error(`  ✗ Błąd: ${err.message}`);
          return { sizes: [], ogImage: null, blocked: false, error: err.message };
        }
        throw err;
      }

      const html = await response.text();
      const blockFromHtml = detectBotBlock(response.status, html);
      if (blockFromHtml) {
        throw Object.assign(new Error(blockFromHtml), { isBlocked: true });
      }

      allBlocked = false;
      return parseSizesFromHtml(html, url);
    } catch (err) {
      if (!err.isBlocked) {
        allBlocked = false;
      }
      lastError = err.message;
      console.error(`  ✗ [Próba ${attempt}/${maxAttempts}] ${err.message}`);

      if (attempt < maxAttempts) {
        const delay = getRetryDelay();
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        if (err.isBlocked && !customFetch) {
          const nextProfile = BROWSER_PROFILES[attempt % BROWSER_PROFILES.length];
          await warmupOriginCookie(getHttpClient(nextProfile), url);
        }
      }
    }
  }

  return {
    sizes: [],
    ogImage: null,
    blocked: allBlocked,
    error: lastError || 'Nieznany błąd pobierania',
  };
}
