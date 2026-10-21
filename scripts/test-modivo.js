import * as cheerio from 'cheerio';
import fs from 'fs';

const html = fs.readFileSync('modivo.html', 'utf-8');
const $ = cheerio.load(html);

$('script[type="application/ld+json"]').each((i, el) => {
    const jsonStr = $(el).html();
    try {
        const data = JSON.parse(jsonStr);
        if (data['@type'] === 'Product' || data['@type'] === 'ProductGroup') {
            fs.writeFileSync('modivo_ld.json', JSON.stringify(data, null, 2));
            console.log('Saved product LD-JSON');
        }
    } catch (e) {
        // ignore
    }
});
