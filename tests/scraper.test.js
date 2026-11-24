import assert from 'node:assert/strict';
import { parseSizesFromHtml } from '../src/scraper.js';

console.log('Uruchamianie testów parserów HTML (Zalando, Modivo, Esotiq, LPP, Answear)...');

// 1. Zalando — tablica LD+JSON (ProductGroup + BreadcrumbList)
{
  const html = `
    <html>
      <head>
        <meta property="og:image" content="https://img01.ztat.net/article/packshot.jpg?imwidth=800" />
        <script type="application/ld+json">
          [
            {
              "@context": "https://schema.org/",
              "@type": "ProductGroup",
              "image": ["https://img01.ztat.net/article/fallback.jpg"],
              "hasVariant": [
                { "size": "XXS", "offers": { "availability": "https://schema.org/InStock" } },
                { "size": "XS", "offers": { "availability": "https://schema.org/InStock" } },
                { "size": "S", "offers": { "availability": "https://schema.org/InStock" } },
                { "size": "M", "offers": { "availability": "https://schema.org/InStock" } },
                { "size": "L", "offers": { "availability": "https://schema.org/OutOfStock" } },
                { "size": "XL", "offers": { "availability": "https://schema.org/OutOfStock" } }
              ]
            },
            { "@context": "https://schema.org/", "@type": "BreadcrumbList", "itemListElement": [] }
          ]
        </script>
      </head>
    </html>
  `;
  const res = parseSizesFromHtml(html, 'https://www.zalando.pl/adidas-sportswear-rajstopy-blackclear-pink-adq41e03i-q13.html');
  assert.deepEqual(res.sizes, ['M', 'S', 'XS', 'XXS']);
  assert.equal(res.ogImage, 'https://img01.ztat.net/article/packshot.jpg?imwidth=800');
  assert.equal(res.error, null);
}

// 2. Zalando — tablica ofert (Partner), LimitedAvailability, One Size, buty i brak og:image (fallback LD+JSON)
{
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          [{
            "@type": "ProductGroup",
            "image": ["https://img01.ztat.net/article/shoe.jpg"],
            "hasVariant": [
              { "size": "38 2/3", "offers": [{ "availability": "https://schema.org/OutOfStock" }, { "availability": "https://schema.org/LimitedAvailability" }] },
              { "size": "39 1/3", "offers": [{ "availability": "https://schema.org/OutOfStock" }] },
              { "size": "One Size", "offers": { "availability": "http://schema.org/InStock" } }
            ]
          }]
        </script>
      </head>
    </html>
  `;
  const res = parseSizesFromHtml(html, 'https://www.zalando.pl/test-product-123456789-q11.html');
  assert.deepEqual(res.sizes, ['38 2/3', 'One Size']);
  assert.equal(res.ogImage, 'https://img01.ztat.net/article/shoe.jpg');
}

// 3. Zalando — produkt całkowicie wyprzedany (wszystkie OutOfStock -> brak błędu, pusta tablica)
{
  const html = `
    <html><head>
      <script type="application/ld+json">
        [{
          "@type": "ProductGroup",
          "hasVariant": [
            { "size": "S", "offers": { "availability": "https://schema.org/OutOfStock" } },
            { "size": "M", "offers": { "availability": "https://schema.org/OutOfStock" } }
          ]
        }]
      </script>
    </head></html>
  `;
  const res = parseSizesFromHtml(html, 'https://www.zalando.pl/test-soldout-123456789-b11.html');
  assert.deepEqual(res.sizes, []);
  assert.equal(res.error, null);
}

// 4. Zalando — fallback na runtime['hydratePartial'] bez LD+JSON (ignoruje zapytania bez stock oraz próbki)
{
  const html = `
    <html><body>
      <script id="re-ph-abc12">
        require(["runtime"], function(runtime) {
          runtime['hydratePartial']({"cache":{
            "q_empty_stock": {"data":{"product":{"simples":[{"size":"L","sku":"X"}],"simplesWithStock":[]}}},
            "q_full": {"data":{"product":{
              "simples":[
                {"size":"S","offer":{"stock":{"quantity":"MANY"}}},
                {"size":"M","offer":{"stock":{"quantity":"FEW"}}},
                {"size":"L","offer":{"stock":{"quantity":"OUT_OF_STOCK"}}}
              ],
              "simplesWithStock":[]
            }}}
          }});
        });
      </script>
    </body></html>
  `;
  const res = parseSizesFromHtml(html, 'https://www.zalando.de/test-de-123456789-q11.html');
  assert.deepEqual(res.sizes, ['M', 'S']);

  const htmlOnlySimplesWithStock = `
    <html><body>
      <script>
        runtime['hydratePartial']({"cache":{
          "q1": {"data":{"product":{"simplesWithStock":[
            {"size":"XS","isSample":false},
            {"size":"SAMPLE","isSample":true}
          ]}}}
        }});
      </script>
    </body></html>
  `;
  const res2 = parseSizesFromHtml(htmlOnlySimplesWithStock, 'https://www.zalando.pl/test.html');
  assert.deepEqual(res2.sizes, ['XS']);
}

// 5. Modivo — obiekt LD+JSON ProductGroup
{
  const html = `
    <html><head>
      <script type="application/ld+json">
        {
          "@type": "ProductGroup",
          "hasVariant": [
            { "size": "XS", "offers": { "availability": "https://schema.org/OutOfStock" } },
            { "size": "S", "offers": { "availability": "https://schema.org/InStock" } }
          ]
        }
      </script>
    </head></html>
  `;
  const res = parseSizesFromHtml(html, 'https://modivo.pl/p/test');
  assert.deepEqual(res.sizes, ['S']);
}

// 6. Esotiq — __NEXT_DATA__ (mimo obecności LD+JSON @type: Product)
{
  const html = `
    <html><head>
      <script type="application/ld+json">{"@type":"Product","name":"Top"}</script>
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"contentData":{"modelColor":{"products":[
          {"size_label":"75B","availability":3},
          {"size_label":"80B","availability":0}
        ]}}}}}
      </script>
    </head></html>
  `;
  const res = parseSizesFromHtml(html, 'https://esotiq.com/pl/pl/test');
  assert.deepEqual(res.sizes, ['75B']);
}

// 7. LPP (Sinsay / Reserved) — window['getProductData']
{
  const html = `
    <html><body>
      <script>
        window['getProductData'] = function() { return {"sizes":[
          {"sizeName":"104 (3-4 lata)","isInStock":true,"stockQuantity":2},
          {"sizeName":"110 (4-5 lat)","isInStock":false,"stockQuantity":0}
        ]}; };
      </script>
    </body></html>
  `;
  const res = parseSizesFromHtml(html, 'https://www.sinsay.com/pl/pl/test');
  assert.deepEqual(res.sizes, ['104 (3-4 lata)']);
}

// 8. Answear — window.__REACT_QUERY_STATE__
{
  const html = `
    <html><body>
      <script>
        window.__REACT_QUERY_STATE__ = {"queries":[{"state":{"data":{"product":{
          "productImages":["https://answear.com/img.jpg"],
          "allSizes":[
            {"name":"M","variation":{"availability":"IN_STOCK"}},
            {"name":"L","variation":{"availability":"OUT_OF_STOCK"}}
          ]
        }}}}]};
      </script>
    </body></html>
  `;
  const res = parseSizesFromHtml(html, 'https://answear.com/p/test');
  assert.deepEqual(res.sizes, ['M']);
  assert.equal(res.ogImage, 'https://answear.com/img.jpg');
}

// 9. Nieznana strona / strona blokady -> rzuca błąd
assert.throws(
  () => parseSizesFromHtml('<html><title>Access Denied</title></html>', 'https://www.zalando.pl/blocked.html'),
  /Nie rozpoznano struktury danych/
);

console.log('✅ Wszystkie testy parserów HTML zakończone sukcesem!');
