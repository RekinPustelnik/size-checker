import { scrapeSizes } from '../src/scraper.js';

async function test() {
  const url = process.argv[2];
  const szukany = process.argv[3];
  
  if (!url) {
    console.error('Użycie: npm run test-size <URL> [szukany_rozmiar]');
    process.exit(1);
  }

  console.log(`Testowanie scrapowania z URL:`);
  console.log(url);
  if (szukany) console.log(`Szukany rozmiar: "${szukany}"\n`);
  
  const result = await scrapeSizes(url);
  
  if (result.error) {
    console.error(`\nBŁĄD: ${result.error}`);
    return;
  }
  
  console.log('\n--- WYNIKI ---');
  console.log(`Miniaturka (og:image): ${result.ogImage || 'Brak'}`);
  console.log(`Wszystkie dostępne rozmiary (łącznie ${result.sizes.length}):`);
  console.log(result.sizes.join(' | '));
  
  if (szukany) {
    const szukaneArr = szukany.split(',').map(s => s.trim().toLowerCase());
    const znalezione = result.sizes.filter(size => {
        const sizeLower = size.toLowerCase();
        return szukaneArr.some(sz => sizeLower.includes(sz)); 
    });
    
    console.log('\n--- WYNIK FILTRA ---');
    if (znalezione.length > 0) {
        console.log(`✅ ZNALEZIONO DOPASOWANIE: ${znalezione.join(', ')}`);
    } else {
        console.log(`❌ NIE ZNALEZIONO dopasowań dla "${szukany}". Rozmiar niedostępny.`);
    }
  }
}

test();
