# EnviroIntel – Frontend

Frontend for the **Environmental Intelligence & Compliance Management System** (air-pollution MVP).
One React app with four role dashboards that share a single incident store.

| Route | View | Purpose |
|---|---|---|
| `/citizen` | Citizen | Report a complaint (English/Hindi, map pin, photo/video), track “My complaints” |
| `/admin` | Admin › Operations | KPI strip and the incident table (the main workspace), verification and allocation queues |
| `/admin/analytics` | Admin › Analytics | AQI/PM trends, priority-incident carousel, outlook, NAAQS screening, officer workload |
| `/admin/import` | Admin › Data Import & Analysis | Upload, extract, review/map, confirm, potential-incident review and approval |
| `/admin/reports` | Admin › Incident Reports | Generate, preview and version reports; download PDF / JSON / records CSV; print |
| `/stakeholder` | Stakeholder | Leaflet + OpenStreetMap hotspot map, filters, department- and area-wise reporting |
| `/field` | Field Officer | Assigned cases, inspection notes, before/after evidence, submit for verification |

Any incident opens in a shared detail drawer through `?incident=<ID>`, so links can be shared. Reports use `?for=<ID>`.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

`npm run build` type-checks and builds to `dist/`. Port 3000 matches the backend's default `ALLOWED_ORIGINS`.

## Data import workflow

1. **Upload**: drag and drop, or browse (several files at once). Supported: CSV, Excel (.xlsx/.xls), JSON, PDF, Word (.docx) and PNG/JPG/WEBP. Type, size and file-signature checks run first, so corrupted or renamed files fail with a message. Legacy `.doc` is rejected with "save as .docx".
2. **Extract**:
   - CSV: Papa Parse.
   - Excel: SheetJS; every worksheet is read.
   - JSON: needs an array, or an object with a `records`, `data` or `readings` array.
   - PDF: pdf.js, keeping page references.
   - DOCX: mammoth, keeping section and paragraph references.
   - Images: preview and attach-as-evidence only. OCR isn't available.
3. **Review**:
   - Columns are mapped automatically, even when names are inconsistent (`PM2.5 (µg/m3)`, `pm10_ugm3`, `Date Time`), and you can edit the mapping.
   - Validation runs live and reports missing values, invalid numbers and timestamps, duplicates, out-of-range values and an extraction confidence.
   - A normalised preview shows the transformations applied.
   - Dates are read as DD/MM/YYYY unless the day sits in the second position.
4. **Confirm import**: stores an `ImportBatch`. Every reading keeps its file name, upload time, batch ID, sheet/row or page reference, source organisation, original record ID, extraction status and transformations.
5. **Analysis** (rule-based, `services/analysis.ts`):
   - 24-hour averages from hourly data, needing at least 16 values per day (the CPCB rule).
   - NAAQS screening on matching averaging periods only.
   - Spike detection: at least 1.8× the preceding 24-value median, and in the station's top 5% of readings.
   - Source hypotheses from pollutant signatures (PM2.5/PM10 ratio, SO2, NO2, CO, night-time timing).
   - Links to citizen complaints within 5 km and ±48 hours.
   - Readings are grouped by station into potential incidents.
6. **Review and approve**: each finding shows its analysis, evidence with references, compliance, missing information and next steps. Approving creates a shared incident with status Assessed. You can add or correct coordinates and optionally assign straight away.

Sample files: `public/samples/demo-hourly-air-quality.csv` and `demo-daily-averages.json`. These are **simulated**, and contain deliberate data-quality problems to exercise validation.

## Incident reports

`generateIncidentReport` freezes a snapshot of the incident, its linked readings, daily aggregates, document findings and the originating finding as a new version. A report is "Draft" while the incident is open and "Final" once it is Verified Closed. If the incident changes after a report is generated, the view shows an "outdated" notice.

Each report has 11 sections:
1. Report Information
2. Executive Summary
3. Incident Details
4. Environmental Data Analysis (chart and tables)
5. Potential Source Analysis
6. Regulatory and Compliance Assessment
7. Evidence and Documentation (images, excerpts, row references)
8. Recommended Actions
9. Investigation History
10. AI Analysis and Limitations
11. Final Assessment

The preview uses Georgia for body text and Trebuchet MS for headings. The PDF (jsPDF) has a title block, a running header, page numbers, the source in the footer, and a disclaimer.

## Store actions

`submitComplaint`, `importEnvironmentalData`, `createPotentialIncident`, `approveIncident`, `dismissPotential`, `allocateIncident`, `addFieldUpdate`, `submitFieldAction`, `closeIncident`, `rejectAction`, `requestFurtherInvestigation`, `reopenIncident`, `updateIncidentStatus`, `generateIncidentReport`, `resetDemo`.

**Lifecycle:** Reported → Assessed → Allocated → Under Investigation → Action Submitted → Verification Pending → Verified Closed. Rejecting an action returns it to Under Investigation. A closed incident can be reopened.

## Compliance assessment labels

Each comparison gets one of four labels:
- Within selected reference limit
- Above selected reference limit
- Potential exceedance requiring verification
- Insufficient data for assessment

A comparison is only made when the observation's averaging period and unit match the NAAQS row. Imported or simulated data that exceeds a limit is always labelled "Potential exceedance requiring verification". AQI alone is never treated as a violation.

## Design system

- **Fonts** are system fonts (`src/index.css`): Arial for body text, Trebuchet MS for headings, Tahoma for navigation and labels, Verdana for supporting text, Georgia for reports, Courier New for identifiers.
- **Palette:** deep slate with a single teal accent. Rust is reserved for "demo" labels. Severity colours are fixed.
- **Effects:**
  - LiquidEther: a subtle background under near-opaque surfaces, falling back to a static tone without WebGL or with reduced motion.
  - GlowCursor: an optional trail; the native cursor stays visible, and it's off on touch devices and with reduced motion.
  - Carousel: Admin › Analytics priority incidents.
- Both effects can be toggled from the top bar.

## Backend integration status

| Endpoint | Status | Frontend use |
|---|---|---|
| `GET /api/health` | live | Backend status pill (real mode) |
| `POST /api/intelligence/upload-image` (field `image`) | live | Stores citizen complaint images (best effort, real mode) |
| `POST /api/intelligence/analyze-complaint` | 501 | Called in real mode; falls back to the in-browser rule engine |
| `POST /api/intelligence/upload-data` | live (validation only) | Not used yet; imports are parsed in the browser |
| `analyze-data`, `full-assessment`, complaints, reports | 501 / placeholder | Handled in the browser store |

Set `VITE_USE_REAL_API=true` and `VITE_API_BASE_URL` in `.env` to use the live endpoints. Never put API keys in `VITE_*` variables.

## Data honesty

- Seeded incidents, demo station readings, and the satellite and weather evidence are **simulated** and labelled.
- Imported data is labelled with its file of origin and is not treated as validated monitoring data.
- All "AI" analysis is an in-browser rule engine and says so wherever it appears. No AI model processes files.
- Source attributions are hypotheses. Confidence is not a share of the pollution.
- Trend estimates are linear extrapolations, not forecasts.
- Videos last for the browser session only. Images are downscaled and saved in localStorage.
