import assert from 'node:assert/strict';
import { matchesSize, matchesAnySize, filterSizes } from '../src/matcher.js';

console.log('Uruchamianie testów dopasowywania rozmiarów...');

// 1. Podstawowe rozmiary literowe
assert.equal(matchesSize('L', 'L'), true, 'L powinno pasować do L');
assert.equal(matchesSize('XL', 'L'), false, 'L NIE powinno pasować do XL');
assert.equal(matchesSize('XXL', 'L'), false, 'L NIE powinno pasować do XXL');
assert.equal(matchesSize('3XL', 'L'), false, 'L NIE powinno pasować do 3XL');
assert.equal(matchesSize('XL', 'XL'), true, 'XL powinno pasować do XL');
assert.equal(matchesSize('S', 'S'), true, 'S powinno pasować do S');
assert.equal(matchesSize('XS', 'S'), false, 'S NIE powinno pasować do XS');
assert.equal(matchesSize('XXS', 'S'), false, 'S NIE powinno pasować do XXS');
assert.equal(matchesSize('M', 'M'), true, 'M powinno pasować do M');

// 2. Rozmiary łączone i opisy w nawiasach
assert.equal(matchesSize('L/XL', 'L'), true, 'L powinno pasować do L/XL');
assert.equal(matchesSize('L/XL', 'XL'), true, 'XL powinno pasować do L/XL');
assert.equal(matchesSize('L (40)', 'L'), true, 'L powinno pasować do L (40)');
assert.equal(matchesSize('XL (42)', 'L'), false, 'L NIE powinno pasować do XL (42)');

// 3. Rozmiary dziecięce (np. Sinsay)
assert.equal(matchesSize('104 (3-4 lata)', '104'), true, '104 powinno pasować do 104 (3-4 lata)');
assert.equal(matchesSize('104 (3-4 lata)', '104 (3-4 lata)'), true, '104 (3-4 lata) powinno pasować');
assert.equal(matchesSize('1104', '104'), false, '104 NIE powinno pasować do 1104');
assert.equal(matchesSize('98 (2-3 l)', '98'), true, '98 powinno pasować do 98 (2-3 l)');

// 4. Rozmiary numeryczne i ułamkowe (np. buty)
assert.equal(matchesSize('38', '38'), true, '38 powinno pasować do 38');
assert.equal(matchesSize('138', '38'), false, '38 NIE powinno pasować do 138');
assert.equal(matchesSize('38.5', '38'), false, '38 NIE powinno pasować do 38.5');
assert.equal(matchesSize('38,5', '38'), false, '38 NIE powinno pasować do 38,5');
assert.equal(matchesSize('38.5', '38,5'), true, '38,5 powinno pasować do 38.5');
assert.equal(matchesSize('38,5', '38.5'), true, '38.5 powinno pasować do 38,5');

// 5. Rozmiary bielizny (np. Esotiq)
assert.equal(matchesSize('75B', '75B'), true, '75B powinno pasować do 75B');
assert.equal(matchesSize('75B', 'B'), false, 'B NIE powinno pasować do 75B');
assert.equal(matchesSize('75B', '75'), false, '75 NIE powinno pasować do 75B');

// 6. Wielokrotne rozmiary po przecinku
assert.equal(matchesAnySize('XL', 'M, L'), false, 'XL NIE powinno pasować do listy M, L');
assert.equal(matchesAnySize('L', 'M, L'), true, 'L powinno pasować do listy M, L');
assert.equal(matchesAnySize('M', 'M, L'), true, 'M powinno pasować do listy M, L');
assert.equal(matchesAnySize('XXL', 'M, L, XL'), false, 'XXL NIE powinno pasować do M, L, XL');
assert.equal(matchesAnySize('XL', 'M, L, XL'), true, 'XL powinno pasować do M, L, XL');

// 7. Filtrowanie tablicy
const filteredSingle = filterSizes(['S', 'M', 'L', 'XL', 'XXL'], 'L');
assert.deepEqual(filteredSingle, ['L']);

const filteredMulti = filterSizes(['S', 'M', 'L', 'XL', 'XXL'], 'M, L');
assert.deepEqual(filteredMulti, ['M', 'L']);

console.log('✅ Wszystkie testy dopasowywania rozmiarów zakończone sukcesem!');
