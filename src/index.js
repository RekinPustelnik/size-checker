import { scrapeSizes } from './scraper.js';
import { getProducts, updateSizes, incrementErrorCount } from './sheets.js';
import { sendSizeAlert, sendErrorAlert, sendSummary } from './discord.js';

const ERROR_ALERT_THRESHOLD = 5;

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('=== Size Checker — Start ===');
  console.log(`Data: ${new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}`);
  if (isDryRun) {
    console.log('🔍 [TRYB DRY-RUN — symulacja bez zapisu do Google Sheets i bez wysyłki powiadomień Discord]');
  }
  console.log('');

  let products;
  try {
    products = await getProducts();
    console.log(`Znaleziono ${products.length} produktów do sprawdzenia w zakładce 'Produkty'.`);
  } catch (err) {
    console.error(`Błąd odczytu Google Sheets: ${err.message}`);
    process.exit(1);
  }

  if (products.length === 0) {
    console.log('Brak produktów w arkuszu — kończę.');
    return;
  }

  const stats = {
    total: products.length,
    checked: 0,
    alerts: 0,
    errors: 0,
  };

  for (const product of products) {
    let hostname = '';
    try {
        hostname = new URL(product.url).hostname.replace(/^www\./, '');
    } catch(e) {}

    console.log(`\n[${product.nazwa}] (${hostname})`);
    console.log(`  URL: ${product.url}`);
    console.log(`  Szukany rozmiar: ${product.szukanyRozmiar || 'Dowolny'}`);
    
    const result = await scrapeSizes(product.url);

    if (result.error) {
      console.error(`  ✗ Nie udało się pobrać rozmiarów: ${result.error} — pomijam`);
      stats.errors++;
      if (!isDryRun) {
        try {
          const newCount = await incrementErrorCount(product.row, product.bledyZRzedu);
          if (newCount >= ERROR_ALERT_THRESHOLD && newCount % ERROR_ALERT_THRESHOLD === 0) {
            await sendErrorAlert(product, newCount, result.error);
          }
        } catch (sheetErr) {
          console.error(`  ✗ Błąd zapisu licznika: ${sheetErr.message}`);
        }
      }
      continue;
    }

    stats.checked++;
    
    const newSizesArr = result.sizes;
    const newSizesStr = newSizesArr.join(', ');
    
    // Parsujemy stare rozmiary
    let oldSizesArr = [];
    if (product.dostepne) {
       oldSizesArr = product.dostepne.split(',').map(s => s.trim()).filter(s => s !== '');
    }

    // Szukamy różnic (nowych rozmiarów, których wcześniej nie było)
    const newlyAvailableSizes = newSizesArr.filter(size => !oldSizesArr.includes(size));
    
    console.log(`  Poprzednio dostępne: ${product.dostepne || 'Brak'}`);
    
    let isAlertDrop = false;
    let alertSizes = [];

    // Filtrujemy nowo dostępne rozmiary, jeśli użytkownik podał szukany rozmiar
    if (product.szukanyRozmiar) {
        const szukane = product.szukanyRozmiar.split(',').map(s => s.trim().toLowerCase());
        alertSizes = newlyAvailableSizes.filter(size => {
            const sizeLower = size.toLowerCase();
            // Łagodniejsze dopasowanie - wystarczy że zawiera ciąg znaków 
            // np. "104" złapie "104 (3-4 lata)"
            return szukane.some(szukany => sizeLower.includes(szukany)); 
        });
    } else {
        alertSizes = newlyAvailableSizes;
    }
    
    const isFirstCheck = !product.dostepne && !product.ostatnioDostepne;

    // Jeśli to pierwsze sprawdzenie, wysyłamy alert TYLKO wtedy, gdy użytkownik sprecyzował szukany rozmiar 
    // i został on od razu znaleziony. Jeśli nie podał rozmiaru (chce wszystkie), ignorujemy pierwsze sprawdzenie, by nie spamować.
    if (isFirstCheck && (!product.szukanyRozmiar || alertSizes.length === 0)) {
        console.log(`  📝 Pierwsze sprawdzenie — zapisuję aktualne stany bez wysyłania alertu.`);
    } else if (alertSizes.length > 0) {
        console.log(`  🚨 Pojawiły się SZUKANE rozmiary: ${alertSizes.join(', ')}`);
        stats.alerts++;
        isAlertDrop = true;
        
        if (!isDryRun) {
          await sendSizeAlert(product, oldSizesArr, newSizesArr, alertSizes, result.ogImage);
        } else {
          console.log(`  [DRY-RUN] Wysłano by alert Discord`);
        }
    } else {
        console.log(`  — Brak nowych poszukiwanych rozmiarów (aktualnie dostępne: ${newSizesStr || 'Brak'})`);
    }

    // --- Logika dla "Ostatnio dostępne" (Rozmiar (Data)) ---
    const history = {};
    if (product.ostatnioDostepne) {
        const parts = product.ostatnioDostepne.split(',');
        for (const part of parts) {
            const match = part.trim().match(/(.+?)\s*\((.+?)\)/);
            if (match) {
                history[match[1].trim()] = match[2].trim();
            }
        }
    }

    const nowFormatted = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    for (const size of newSizesArr) {
        let shouldTrack = false;
        if (product.szukanyRozmiar) {
            const szukane = product.szukanyRozmiar.split(',').map(s => s.trim().toLowerCase());
            if (szukane.some(szukany => size.toLowerCase().includes(szukany))) {
                shouldTrack = true;
            }
        } else {
            shouldTrack = true;
        }
        if (shouldTrack) {
            history[size] = nowFormatted;
        }
    }

    if (product.szukanyRozmiar) {
        const szukane = product.szukanyRozmiar.split(',').map(s => s.trim().toLowerCase());
        for (const key of Object.keys(history)) {
            if (!szukane.some(szukany => key.toLowerCase().includes(szukany))) {
                delete history[key];
            }
        }
    }

    const historyArr = Object.entries(history).map(([sz, date]) => `${sz} (${date})`);
    const historyStr = historyArr.length > 0 ? historyArr.join(', ') : '';

    if (!isDryRun) {
      try {
        await updateSizes(product.row, {
          dostepne: newSizesStr,
          ostatnioDostepne: historyStr
        });
        console.log(`  ✓ Arkusz zaktualizowany (Historia: ${historyStr || 'Brak'})`);
        if (product.bledyZRzedu > 0) {
          console.log(`  ✓ Licznik błędów zresetowany`);
        }
      } catch (err) {
        console.error(`  ✗ Błąd zapisu do Sheets: ${err.message}`);
        stats.errors++;
      }
    } else {
      console.log(`  [DRY-RUN] Symulacja zapisu: dostepne="${newSizesStr}", ostatnio="${historyStr}"`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log('\n=== Podsumowanie ===');
  console.log(`Sprawdzono: ${stats.checked}/${stats.total}`);
  console.log(`Nowe rozmiary (Alerty): ${stats.alerts}`);
  console.log(`Błędy: ${stats.errors}`);

  if (!isDryRun) {
    await sendSummary(stats);
  }
  console.log('\n=== Size Checker — Koniec ===');
}

main().catch((err) => {
  console.error('Krytyczny błąd:', err);
  process.exit(1);
});
