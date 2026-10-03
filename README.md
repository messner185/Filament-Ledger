# Filament Ledger — a beginner HTML/CSS/JavaScript project

A local browser application for tracking physical filament spools, estimating print costs, recording consumption, and importing Bambu Studio slicer exports. No accounts, backend, or build step are required. JSZip is included locally, so normal operation does not need an internet connection.

## Start in VS Code

1. Extract the project ZIP into a folder you can edit.
2. Install Visual Studio Code from https://code.visualstudio.com/.
3. Choose **File → Open Folder** and open `filament-tracker`.
4. In Extensions, install **Live Server** by **Ritwick Dey**.
5. Right-click `index.html` and choose **Open with Live Server**.
6. Keep using the same browser and address, including the port. Browser storage is separate for each origin (scheme, hostname, and port).

Do not double-click the HTML file: JavaScript modules need an HTTP server.

Alternative if Python is installed: open a terminal in this folder and run:

```bash
python -m http.server 5500 --bind 127.0.0.1
```

Open http://localhost:5500. Press Ctrl+C in the terminal to stop the server.

## Try your first print

Use the workshop navigation to jump between **New print**, **Spool library**, **Print history**, and **Cost & pricing**. The print form groups details, filament/labor, and review into three steps. **Add spool** opens the inventory form directly. Navigation preserves your unfinished draft; rate guidance and fee sources are available under the pricing settings. On smaller screens, navigation moves to the top and cards stack vertically.

Use the **Dark mode** toggle in the header (moon icon on small screens) to switch themes. Before you choose a theme, the app follows your device's appearance setting. Your choice is remembered in this browser under `filament-ledger-theme`, separately from inventory and backups.

1. Open **Add a spool**. Enter a name, original usable filament weight, remaining weight, and purchase price. Do not include the empty spool's weight.
2. Save the spool. It appears in the inventory.
3. Enter a print name, duration in hours, choose the spool, and enter filament grams.
4. With a $25 / 1,000 g spool and 80 g usage, the filament component should be $2.00. The total also includes electricity and machine allowance.
5. Save as **Planned** to leave inventory unchanged.
6. In history, click **Load plan**, review actual duration and grams, choose Completed or Failed, and save. Failed prints also consume filament.
7. Refresh the browser. The data should remain.
8. Click **Export backup** and save the JSON file somewhere safe.

## Import from Bambu Studio

1. Slice your plate in Bambu Studio.
2. Export the sliced plate as `.gcode.3mf` (the exact menu wording depends on the version).
3. Click **Import Bambu file** and select the export.
4. If multiple plates are detected, choose the correct plate.
5. The selected plate's filaments are matched to active inventory by material and color (ignoring case and surrounding whitespace). Missing materials/colors automatically create and select a new spool. Repeated imports reuse matching spools. New spools assume 1,000 g original and remaining weight, zero purchase price, and an unknown brand: use **Review imported spool** in inventory to correct these details before recording a print. If multiple spools match, choose the physical spool yourself. Entries without a material remain unassigned; select or add a spool manually. Archived spools are excluded from matching. Review every selection because material/color does not uniquely identify a physical spool.
6. Review the duration and grams. Missing fields remain blank. You must enter missing numbers before saving.
7. Save as Planned. Once the job finishes, load the plan and review actual consumption before recording completion or failure.

The importer reads known `Metadata/slice_info.config` XML fields (`prediction` in seconds and filament `used_g`), with plain embedded G-code comments as a fallback. It also accepts plain `.gcode` files. Export layouts can vary across Bambu Studio versions. A project `.3mf` without sliced metadata will require manual inputs; proprietary binary G-code is not decoded. Printer settings are not written back into Bambu Studio. This app does not communicate with your printer.

### Folder access

Desktop Chrome/Edge on localhost usually show **Connect export folder**. Select a directory, grant read access, then choose an export from the list. After saving a new export, click **Check folder** to refresh it. Only direct files in that folder are listed. Permission and the directory handle are not retained after a page reload. Other browsers can use the ordinary file importer.

This is deliberate manual folder checking, not unattended folder monitoring. The browser must remain open. A future local helper program could watch files while the app is closed.

## Costs and data

### Suggested selling prices

Enter hands-on labor minutes and overhead for each job. **Selling price settings** supplies the hourly labor rate, default overhead, combined percentage fees, fixed fee per order, and target profit margin. The estimate shows print cost, labor, overhead, selling fees, suggested price, and projected profit. Suggested prices are saved with prints and shown in history; they are not actual sales or realized profit.

- Labor: use hands-on time for setup, support removal, finishing, packaging, and communication, not unattended printing. The UI's $20–$35/hour range and default 20/hour are illustrative planning values, not established industry rates.
- Overhead: monthly business expenses ÷ expected monthly orders. For example, $100 ÷ 20 orders = $5/job. Avoid duplicating machine allowance; put packaging and expected reprint costs in Other costs once.
- Profit margin: 20–40% is an illustrative range; the default is 30%. Choose a sustainable target and compare the suggested price with market demand. Margin is profit divided by selling price, not a percentage added to cost.
- Fee examples checked October 2, 2026: [Stripe U.S. online domestic cards](https://stripe.com/pricing) charge 2.9% + $0.30. [Etsy transaction fees](https://www.etsy.com/legal/fees/) are 6.5%, plus [U.S. payment processing](https://www.etsy.com/legal/etsy-payments/) of 3% + $0.25; a $0.20 listing fee can bring a one-item example to 9.5% + $0.45. Advertising, other charges, shipping/tax fee bases, and local rates may add costs. Use your actual fees and allocate fixed fees if one order contains several prints.

Formula: `(print cost + labor + overhead + fixed fee) / (1 - feePercent/100 - margin/100)`. Percentage fees and margin together must be below 100%. Suggested prices round up to the selected currency's smallest unit and exclude sales tax. All monetary inputs use the selected currency; USD examples are not converted automatically.

Existing backups remain supported and gain pricing defaults. Historical records without quotes keep their original costs. Changing settings does not rewrite saved quotes. Loading a plan preserves its labor minutes and overhead but recalculates using current rates when saved.

### Print costs and inventory

- Filament: `purchase price / original filament grams × consumed grams`.
- Electricity: `average watts / 1,000 × hours × electricity price per kWh`.
- Machine allowance: `hours × hourly allowance`.
- Total: filament + electricity + machine allowance + other costs.
- Printing duration uses decimal hours: 1 hour 30 minutes is 1.5.
- Include supports, brims, and purge waste in consumption. Imported values are slicer estimates.
- Each physical spool has a separate ID. Multiple filament rows may map to the same spool; their usage is combined before checking stock.
- Historical costs and currency are saved per print. Changing settings affects new calculations. Loading a plan recalculates it using current settings when saved.
- Archive keeps a spool for history but removes it from active inventory totals and new spool selections. Existing plans can still use their original archived spools.
- **Delete spool** permanently removes a spool from the library after confirmation. Recorded print names, usage, and costs remain in history. Plans referencing it must be loaded and assigned a replacement spool before saving. Undo restores consumption only to spools still in the library; it does not recreate deleted spools. Export a backup first if you might need to recover the spool. Importing that filament again can create a new spool.
- Imported hex colors display an exact RGB swatch in inventory and import rows. An offline copy of [Bambu Studio's official color catalog](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/filament/filaments_color_codes.json) supplies shade names for exact, unambiguous matches, such as `#0056B8` → “Cobalt Blue (Bambu catalog)”. Material information narrows the lookup: `#0086D6` is “Cyan” for PLA Basic and “Navy Blue” for PETG Basic. If the material is too broad to distinguish names, the color is custom, or no catalog entry matches, a broad approximate name is used. Six-digit RGB and eight-digit RGB-plus-alpha values are supported; the swatch and catalog lookup use the opaque RGB portion. Original color values stay stored for import matching. A catalog match does not establish the physical spool's brand. Catalog provenance and update instructions are in `vendor/BAMBU-COLORS.md`.
- Undo removes the recorded print and returns its filament. To correct a completed print, undo it and enter the corrected record.
- State is stored under `filament-ledger-v1` in localStorage, with one saved document per update. Validation or storage errors prevent the app from accepting a change.
- Clearing browser data, using another browser, or changing the site address can make your inventory unavailable. Export backups regularly. Hosting these files does not synchronize browser inventories.
- Restore validates a backup, then asks before replacing the current inventory. There is no merge operation.

## Files to learn from

| File | Purpose |
|---|---|
| `index.html` | Page structure, forms, labels, sections |
| `style.css` | Layout, colors, responsive design |
| `script.js` | Events, rendering, browser storage, file/folder selection |
| `core.js` | Cost calculation, stock deduction, undo, backup validation |
| `importer.js` | ZIP metadata, XML, and G-code parsing |
| `colors.js` | Hex swatches, official Bambu shade lookup, and approximate fallback names |
| `vendor/bambu-colors.js` | Offline Bambu single-color catalog |
| `vendor/jszip.min.js` | Third-party ZIP library; do not edit |
| `tests/core.test.js` | Checks for calculations and stock behavior |
| `tests/colors.test.js` | Checks for hex display and unknown color handling |

Useful JavaScript terms: `const` declares a variable; an object groups named values; an array stores a list; a function performs a reusable task; `addEventListener` responds to user activity; `querySelector` finds an HTML element; `async/await` handles work that finishes later.

### Suggested learning order

1. Change the title in `index.html` and the button colors in `style.css`.
2. Read the `calculate()` function in `core.js`; change the settings in the UI and check its result by hand.
3. Follow the spool form submit handler in `script.js`: form values → new object → save → render.
4. Add a new optional spool field, updating the form, submit handler, validation, and display together. Keep a backup before changing the storage format.
5. Study `importer.js` after you are comfortable with functions, arrays, objects, and events.

Use https://developer.mozilla.org/en-US/docs/Learn_web_development as a reference. Open your browser's developer tools (usually F12) to inspect elements and read console errors.

## Optional automated checks

Install Node.js 22 or newer. From this folder:

```bash
npm test
```

There is no npm install step for running the application or these core tests. The vendored JSZip version is 3.10.1, distributed under the MIT license (see `vendor/JSZIP-LICENSE.txt`).

## Next improvements you can build yourself

- Inventory adjustment records for measured spool weights.
- CSV history exports and date/material filtering.
- Import support verified against more real slicer exports.
- A local file watcher or shared database, once you want automatic monitoring or cross-device synchronization.

## Verification included with this starter

Nine automated core checks cover costs, inventory, backups, and G-code parsing. The implementation was also checked in Chromium for spool creation, synthetic Bambu ZIP imports, multiple plates/filaments, planned-to-completed transitions, undo, refresh persistence, backups, text escaping, and desktop/mobile layout. The small files under `tests/fixtures/` are synthetic learning examples, not real printer-ready exports. Do not send them to a printer.

The importer still needs verification against your own Bambu Studio export; no real export was supplied. Folder permissions need a manual check on your computer. An optional feature-detected browser-agent API is included; actual WebMCP registration could not be validated in a supported browser context. It is skipped in ordinary browsers and is unnecessary for normal use.
