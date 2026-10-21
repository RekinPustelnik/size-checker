async function go() {
  const r = await fetch('https://html.duckduckgo.com/html/?q=site:modivo.pl+koszulka', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' }
  });
  const text = await r.text();
  const m = text.match(/https:\/\/modivo\.pl[^\"]+/g);
  console.log(m ? m.slice(0, 10) : 'none');
}
go();
