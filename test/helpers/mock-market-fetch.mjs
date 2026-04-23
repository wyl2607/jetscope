const csvResponse = (rows) => `DATE,VALUE\n${rows.map(([date, value]) => `${date},${value}`).join('\n')}\n`;

const htmlCbam = `
  <html><body>
    <table>
      <tr><td>Q2 2026 15 June 2026 54.25</td></tr>
    </table>
  </body></html>
`;

const htmlEia = `
  <html><body>
    <h1>Wholesale Spot Petroleum Prices, 4/16/2026 Close</h1>
    <table>
      <tr><td class="s2">Brent</td><td class="d1">88.44</td></tr>
    </table>
  </body></html>
`;

const xmlEcb = `
  <gesmes:Envelope>
    <Cube>
      <Cube time="2026-04-16">
        <Cube currency="USD" rate="1.0825"/>
      </Cube>
    </Cube>
  </gesmes:Envelope>
`;

const responseMap = new Map([
  [
    'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU',
    csvResponse([
      ['2026-04-15', '86.10'],
      ['2026-04-16', '87.75']
    ])
  ],
  [
    'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DJFUELUSGULF',
    csvResponse([
      ['2026-04-15', '6.420'],
      ['2026-04-16', '6.810']
    ])
  ],
  ['https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en', htmlCbam],
  ['https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', xmlEcb],
  ['https://www.eia.gov/todayinenergy/prices.php', htmlEia]
]);

globalThis.fetch = async function mockFetch(url) {
  const key = typeof url === 'string' ? url : url.toString();
  if (!responseMap.has(key)) {
    return {
      ok: false,
      status: 404,
      async text() {
        return 'missing';
      }
    };
  }

  return {
    ok: true,
    status: 200,
    async text() {
      return responseMap.get(key);
    }
  };
};
