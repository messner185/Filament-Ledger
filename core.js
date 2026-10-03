// Pure functions: no browser interface code here, so calculations are easy to test.
export const VERSION = 1;
export const PRICING_DEFAULTS = {laborRate:20, overhead:0, feePercent:0, fixedFee:0, margin:30};
export function initialData() {
  return {version: VERSION, spools: [], prints: [], settings: {currency: 'USD', electricity: .30, watts: 150, machine: .50, ...PRICING_DEFAULTS}};
}
export function nonnegative(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a nonnegative number.`);
  return n;
}
// Slicer metadata identifies a material/color, not a particular physical spool.
export function prepareImportedSpools(data, filaments, makeId) {
  const next = structuredClone(data), added = [];
  const normalize = value => String(value ?? '').trim().toLowerCase();
  const colorKey = value => normalize(value).replace(/^(#[0-9a-f]{6})ff$/, '$1');
  const usages = filaments.map(filament => {
    const material = String(filament.type ?? '').trim();
    const color = String(filament.color ?? '').trim();
    if (!material) return {spoolId:'', grams:filament.grams};
    const matches = next.spools.filter(s => !s.archived && normalize(s.material) === normalize(material) && colorKey(s.color) === colorKey(color));
    if (matches.length > 1) return {spoolId:'', grams:filament.grams};
    let spool = matches[0];
    if (!spool) {
      spool = {id:makeId(), name:[material, color].filter(Boolean).join(' · '), brand:'', material, color, price:0, original:1000, remaining:1000, archived:false, needsReview:true};
      next.spools.push(spool); added.push(spool);
    }
    return {spoolId:spool.id, grams:filament.grams};
  });
  return {data:next, usages, added};
}
export function calculate(data, usages, hours, other) {
  hours = nonnegative(hours, 'Duration'); other = nonnegative(other, 'Other costs');
  let filament = 0;
  for (const usage of usages) {
    const spool = data.spools.find(s => s.id === usage.spoolId);
    if (!spool) throw new Error('Choose a spool for each filament.');
    filament += spool.price / spool.original * nonnegative(usage.grams, 'Filament weight');
  }
  const electricity = data.settings.watts / 1000 * hours * data.settings.electricity;
  const machine = hours * data.settings.machine;
  return {filament, electricity, machine, other, total: filament + electricity + machine + other, currency: data.settings.currency};
}
export function deleteSpool(data, id) {
  if (!data.spools.some(s => s.id === id)) throw new Error('Spool not found.');
  const next = structuredClone(data);
  next.spools = next.spools.filter(s => s.id !== id);
  for (const print of next.prints) for (const usage of print.usages) {
    if (usage.spoolId === id) { usage.spoolId = null; usage.deletedSpool = true; }
  }
  return next;
}
export function calculateSellingPrice(cost, inputs) {
  const pricing = {};
  for (const key of ['laborMinutes','laborRate','overhead','feePercent','fixedFee','margin']) pricing[key] = nonnegative(inputs[key], key);
  if (pricing.feePercent + pricing.margin >= 100) throw new Error('Selling fee and profit margin together must be below 100%.');
  const labor = pricing.laborMinutes / 60 * pricing.laborRate;
  const totalCost = nonnegative(cost.total,'Print cost') + labor + pricing.overhead;
  const rawPrice = (totalCost + pricing.fixedFee) / (1 - (pricing.feePercent + pricing.margin) / 100);
  const digits = new Intl.NumberFormat('en',{style:'currency',currency:cost.currency}).resolvedOptions().maximumFractionDigits;
  const scale = 10 ** digits;
  const sellingPrice = Math.ceil(rawPrice * scale) / scale;
  const sellingFees = sellingPrice * pricing.feePercent / 100 + pricing.fixedFee;
  const profit = Math.max(0,sellingPrice - totalCost - sellingFees);
  if (![labor,totalCost,sellingPrice,sellingFees,profit].every(Number.isFinite)) throw new Error('Pricing values are too large.');
  return {...pricing, labor, totalCost, sellingPrice, sellingFees, profit};
}
export function recordPrint(data, print) {
  if (data.prints.some(p => p.id === print.id)) throw new Error('This print has already been saved.');
  if (!['planned', 'completed', 'failed'].includes(print.status)) throw new Error('Unknown print status.');
  const next = structuredClone(data);
  print = structuredClone(print);
  print.cost = calculate(data, print.usages, print.hours, print.other);
  if (print.pricing !== undefined) print.pricing = calculateSellingPrice(print.cost,print.pricing);
  print.usages = print.usages.map(u => ({...u, spoolName: data.spools.find(s => s.id === u.spoolId).name}));
  if (print.status !== 'planned') {
    const totals = new Map();
    for (const u of print.usages) totals.set(u.spoolId, (totals.get(u.spoolId) || 0) + u.grams);
    for (const [id, grams] of totals) {
      const spool = next.spools.find(s => s.id === id);
      if (grams > spool.remaining + 1e-8) throw new Error(`Not enough filament on ${spool.name}. Review grams used.`);
      spool.remaining = Math.max(0, spool.remaining - grams);
    }
  }
  next.prints.unshift(print);
  return next;
}
export function undoPrint(data, id) {
  const next = structuredClone(data);
  const print = next.prints.find(p => p.id === id);
  if (!print) throw new Error('Print not found.');
  if (print.status !== 'planned') for (const u of print.usages) {
    if (u.deletedSpool === true && u.spoolId === null) continue;
    const spool = next.spools.find(s => s.id === u.spoolId);
    if (!spool) throw new Error('The original spool is missing.');
    spool.remaining += u.grams;
  }
  next.prints = next.prints.filter(p => p.id !== id);
  return next;
}
// Validate backups before trusting or replacing the current inventory.
export function validateData(d) {
  const fail = () => { throw new Error('Invalid backup. Your current data has not been changed.'); };
  const num = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const str = s => typeof s === 'string' && s.length <= 2000;
  if (!d || d.version !== VERSION || !Array.isArray(d.spools) || !Array.isArray(d.prints) || !d.settings) fail();
  const s = d.settings;
  if (!/^[A-Z]{3}$/.test(s.currency) || ![s.electricity,s.watts,s.machine].every(num)) fail();
  const pricingSettings = {...PRICING_DEFAULTS};
  for (const key of Object.keys(PRICING_DEFAULTS)) {
    if (s[key] !== undefined) { if (!num(s[key])) fail(); pricingSettings[key] = s[key]; }
  }
  if (pricingSettings.feePercent + pricingSettings.margin >= 100) fail();
  try { new Intl.NumberFormat('en', {style:'currency',currency:s.currency}); } catch { fail(); }
  const ids = new Set();
  for (const s of d.spools) {
    if (!str(s.id) || !s.id || ids.has(s.id) || !str(s.name) || !s.name.trim() || ![s.brand,s.material,s.color].every(str) || ![s.price,s.original,s.remaining].every(num) || s.original <= 0 || s.remaining > s.original + 1e-7 || typeof s.archived !== 'boolean') fail();
    ids.add(s.id);
  }
  const printIds = new Set();
  for (const p of d.prints) {
    if (!str(p.id) || !p.id || printIds.has(p.id) || !str(p.name) || !p.name.trim() || !str(p.notes) || !str(p.date) || !Number.isFinite(Date.parse(p.date)) || !['planned','completed','failed'].includes(p.status) || ![p.hours,p.other].every(num) || !Array.isArray(p.usages) || !p.usages.length || !p.cost) fail();
    printIds.add(p.id);
    for (const u of p.usages) {
      const deleted = u.deletedSpool === true && u.spoolId === null;
      if ((!deleted && (!ids.has(u.spoolId) || u.deletedSpool === true)) || !num(u.grams) || !str(u.spoolName)) fail();
    }
    if (![p.cost.filament,p.cost.electricity,p.cost.machine,p.cost.other,p.cost.total].every(num) || !/^[A-Z]{3}$/.test(p.cost.currency)) fail();
    if (Math.abs(p.cost.total - (p.cost.filament+p.cost.electricity+p.cost.machine+p.cost.other)) > .001) fail();
    if (p.pricing !== undefined) {
      if (!p.pricing || !['laborMinutes','laborRate','overhead','feePercent','fixedFee','margin','labor','totalCost','sellingPrice','sellingFees','profit'].every(key=>num(p.pricing[key]))) fail();
      let expected;
      try { expected = calculateSellingPrice(p.cost,p.pricing); } catch { fail(); }
      if (Object.keys(expected).some(key=>Math.abs(p.pricing[key]-expected[key])>.000001)) fail();
    }
  }
  const next = structuredClone(d);
  Object.assign(next.settings,pricingSettings);
  return next;
}
