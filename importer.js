// Bambu formats vary. Read known metadata; leave unknown values empty for review.
export function parseDuration(value) {
  const text = String(value ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text); // metadata prediction is seconds
  let seconds = 0, found = false;
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|m|s)/gi)) {
    seconds += Number(match[1]) * ({d:86400,h:3600,m:60,s:1}[match[2].toLowerCase()]); found = true;
  }
  return found ? seconds : null;
}
export function parseGcode(text) {
  const read = pattern => text.match(pattern)?.[1]?.trim();
  const weights = read(/^;\s*filament used\s*\[g\]\s*=\s*(.+)$/mi);
  const types = read(/^;\s*filament_type\s*=\s*(.+)$/mi)?.split(';').map(s => s.trim());
  const colors = read(/^;\s*filament_colour\s*=\s*(.+)$/mi)?.split(';').map(s => s.trim());
  const time = read(/^;\s*estimated printing time\s*\(normal mode\)\s*=\s*(.+)$/mi)
    ?? read(/^;\s*estimated printing time\s*=\s*(.+)$/mi)
    ?? read(/^;\s*total estimated time\s*=\s*(.+)$/mi);
  return {seconds:parseDuration(time), filaments: weights ? weights.split(/[,;]/).map((g,i) => ({id:String(i+1),grams:Number(g),type:types?.[i] || '',color:colors?.[i] || ''})).filter(f => Number.isFinite(f.grams) && f.grams >= 0) : []};
}
function xml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('The file contains unreadable XML metadata.');
  return doc;
}
function meta(node, key) {
  return [...node.querySelectorAll('metadata')].find(m => m.getAttribute('key') === key)?.getAttribute('value');
}
export function parseSliceInfo(text) {
  return [...xml(text).querySelectorAll('plate')].map((plate,i) => {
    const rawId = meta(plate,'index') ?? String(i+1);
    return {id:String(rawId), name:meta(plate,'plate_name') || `Plate ${rawId}`, seconds:parseDuration(meta(plate,'prediction')), filaments:[...plate.querySelectorAll('filament')].map(f => {
      const grams = f.getAttribute('used_g');
      return {id:f.getAttribute('id') || '',type:f.getAttribute('type') || '',color:f.getAttribute('color') || '',grams:grams === null ? null : Number(grams)};
    }).map(f => ({...f,grams:Number.isFinite(f.grams) && f.grams >= 0 ? f.grams : null}))};
  });
}
export async function importSlicer(file) {
  if (file.size > 150 * 1024 * 1024) throw new Error('This file exceeds the 150 MB import limit. Export a smaller plate or use plain G-code.');
  const base = file.name.replace(/\.(gcode\.3mf|3mf|gcode)$/i,'');
  if (/\.gcode$/i.test(file.name)) return {filename:file.name,plates:[{id:'1',name:base,...parseGcode(await file.text())}],warnings:[]};
  if (!/\.3mf$/i.test(file.name)) throw new Error('Choose a .3mf or .gcode file.');
  if (!globalThis.JSZip) throw new Error('ZIP library is missing. Check vendor/jszip.min.js.');
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(f => !f.dir);
  let expanded = 0;
  // Limit relevant uncompressed entries to avoid accidentally loading enormous archives.
  async function read(entry) {
    const size = entry._data?.uncompressedSize;
    if (!Number.isFinite(size) || size > 80 * 1024 * 1024 || expanded + size > 200 * 1024 * 1024) throw new Error('The archive metadata or G-code is too large to import safely.');
    expanded += size;
    return entry.async('string');
  }
  const info = entries.find(f => /(?:^|\/)slice_info\.config$/i.test(f.name));
  let plates = info ? parseSliceInfo(await read(info)) : [];
  const gcodes = entries.filter(f => /\.gcode$/i.test(f.name)).sort((a,b) => a.name.localeCompare(b.name,undefined,{numeric:true}));
  for (let i=0;i<gcodes.length;i++) {
    const entry = gcodes[i];
    const id = entry.name.match(/plate[_-]?(\d+)/i)?.[1] ?? String(i+1);
    let plate = plates.find(p => p.id === id);
    // Do not guess a mapping between mismatched plate identifiers.
    if (!plate) { plate = {id,name:`${base} · plate ${id}`,seconds:null,filaments:[]}; plates.push(plate); }
    if (plate.seconds === null || !plate.filaments.length || plate.filaments.some(f => f.grams === null)) {
      const parsed = parseGcode(await read(entry));
      if (plate.seconds === null) plate.seconds = parsed.seconds;
      if (!plate.filaments.length) plate.filaments = parsed.filaments;
      else if (plate.filaments.length === parsed.filaments.length) plate.filaments = plate.filaments.map((f,j) => ({...f,grams:f.grams ?? parsed.filaments[j].grams}));
    }
  }
  const warnings = [];
  if (!plates.length) {
    plates = [{id:'1',name:base,seconds:null,filaments:[]}];
    warnings.push('No sliced estimates found. Slice the project and export the sliced plate as .gcode.3mf, or enter values manually.');
  }
  if (plates.some(p => p.seconds === null || !p.filaments.length || p.filaments.some(f => f.grams === null))) warnings.push('Some estimates were unavailable. Missing fields are left blank; enter them before saving.');
  return {filename:file.name,plates,warnings};
}
