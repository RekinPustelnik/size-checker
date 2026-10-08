// =============================================================================
// discord.js — Powiadomienia na Discord przez webhook
// =============================================================================

/**
 * Wysyła alert o dostępności nowych rozmiarów na Discord.
 */
export async function sendSizeAlert(product, oldSizesArr, newSizesArr, alertSizes, ogImage) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('  ⚠ Brak DISCORD_WEBHOOK_URL — pomijam powiadomienie');
    return;
  }

  let domain = '';
  try {
    domain = new URL(product.url).hostname.replace(/^www\./, '');
  } catch (e) {}

  const embed = {
    title: '👕 SZUKANE ROZMIARY DOSTĘPNE!',
    description: `**[${product.nazwa}](${product.url})**\n\nPojawiły się rozmiary, na które czekałeś!`,
    color: 0x00c853, // Zielony
    fields: [
      {
        name: '🔥 Złapane rozmiary',
        value: `**${alertSizes.join(', ')}**`,
        inline: false,
      },
      {
        name: 'Szukany rozmiar',
        value: product.szukanyRozmiar || 'Dowolny',
        inline: false,
      },
      {
        name: 'Wszystkie dostępne',
        value: newSizesArr.length > 0 ? newSizesArr.join(', ') : 'Brak',
        inline: true,
      },
      {
        name: 'Poprzednio',
        value: oldSizesArr.length > 0 ? oldSizesArr.join(', ') : 'Brak',
        inline: true,
      }
    ],
    footer: {
      text: 'Size Checker',
    },
    timestamp: new Date().toISOString(),
  };

  if (domain) {
    embed.author = {
      name: domain,
      icon_url: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      url: product.url,
    };
  }

  if (ogImage) {
    embed.thumbnail = { url: ogImage };
  }

  const actionRowComponents = [
    {
      type: 2, // BUTTON
      style: 5, // LINK
      label: '🛒 Przejdź do oferty',
      url: product.url,
    },
  ];

  if (process.env.SPREADSHEET_ID) {
    actionRowComponents.push({
      type: 2, // BUTTON
      style: 5, // LINK
      label: '📊 Otwórz Arkusz',
      url: `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}`,
    });
  }

  const payload = {
    embeds: [embed],
    components: [
      {
        type: 1, // ACTION_ROW
        components: actionRowComponents,
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`  ✗ Discord webhook HTTP ${response.status}`);
    } else {
      console.log('  ✓ Powiadomienie Discord wysłane');
    }
  } catch (err) {
    console.error(`  ✗ Błąd Discord webhook: ${err.message}`);
  }
}

/**
 * Wysyła alert o powtarzających się błędach scrapowania na Discord.
 */
export async function sendErrorAlert(product, errorCount, errorMessage) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  let domain = '';
  try {
    domain = new URL(product.url).hostname.replace(/^www\./, '');
  } catch (e) {}

  const embed = {
    title: '⚠️ Powtarzający się błąd scrapowania',
    description: `**[${product.nazwa}](${product.url})**`,
    color: 0xff9800, // pomarańczowy
    fields: [
      {
        name: 'Błędów z rzędu',
        value: `${errorCount}`,
        inline: true,
      },
      {
        name: 'Ostatni błąd',
        value: (errorMessage || 'Nieznany błąd').substring(0, 200),
      },
    ],
    footer: { text: 'Size Checker' },
    timestamp: new Date().toISOString(),
  };

  if (domain) {
    embed.author = {
      name: domain,
      icon_url: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      url: product.url,
    };
  }

  const actionButtons = [
    {
      type: 2,
      style: 5,
      label: '🛒 Otwórz stronę produktu',
      url: product.url,
    },
  ];

  if (process.env.SPREADSHEET_ID) {
    actionButtons.push({
      type: 2,
      style: 5,
      label: '📊 Otwórz Arkusz',
      url: `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}`,
    });
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [embed],
        components: [
          {
            type: 1,
            components: actionButtons,
          },
        ],
      }),
    });
    console.log('  ✓ Alert o błędach wysłany na Discord');
  } catch (err) {
    console.error(`  ✗ Błąd Discord webhook: ${err.message}`);
  }
}

/**
 * Wysyła podsumowanie po sprawdzeniu wszystkich produktów.
 */
export async function sendSummary(stats) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  // Wysyłaj podsumowanie tylko gdy były nowe rozmiary
  if (stats.alerts === 0) return;

  const embed = {
    title: '📊 Podsumowanie sprawdzenia rozmiarów',
    color: 0x2196f3,
    fields: [
      { name: 'Sprawdzono', value: `${stats.checked}/${stats.total}`, inline: true },
      { name: 'Alerty (nowe rozmiary)', value: `${stats.alerts}`, inline: true },
    ],
    footer: { text: 'Size Checker' },
    timestamp: new Date().toISOString(),
  };

  const payload = { embeds: [embed] };

  if (process.env.SPREADSHEET_ID) {
    payload.components = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: '📊 Otwórz Arkusz',
            url: `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}`,
          },
        ],
      },
    ];
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`Błąd wysyłania podsumowania: ${err.message}`);
  }
}
