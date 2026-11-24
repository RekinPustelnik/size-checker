import { scrapeSizes } from '../src/scraper.js';

async function test() {
  const url = process.argv[2] || 'https://www.zalando.pl/adidas-sportswear-rajstopy-blackclear-pink-adq41e03i-q13.html';
  console.log(`Testowanie Zalando: ${url}`);
  const result = await scrapeSizes(url);
  console.log('Wynik:', result);
}

test();
