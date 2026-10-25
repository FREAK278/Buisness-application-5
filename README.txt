PAYMENT CALCULATOR PWA — VERSION 7 — UI REFRESH AND DATABASE SAVE FIX
===================================
Features:
- Add, rename, or remove companies in Menu > Company Settings.
- When removing a company with saved transactions, move those transactions to another company first.
- Reports section includes company/date filters, totals, average price, and selected-report CSV export.
- Company identity is stored separately from the display name, so renaming
  companies does not reassign old transactions.
- Existing payment formulas are preserved.
- Average Price has configurable denominator (net/actual), price stage
  (before deductions / after labour / after all deductions), company scope,
  and date range (custom/today/month/all).
- Defaults: net weight, before labour and 1%, selected company only,
  custom start/end dates.
- IndexedDB local transaction storage, history search and filters, receipt
  formatting, CSV export/import, and service-worker offline shell.
- Optional live CSV file connection: update the same CSV only when Sync CSV is tapped.
- Connected file handle is stored locally where browser support permits; permissions may need to be granted again.

Setup:
1. Extract all files.
2. Upload index.html, app.js, manifest.json, sw.js, icon.svg to a static HTTPS
   host such as GitHub Pages.
3. Open the published HTTPS URL in Chrome on Android.
4. Use Chrome menu > Add to Home screen / Install app.
5. In Menu > CSV file sync, tap Choose / Create CSV File and choose where payment_records.csv should be saved.
6. Whenever you want to update that file, tap Sync CSV. It replaces the file contents with all saved transactions.
7. Test with sample transactions, then export a separate CSV backup.
8. For offline test, open the app once online, then disable internet and reopen.

IMPORTANT:
- Local data is stored in the browser on this phone only; no cloud sync.
- Export backups regularly. Clearing browser data can delete transactions.
- Live CSV sync depends on browser support for the File System Access API. Some Android Chrome versions may not support it fully; manual CSV export remains available. Sync is manual only and does not run after each payment.
- Receipt printing opens the browser print flow. Direct Bluetooth ESC/POS
  printing needs printer-specific compatibility testing; don't buy a printer
  until the model and connection mode are confirmed.
- Company renaming changes the display name of old transactions while keeping
  their company identity. If you need the exact historical legal name frozen
  per transaction, that would require a separate snapshot field.


VERSION 7 UPDATE
- Refreshed responsive mobile UI with clearer spacing, stronger contrast, larger tap targets, and improved small-screen layouts.
- Transaction save now resolves only after the IndexedDB write transaction commits, rather than after the individual request succeeds.
- Added clearer database readiness/error handling for transaction read/write/delete operations.
- Service-worker cache version bumped to v7 so browsers can fetch the new UI and JavaScript.

TESTING NOTES
- JavaScript syntax is checked before release.
- Payment calculation arithmetic and required UI element references are checked by automated local smoke tests.
- Real Android Chrome, installed PWA, browser file picker, printing, and existing on-device database migration cannot be fully verified from this build environment. Back up CSV before updating and test with one sample transaction.


VERSION 8 UPDATE
- Refreshed mobile UI with larger touch targets, clearer navigation, improved contrast, and dashboard summary.
- Added missing refreshAll() function that was referenced by save, import, company management and startup.
- Verifies a transaction is present in local IndexedDB after save.
- CSV export/report and sync continue to use the full active transaction list.
- Service-worker cache bumped to v8 to help avoid serving stale app files.

TESTING NOTE: Run the included app on GitHub Pages/HTTPS after deployment. Browser file picker access and printing depend on Android Chrome permissions and device support.


Version 9 update: Menu -> Calculation Settings lets you save weight deduction (kg per actual quintal), labour rate, and final percentage deduction. New transactions store a snapshot of the formula settings; changing settings does not recalculate historical transactions. CSV exports include the formula rates used per transaction.
