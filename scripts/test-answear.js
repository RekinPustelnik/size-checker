import { scrapeSizes } from '../src/scraper.js';

async function test() {
  const url = process.argv[2] || 'https://answear.com/p/guess-jeans-bluza-rozpinana-z-kapturem-damska-bawelniana-rozowa-w6gq06-k68i4-1621817';
  console.log(`Testowanie Answear: ${url}`);
  const result = await scrapeSizes(url);
  console.log('Wynik:', result);
}

test();
