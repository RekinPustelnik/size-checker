import assert from 'node:assert/strict';
import { computeAvailabilityTracking } from '../src/index.js';
import { COLUMNS } from '../src/sheets.js';

console.log('Uruchamianie testów śledzenia kolumny "Ostatnia dostępność"...');

// 1. Układ kolumn w Google Sheets (G = Ostatnia dostępność, H = Błędy z rzędu)
assert.equal(COLUMNS.OSTATNIA_DOSTEPNOSC, 6, 'Kolumna G powinna mieć indeks 6');
assert.equal(COLUMNS.BLEDY_Z_RZEDU, 7, 'Kolumna H powinna mieć indeks 7');

// 2. Gdy szukany rozmiar jest dostępny — aktualizuje G oraz historię E
{
  const res = computeAvailabilityTracking(
    { szukanyRozmiar: 'S, M', ostatnioDostepne: '', ostatniaDostepnosc: '' },
    ['XXS', 'XS', 'S'],
    '24.11.2026, 21:30'
  );
  assert.equal(res.ostatniaDostepnosc, '24.11.2026, 21:30');
  assert.equal(res.ostatnioDostepne, 'S (24.11.2026, 21:30)');
}

// 3. Gdy szukany rozmiar NIE jest dostępny (mimo dostępności innych) — zachowuje poprzednią datę w G
{
  const res = computeAvailabilityTracking(
    {
      szukanyRozmiar: 'L',
      ostatnioDostepne: 'L (20.11.2026, 10:15)',
      ostatniaDostepnosc: '20.11.2026, 10:15',
    },
    ['XS', 'S', 'M'],
    '24.11.2026, 21:30'
  );
  assert.equal(res.ostatniaDostepnosc, '20.11.2026, 10:15');
  assert.equal(res.ostatnioDostepne, 'L (20.11.2026, 10:15)');
}

// 4. Gdy szukany rozmiar jest pusty (dowolny) — aktualizuje G tylko gdy cokolwiek jest dostępne
{
  const inStock = computeAvailabilityTracking(
    { szukanyRozmiar: '', ostatnioDostepne: '', ostatniaDostepnosc: '19.11.2026, 08:00' },
    ['XS'],
    '24.11.2026, 21:30'
  );
  assert.equal(inStock.ostatniaDostepnosc, '24.11.2026, 21:30');

  const outOfStock = computeAvailabilityTracking(
    { szukanyRozmiar: '', ostatnioDostepne: 'XS (24.11.2026, 21:30)', ostatniaDostepnosc: '24.11.2026, 21:30' },
    [],
    '24.11.2026, 22:00'
  );
  assert.equal(outOfStock.ostatniaDostepnosc, '24.11.2026, 21:30');
}

// 5. Migracja ze starego arkusza — stara wartość licznika błędów ("0", "3") w G jest czyszczona, gdy brak dostępności
{
  const res = computeAvailabilityTracking(
    { szukanyRozmiar: 'XL', ostatnioDostepne: '', ostatniaDostepnosc: '0' },
    ['S', 'M'],
    '24.11.2026, 21:30'
  );
  assert.equal(res.ostatniaDostepnosc, '');
}

// 6. Rozmiary z nawiasami (np. Sinsay "104 (3-4 lata)") zachowują historię mimo przecinka w dacie
{
  const res = computeAvailabilityTracking(
    {
      szukanyRozmiar: '104, 110',
      ostatnioDostepne: '104 (3-4 lata) (20.11.2026, 10:15), 110 (4-5 lat) (21.11.2026, 11:00)',
      ostatniaDostepnosc: '21.11.2026, 11:00',
    },
    ['104 (3-4 lata)'],
    '24.11.2026, 21:30'
  );
  assert.equal(res.ostatniaDostepnosc, '24.11.2026, 21:30');
  assert.equal(
    res.ostatnioDostepne,
    '104 (3-4 lata) (24.11.2026, 21:30), 110 (4-5 lat) (21.11.2026, 11:00)'
  );
}

console.log('✅ Wszystkie testy śledzenia dostępności zakończone sukcesem!');
