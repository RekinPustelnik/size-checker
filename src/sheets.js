import { google } from 'googleapis';

const COLUMNS = {
  NAZWA: 0,
  URL: 1,
  SZUKANY_ROZMIAR: 2,
  DOSTEPNE: 3,
  OSTATNIO_DOSTEPNE: 4,
  OSTATNIE_SPRAWDZENIE: 5,
  BLEDY_Z_RZEDU: 6,
};

function getAuth() {
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

export async function getProducts() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  let response;
  try {
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Produkty!A2:G1000',
    });
  } catch (err) {
    console.warn(`  ⚠ Próba pobrania z 'Produkty!' nieudana, spadek do starej metody (Arkusz1).`);
    response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A2:G1000',
    });
  }

  const rows = response.data.values || [];

  return rows
    .map((row, index) => ({
      row: index + 2,
      nazwa: (row[COLUMNS.NAZWA] || '').trim(),
      url: (row[COLUMNS.URL] || '').trim(),
      szukanyRozmiar: (row[COLUMNS.SZUKANY_ROZMIAR] || '').trim(),
      dostepne: (row[COLUMNS.DOSTEPNE] || '').trim(),
      ostatnioDostepne: (row[COLUMNS.OSTATNIO_DOSTEPNE] || '').trim(),
      bledyZRzedu: parseInt(row[COLUMNS.BLEDY_Z_RZEDU], 10) || 0,
    }))
    .filter((p) => p.nazwa && p.url);
}

export async function updateSizes(row, updates) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const now = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const prefix = 'Produkty!';

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `${prefix}D${row}`, values: [[updates.dostepne ?? '']] },
        { range: `${prefix}E${row}`, values: [[updates.ostatnioDostepne ?? '']] },
        { range: `${prefix}F${row}`, values: [[now]] },
        { range: `${prefix}G${row}`, values: [[0]] }, // reset błędów
      ],
    },
  });
}

export async function incrementErrorCount(row, currentCount) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.SPREADSHEET_ID;

  const newCount = currentCount + 1;
  const now = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
  const prefix = 'Produkty!';

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `${prefix}F${row}`,
          values: [[now]],
        },
        {
          range: `${prefix}G${row}`,
          values: [[newCount]],
        },
      ],
    },
  });

  return newCount;
}
