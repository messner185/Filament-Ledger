# Bambu color catalog

`bambu-colors.js` contains single-color records from Bambu Lab's official Bambu Studio catalog, retrieved on 2026-10-02:

https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/filament/filaments_color_codes.json

Source SHA-256: `5af6c01befa0a3cd67b604869671ce05a1caf4df2bf473df644554ce98d559b4`.

Each record is `[hex, filamentType, englishColorName]`. Only records with exactly one `fila_color` are included; multicolor products cannot be identified from one RGB value. Duplicate records are removed. Names are factual catalog data; no upstream application code is included.

To update, download the official JSON and run this Python snippet from the repository root, adjusting the path and retrieval date. Update this document's date and checksum, then run `npm test`.

```python
import json, hashlib
from pathlib import Path

source = Path('/tmp/filaments_color_codes.json')
rows = json.loads(source.read_text())['data']
colors = sorted({(r['fila_color'][0].upper(), r['fila_type'],
                  r['fila_color_name']['en']) for r in rows
                 if len(r.get('fila_color', [])) == 1})
header = '// Bambu Studio official single-color catalog, retrieved YYYY-MM-DD.\n'
header += '// Source and update instructions: vendor/BAMBU-COLORS.md\n'
body = ',\n'.join('  ' + json.dumps(row, ensure_ascii=False) for row in colors)
Path('vendor/bambu-colors.js').write_text(header + 'export const bambuColors = [\n' + body + '\n];\n')
print(hashlib.sha256(source.read_bytes()).hexdigest())
```

The app uses exact RGB matches, narrows by filament type when supplied, and accepts an official name only when the remaining records agree on it. Lookup does not prove that a physical spool is Bambu-branded. The original stored hex values and inventory matching are unchanged.
