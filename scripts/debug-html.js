import fs from 'fs';
import { scrapeSizes } from '../src/scraper.js';

async function run() {
  const url = "https://www.sinsay.com/pl/pl/spodnie-dresowe-loose-marvel-979js-83x";
  console.log("Fetching...");
  try {
     const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7'
        }
     });
     const text = await response.text();
     fs.writeFileSync("sinsay_debug.html", text);
     console.log("Status: " + response.status);
     console.log("Zapisano do sinsay_debug.html, rozmiar: " + text.length);
  } catch (e) {
     console.error(e);
  }
}
run();
