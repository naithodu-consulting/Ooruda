# Tech Debt

## Export / CSV / PDF Report infrastructure (billing)

**Status:** Dormant — code preserved, removed from billing UI  
**Logged:** 2026-08-10

### What exists

| File | Purpose |
|------|---------|
| `apps/web/components/export-menu.tsx` | Dropdown component: CSV download + PDF report (tabular). Props: `ids`, `count`, `noun`, `onCsvExport`, `pdfEndpoint`, `pdfFilename`. |
| `apps/web/lib/export-csv.ts` | `exportBillsCsv(bills)` — client-side CSV generation for bill rows |
| `apps/web/app/api/billing/bills/export/pdf/route.ts` | Server endpoint that renders a multi-bill tabular PDF report |

### Why it was removed from billing

Billing only needs **"Download Bills (N)"** — a ZIP of individual bill PDFs per unit/period. The CSV and PDF report exports added a second button (`ExportMenu`) that confused the UI and had no clear use case in the billing flow.

### Potential reuse

- **Reports screen** (planned): the CSV and tabular PDF report may be useful for the 4-tab chart-first reports screen. `ExportMenu` can be dropped in directly with the correct `pdfEndpoint`.
- If Reports does not pick this up, delete `export-menu.tsx`, `export-csv.ts`, and `api/billing/bills/export/pdf/` entirely.

### How to re-wire

```tsx
// In any table component that wants CSV + PDF report:
import { ExportMenu } from '~/components/export-menu';
import { exportBillsCsv } from '~/lib/export-csv';

<ExportMenu
  ids={rows.map((r) => r.id)}
  count={rows.length}
  noun="bills"
  onCsvExport={() => exportBillsCsv(rows)}
  pdfEndpoint="/api/billing/bills/export/pdf"
  pdfFilename="bills.pdf"
/>
```
