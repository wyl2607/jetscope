# HVO100 price sources (research, 2026-10)

Research date: 2026-10-21. All pages were opened read-only unless marked
"not opened". Values are copied from the pages as seen; nothing is estimated.
The Argus/O.M.R. values and terms, MTS-K fuel list, Tankerkönig schema,
Destatis diesel price, ADAC and clever-tanken statements, and the Neste
quotes were re-checked against the original pages on 2026-10-21.

## Summary

Partial. A verifiable, public, dated German HVO100 series exists — the Argus
O.M.R. national **wholesale** average (fca truck) — but its terms of use
prohibit copying, scraping, database storage and AI/ML use, so JetScope cannot
ingest or republish it without a written licence. No free public national
HVO100 **retail** average exists for Germany: ADAC, clever-tanken and
mehr-tanken expose station-level prices only and forbid reuse. Neste's
quarterly report and Sweden's monthly pump index provide dated EU context, but
neither yields a German Diesel–HVO100 spread. B2 is therefore still blocked
under the current "no paid feeds" rule.

## Candidates

### Argus Media — Diesel & HVO monthly averages (Germany, wholesale)

- URL opened:
  https://www.argusmedia.com/en/methodology/key-commodity-prices/diesel-and-hvo-monatsdurchschnitte
- Alternative URL opened (German, O.M.R.):
  https://www.omr.de/produkte/diesel-hvo-monatsdurchschnitte
- Coverage: German national average of daily price assessments for diesel
  10 ppm and HVO100, **wholesale** spot market, loading from tank farms onto
  trucks ("fca Truck"). The page says the averages are based on daily
  assessments for "various pricing regions in Germany". It is not a pump price
  and not a single station.
- Update frequency: daily month-to-date average plus monthly averages.
- Latest date seen on the page: 20/10/26 (daily line); monthly series through
  September 2026.
- Example values, verbatim (Euro/100 l):
  - `20/10/26 | 176.49 | 172.80` (Diesel | HVO)
  - `Sept 2026 | 188.08 | 184.03` (Diesel | HVO)
- Licence / terms:
  - https://www.omr.de/produkte/diesel-hvo-monatsdurchschnitte/nutzungsbedingungen
  - https://www.argusmedia.com/en/policies/terms-of-use
  - Key restriction (Argus page footer): "you will not copy or reproduce any
    part of its contents (including, but not limited to, single prices, graphs
    or news content) in any form or for any purpose whatsoever without the
    prior written consent of the publisher."
  - The O.M.R. terms add: no automated software, crawlers, spiders, datamining
    or screen-scraping on Argus platforms; no systematic downloading, caching
    or building a database; no use of free Argus content with machine learning
    or AI for any purpose.
- Automatic fetching: the HTML table is stable and `robots.txt` allows most
  paths, but the terms prohibit automated access, database building and AI use.
  No free CSV/XLSX/API. There is a PDF export link, but it does not grant
  redistribution rights.
- Verdict: **not usable as published for B2**, despite being the only exact
  public dated German HVO national series. Technically ideal, legally blocked.
  Usable only after a written Argus licence, and then only as a **wholesale**
  spread, not a pump-price spread.

### Argus O.M.R. PDF export

- URL: https://www.omr.de/en/products/diesel-hvo-monthly-averages/pdf?id=52
  (linked from the O.M.R. page; opened 2026-10-21, one page dated 21.10.2026).
- Coverage: same Diesel/HVO monthly and month-to-date averages in PDF form,
  monthly rows back to 2025 (e.g. `Sep 2026 188.08 184.03`, €/100 l).
- Licence: same Argus/O.M.R. terms as above; no reuse right is granted by the
  download.
- Verdict: not usable for the same reason as the HTML page.

### Bundeskartellamt — Markttransparenzstelle für Kraftstoffe (MTS-K)

- URL opened:
  https://www.bundeskartellamt.de/DE/Aufgaben/MarkttransparenzstelleFuerKraftstoffe/MTS-K_Infotext/mts-k_node.html
- Coverage: real-time station prices for **Super E5, Super E10 and Diesel**
  only, from about 15,000 German stations. MTS-K passes the data to approved
  consumer information services. It does **not** cover HVO100.
- Update frequency: real-time (price changes must be reported within five
  minutes); MTS-K publishes quarterly "Kraftstoff-News".
- Latest date seen: no publication date on the page; page content current on
  2026-10-21.
- Example quote, verbatim: "Unternehmen, die Tankstellen betreiben ... sind
  verpflichtet, jede Preisänderung bei Super E5, Super E 10 und Diesel „in
  Echtzeit“ zu melden."
- Licence / access: no open-data licence or bulk download. Data goes only to
  approved consumer information services (VIDs); approval is required.
- Automatic fetching: no public API or open dataset for arbitrary reuse.
- Verdict: **not usable for HVO100** — the statutory fuel list excludes it.
  This is the authoritative negative result for the "does MTS-K cover HVO100?"
  question. If MTS-K ever adds HVO100, Tankerkönig and similar services would
  become viable without scraping.

### Tankerkönig API

- URL opened: https://creativecommons.tankerkoenig.de/swagger/tankerkoenig.yaml
- Coverage: German station-level real-time prices. The API schema's fuel
  category enum is `diesel`, `lpg`, `gasoline`, `cng`; the statistics object
  exposes only `Diesel`, `E5`, `E10`. No HVO100 field.
- Update frequency: real-time.
- Latest date seen: schema version 4.0.6; no date on the document.
- Example, verbatim from the schema: `category: enum: diesel, lpg, gasoline,
  cng`; statistics keys `Diesel`, `E5`, `E10`.
- Licence: the API description says "Real time gas price data is available
  under open data/open source license even for commercial use." The example
  response for `/stats` shows `CC BY NC`; that inconsistency should be checked
  before any use.
- Automatic fetching: yes, JSON API with a free API key, but only for the three
  statutory fuel types.
- Verdict: **not usable for HVO100** — data model has no HVO. Could become
  usable if MTS-K coverage changes.

### clever-tanken.de — HVO Diesel price pages

- URL opened: https://www.clever-tanken.de/spritpreise/hvodiesel-preise
- Coverage: station and city-level HVO diesel search ("die günstigsten HVO
  Diesel Preise in Ihrer Stadt"). No national average, no monthly series.
- Update frequency: live station prices (the static HTML did not expose a
  numeric price; the page is a city index).
- Latest date seen: none on the page.
- Example, verbatim: "Finden Sie auf clever-tanken.de die günstigsten HVO
  Diesel Preise in Ihrer Stadt".
- Licence: "Jegliches Weiterverarbeiten oder Zitieren unserer Informationen
  -auch auszugsweise- bedarf der ausdrücklichen Genehmigung von
  clever-tanken.de." (AGB linked from the page).
- Automatic fetching: no public API; JavaScript-driven; reuse is prohibited.
- Verdict: **not usable** — station-level only, and reuse requires permission.
  A national average would have to be computed from station data, which the
  terms do not allow.

### mehr-tanken.de

- URL opened: https://www.mehr-tanken.de/
- Coverage: station-level comparison. HVO100 appears in the fuel selector as
  "Klimadiesel 90 (HVO100)". The site's "Spritpreisindex" covers Diesel, Super
  E5 and Super E10 only; no HVO100 index.
- Update frequency: live station prices; index appears to be current.
- Latest date seen: none on the page.
- Example, verbatim: selector entry "Klimadiesel 90 (HVO100)".
- Licence: AGB / Nutzungsbedingungen are linked in the footer; not opened in
  this research. The site presents itself as consumer information.
- Automatic fetching: no documented public API for HVO; likely scraping only,
  with unclear permission.
- Verdict: **not usable** — no national HVO100 average and no clear reuse
  right.

### ADAC fuel price search

- URL opened:
  https://www.adac.de/verkehr/tanken-kraftstoff-antrieb/kraftstoffpreise/
- Coverage: station-level search across Germany, including HVO100. ADAC's
  monthly fuel-price evaluations (e.g. the April 2026 press release) cover
  Super E10 and Diesel only; no HVO100 monthly average was found.
- Update frequency: real-time station prices.
- Latest date seen: none on the search page (live).
- Example, verbatim: "In Echtzeit bilden wir hier die aktuellen Preise von
  Super E10, Super, Diesel, HVO100 und Erdgas/CNG ab."
- Licence: ADAC imprint says: "Es ist daher unzulässig, Inhalte des
  Internet-Auftritts („ADAC Inhalte“) ohne Genehmigung durch den ADAC e.V. zu
  vervielfältigen, zu verbreiten oder öffentlich wiederzugeben."
  https://www.adac.de/impressum-ev/
- Automatic fetching: no public API documented; the search is interactive.
  Copyright forbids reproduction without permission.
- Verdict: **not usable for a national average** — station search only, no
  published national HVO series, and reuse is restricted.

### Destatis — EU fuel price comparison

- URL opened:
  https://www.destatis.de/Europa/DE/Thema/Verkehr/kraftstoffpreise.html
- Coverage: German and EU pump prices for Euro-super 95 (E5) and diesel only.
  No HVO100.
- Update frequency: weekly, following the EU Weekly Oil Bulletin; text last
  updated 15.10.2026, data for 12.10.2026.
- Latest date seen: 15.10.2026 (text), 12.10.2026 (prices).
- Example, verbatim: "Dieselkraftstoff kostete in Deutschland am 12. Oktober
  2026 im Tagesdurchschnitt 2,27 Euro pro Liter."
- Licence: Destatis copyright; no open bulk dataset for this page. The page
  itself names MTS-K as the German source and the European Commission as the
  upstream source.
- Automatic fetching: possible via the EU Bulletin workbook, but only for
  E5/diesel.
- Verdict: **not usable for HVO100**; useful only for the fossil leg of a
  spread.

### European Commission — Weekly Oil Bulletin

- URL opened:
  https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en
- Coverage: weekly consumer prices for petroleum products in EU countries.
  The published files are "eurosuper 95" and "diesel" maps plus price
  workbooks; no HVO100 product.
- Update frequency: weekly (data submitted Wednesdays, bulletin Thursdays).
- Latest date seen: downloads dated 15 October 2026.
- Example, verbatim from the page: "presents weekly consumer prices for
  petroleum products in EU countries"; the listed products are eurosuper 95
  and diesel.
- Licence: European Commission reuse policy (Decision 2011/833/EU) generally
  allows reuse with attribution; check the legal notice for the specific file.
- Automatic fetching: yes, stable XLSX history workbook. This is already used
  by B1 for German diesel.
- Verdict: **not usable for HVO100** — no HVO series. Best available free,
  machine-readable fossil leg.

### UFOP — Marktinformation Ölsaaten und Biokraftstoffe

- URL opened: https://www.ufop.de/medien/downloads/agrar-info/marktinformationen
- PDF opened (October 2026 issue):
  https://www.ufop.de/index.php/download_file/15108/619/
- Coverage: monthly oilseed, vegetable-oil and biodiesel market report. The
  October 2026 issue discusses HVO import volumes but contains **no HVO100
  price table**. It reports biodiesel/feedstock prices from AMI, not a pump or
  wholesale HVO series.
- Update frequency: monthly.
- Latest date seen: October 2026 issue.
- Example, verbatim (HVO volume, not price): "die Menge stieg von 68.500 t im
  Vorjahreszeitraum auf 337.100 t" (imported HVO, first half 2026, citing
  BAFA).
- Licence: PDF imprint: "Abdruck, Auswertung und Weitergabe nur mit
  ausdrücklicher Genehmigung." (AMI data, all rights reserved).
- Automatic fetching: PDF only; no API; reuse requires permission.
- Verdict: **not usable as a price source** — no HVO price series and
  restricted redistribution. Useful only for context on HVO volumes.

### Neste — Half-year financial report January–June 2026

- URL opened:
  https://news.cision.com/neste/r/neste-s-half-year-financial-report-for-january-june-2026,c4377234
- PDF opened: https://mb.cision.com/Main/16699/4377234/4201826.pdf
- Coverage: company financials and market commentary. It contains a dated
  European HVO Class II price observation and a quarterly renewable-products
  sales margin, but no German retail or national average series.
- Update frequency: quarterly.
- Latest date seen: report dated 23 July 2026 (Espoo); results call 24 July 2026.
- Example values, verbatim:
  - "European HVO class II prices reached 3,152 USD/t but eased towards the end
    of the quarter."
  - "Renewable Products' comparable sales margin was USD 1,223 (361)/ton".
- Licence: public listed-company report; normal copyright, quotation with
  attribution is possible. No open-data licence for building a price database.
- Automatic fetching: stable HTML/PDF each quarter; low frequency and not a
  price series.
- Verdict: **not usable for B2** as a spread input. Useful as a dated
  cross-check of European HVO wholesale levels and margins.

### Partnersamverkan — HVO-Index vid pump (Sweden)

- URL opened: https://partnersamverkan.se/index/index-hvo
- Latest PDF opened:
  https://partnersamverkan.se/app/uploads/sites/2/2026/10/HVO-pump-2026-09.pdf
- Coverage: Swedish national **pump** HVO index, base January 2016 = 100.
  It is an index used in public-transport contracts, not a price in SEK/l and
  not a German series.
- Update frequency: monthly; "Ny rekommendation publiceras i mitten av varje
  månad" (a new recommendation is published in the middle of each month).
- Latest date seen: September 2026 (PDF in the October 2026 folder).
- Example values, verbatim: `2026 209.8 211.4 234.1 269.4 255.2 240.9 246.6
  263.5 288.4 9.5` (Jan–Sep index values; last figure is Sep/Aug change in %).
- Licence: no explicit reuse licence found on the index page or PDF; treat as
  all rights reserved until clarified with Partnersamverkan.
- Automatic fetching: stable monthly PDF, easy to parse, but it is an index,
  not a price level.
- Verdict: **not usable for a Diesel–HVO spread** — wrong country and no price
  level. Possible trend proxy at most.

### Fastmarkets — HVO price launch article

- URL opened:
  https://www.fastmarkets.com/insights/fastmarkets-price-launch-what-is-hydrotreated-vegetable-oil-hvo
- Coverage: announcement of twelve European HVO price assessments (Crop, UCO,
  Tallow, POME; outrights, premiums and margins). The free article contains no
  current price values.
- Update frequency: assessments are subscription-based; article dated
  1 May 2026.
- Latest date seen: 1 May 2026.
- Example, verbatim: "Fastmarkets will publish twelve HVO price assessments".
- Licence: subscription terms; free article is marketing content only.
- Automatic fetching: no free API/CSV; paywalled.
- Verdict: **not usable** — paywalled, no free values.

### Greenea — HVO and SAF coprocessing article

- URL opened:
  https://www.greenea.com/en/publication/hvo-and-saf-coprocessing-why-is-the-potential-not-maximized/
- Coverage: European HVO market commentary. Gives a premium range over gasoil,
  not a German price series and not a dated daily/monthly index.
- Update frequency: occasional article; May 2026.
- Latest date seen: May 2026.
- Example, verbatim: "HVO/gasoil premium in 1 year (€700→€1,400/m³)".
- Licence: Greenea legal information; full analysis is gated ("Read the full
  GREENEA analysis"), no open-data licence.
- Automatic fetching: no free data feed.
- Verdict: **not usable for B2** — commentary/gated data, not a price series.

### hvo100.team — secondary article republishing Argus values

- URL opened:
  https://hvo100.team/hvo100-guenstiger-als-diesel-grosshandel/
- Coverage: German wholesale Diesel/HVO monthly averages, explicitly sourced
  from Argus. This is a secondary reproduction, not an independent source.
- Update frequency: irregular campaign article; 25 September 2026.
- Latest date seen: 25 September 2026, data "Stand 24.09.2026".
- Example, verbatim: "kostet Diesel 10ppm 187,92 Euro pro 100 Liter, HVO100
  dagegen nur 183,79 Euro".
- Licence: campaign site; no reuse licence for the Argus data. The article
  itself says the daily wholesale prices can be viewed at Argus.
- Automatic fetching: no API; not a primary source.
- Verdict: **not usable** — derivative of Argus, same rights problem, and not
  authoritative.

### Other candidates (no usable price data / not opened)

- **S&P Global Platts (HVO/RD assessments)**: not opened — the public
  methodology page returned HTTP 403 on 2026-10-21. Assessments are published
  in subscription products (Platts Biofuels Alert, Global Alert, database);
  no free current values. Verdict: not usable.
- **OPIS**: not opened. Known subscription price-reporting service; no free HVO
  series found. Verdict: not usable.
- **AMI (Agrarmarkt Informations-Gesellschaft)**: not opened as a price page.
  AMI data appears inside UFOP reports under "© AMI Alle Rechte vorbehalten";
  no public HVO100 price series. Verdict: not usable.
- **BAFA**: not opened. BAFA publishes biofuel consumption/volume statistics
  (cited by UFOP), not HVO pump or wholesale prices. Verdict: not usable.
- **DEKRA**: not opened. Technical/testing organisation; no fuel price series.
  Verdict: not usable.
- **eFuel Alliance**: not opened. Industry advocacy body; no dated HVO price
  series found. Verdict: not usable.
- **TankBillig / fuel-prices.eu / normanekonomi.se**: not opened as primary
  data. These are third-party aggregators of varying provenance; no German
  HVO100 national average with a clear reuse licence was established. Verdict:
  not usable for B2 without provenance and permission.

## Conclusion for B2

B2 cannot be shipped as a free, automated Diesel–HVO100 spread today.

- **What exists**: Argus O.M.R. publishes exactly the needed German national
  HVO100 wholesale series, dated daily and monthly, free to read. It is the
  only candidate that passes the "national, dated, verifiable" test.
- **Why it still fails B2**: the terms prohibit copying single prices,
  scraping, database storage and AI/ML use. JetScope's ingestion and display
  would violate those terms. The plan also says "No paid feeds", so buying an
  Argus licence is currently out of scope.
- **Retail gap**: no free public German HVO100 pump average exists. ADAC,
  clever-tanken and mehr-tanken show station-level prices and restrict reuse;
  MTS-K's statutory coverage is E5/E10/diesel only. Computing an average from
  those station pages would be a scrape, not a licensed national price.
- **EU proxies are not substitutes**: Neste gives quarterly European HVO
  Class II price points and margins; Sweden's Partnersamverkan gives a monthly
  pump index (base 2016 = 100). Neither is a German retail price or a price
  level that can be paired with German diesel.

Recommended paths, in order:

1. **Keep B2 blocked** and record the blocker explicitly: "no free, reusable,
   national HVO100 price source; Argus wholesale series exists but is
   licence-restricted." This is the honest state under the current plan.
2. **If B2 may be wholesale and a licence is allowed**, license Argus O.M.R.
   HVO Germany and use its Diesel 10 ppm series for the other leg. Label the
   result `wholesale_fca_truck`, region Germany, source Argus, with the
   assessment date. This is the cleanest technically correct implementation.
3. **If B2 must be retail and free**, the missing piece is a data-sharing
   agreement with ADAC, clever-tanken or mehr-tanken (or an MTS-K extension to
   HVO100). Without one, do not ship a single-station or scraped "average".
4. **Interim UI**: show B2 as "data not available" with the reason and a link
   to the Argus page, rather than a low-quality proxy. If a qualitative signal
   is needed, Neste's quarterly HVO Class II commentary can be shown as
   context, clearly labelled as European wholesale, not as the B2 spread.

The decisive policy question is whether JetScope will accept a licensed
wholesale feed. If the answer stays "no paid feeds", B2 remains blocked by
design, not by missing research.
