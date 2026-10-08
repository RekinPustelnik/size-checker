import fs from 'fs';

const html = fs.readFileSync('sinsay_debug.html', 'utf8');

const regex = /<script.*?>([\s\S]*?)<\/script>/g;
let match;
while ((match = regex.exec(html)) !== null) {
  const content = match[1];
  if (content.includes('979JS')) {
     console.log('--- FOUND 979JS in script ---');
     if (content.length > 500) {
        console.log(content.substring(0, 500) + '... (length: ' + content.length + ')');
     } else {
        console.log(content);
     }
  }
}
