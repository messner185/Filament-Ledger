import {initialData, calculate, recordPrint, undoPrint, validateData, nonnegative, prepareImportedSpools, deleteSpool, calculateSellingPrice, PRICING_DEFAULTS} from './core.js';
import {importSlicer} from './importer.js';
import {describeColor} from './colors.js';

const KEY = 'filament-ledger-v1';
const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text; // Never interpret names or imported content as HTML.
  if (className) node.className = className;
  return node;
};
function message(text, error = false) { $('#message').textContent = text; $('#message').classList.toggle('error', error); }
let data = initialData(), editingId = null, imported = null, directory = null, storageBlocked = false;
try {
  const saved = localStorage.getItem(KEY);
  if (saved) data = validateData(JSON.parse(saved));
} catch {
  storageBlocked = true;
  message('Saved data could not be read. It has not been overwritten. Restore a valid backup to continue, or export the existing browser data below.', true);
  const recovery = el('button', 'Download unreadable saved data');
  recovery.onclick = () => { try { download(localStorage.getItem(KEY) || '', 'filament-recovery.txt'); } catch { message('Browser storage is inaccessible.',true); } };
  $('#message').after(recovery);
}
function commit(next) {
  if (storageBlocked) throw new Error('Restore a valid backup before saving to protect your existing data.');
  const valid = validateData(next);
  try { localStorage.setItem(KEY, JSON.stringify(valid)); } catch { throw new Error('Unable to save browser data. Export a backup and check browser storage permissions or available space.'); }
  data = valid;
}
function money(amount, currency = data.settings.currency) {
  return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(amount);
}
function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a = el('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
function button(text, callback) { const b = el('button',text); b.type='button'; b.onclick=callback; return b; }
function colorSwatch(color, material = '') {
  const description=describeColor(color,material);
  const swatch=el('span',undefined,'color-swatch');
  if (description.css) swatch.style.backgroundColor=description.css;
  else swatch.hidden=true;
  swatch.title=description.label;swatch.setAttribute('aria-label',description.label);
  return swatch;
}
function spoolLabel(spool) {
  const generated=[spool.material,spool.color].filter(Boolean).join(' · ');
  return spool.name===generated && describeColor(spool.color,spool.material).css ? `${spool.material} · ${describeColor(spool.color,spool.material).label}` : spool.name;
}
function readUsages() {
  return [...$('#usage-rows').children].map(row => {
    const input = row.querySelector('input');
    if (!input.value.trim()) throw new Error('Enter grams for each filament.');
    return {spoolId:row.querySelector('select').value,grams:nonnegative(input.value,'Filament weight')};
  });
}
function addUsage(usage = {}, hint = '', color = '', material = '') {
  const row = el('div',undefined,'usage-row');
  row.dataset.color=color;row.dataset.material=material;
  const label = el('label',hint || 'Spool'); const select = el('select'); select.required=true;
  if (color) label.append(colorSwatch(color,material));
  select.append(new Option('Choose a spool',''));
  for (const spool of data.spools.filter(s => !s.archived || s.id === usage.spoolId)) select.append(new Option(`${spoolLabel(spool)} (${spool.remaining.toFixed(1)} g)`,spool.id));
  select.value=usage.spoolId || ''; label.append(select);
  const grams = el('label','Used (g)'); const input = el('input'); input.type='number'; input.min='0'; input.step='0.001'; input.required=true; input.value=usage.grams ?? ''; grams.append(input);
  row.append(label,grams,button('×',() => { row.remove(); updateEstimate(); }));
  row.lastChild.setAttribute('aria-label','Remove filament entry');
  $('#usage-rows').append(row); updateEstimate();
}
function updateEstimate() {
  try {
    const form = $('#print-form').elements;
    const usages = readUsages();
    if (!usages.length) throw new Error('Add a filament entry.');
    const c = calculate(data,usages,form.hours.value,form.other.value);
    $('#estimate').textContent=money(c.total);
    $('#cost-breakdown').textContent=`Filament ${money(c.filament)} · electricity ${money(c.electricity)} · machine ${money(c.machine)} · other ${money(c.other)}`;
    try {
      const quote=calculateSellingPrice(c,readPricing(form));
      $('#selling-price').textContent=money(quote.sellingPrice);
      $('#pricing-breakdown').textContent=`Labor ${money(quote.labor)} · overhead ${money(quote.overhead)} · total cost ${money(quote.totalCost)} · selling fees ${money(quote.sellingFees)} · projected profit ${money(quote.profit)} (${quote.margin}% target)`;
    } catch(e) { $('#selling-price').textContent='—';$('#pricing-breakdown').textContent=e.message; }
  } catch { $('#estimate').textContent='—'; $('#cost-breakdown').textContent='Choose spools and enter weights to calculate.';$('#selling-price').textContent='—';$('#pricing-breakdown').textContent='Enter print costs to estimate a selling price.'; }
}
function readPricing(form) {
  if (!form.laborMinutes.value.trim() || !form.overhead.value.trim()) throw new Error('Enter labor minutes and job overhead (zero is allowed).');
  return {...Object.fromEntries(Object.keys(PRICING_DEFAULTS).map(key=>[key,data.settings[key]])), laborMinutes:nonnegative(form.laborMinutes.value,'Labor minutes'), overhead:nonnegative(form.overhead.value,'Job overhead')};
}
function resetPrint() {
  editingId=null; imported=null; $('#print-form').reset();$('#print-form').elements.overhead.value=data.settings.overhead; $('#usage-rows').replaceChildren(); addUsage();
  $('#save-print').textContent='Save print'; $('#import-details').hidden=true;
  $('#print-heading').textContent='Plan your next print';
}
function render() {
  $('#total-weight').textContent=`${data.spools.filter(s => !s.archived).reduce((n,s) => n+s.remaining,0).toFixed(1)} g`;
  $('#total-spools').textContent=data.spools.filter(s => !s.archived).length;
  const currencyTotals = new Map();
  for (const p of data.prints.filter(p => p.status !== 'planned')) currencyTotals.set(p.cost.currency,(currencyTotals.get(p.cost.currency) || 0)+p.cost.total);
  $('#total-cost').textContent=[...currencyTotals].map(([c,n]) => money(n,c)).join(' + ') || money(0);
  const inventory=$('#inventory'); inventory.replaceChildren();
  if (!data.spools.length) inventory.append(el('p','No spools yet. Add your first spool below.','empty'));
  for (const spool of data.spools) {
    const card=el('article',undefined,'spool'); const head=el('div',undefined,'spool-head');
    head.append(el('strong',spoolLabel(spool)),el('span',`${spool.remaining.toFixed(1)} g${spool.archived ? ' · archived' : ''}`));
    const bar=el('progress'); bar.max=spool.original; bar.value=spool.remaining; bar.setAttribute('aria-label',`${spool.name}: remaining filament`);
    const description=el('p',`${spool.brand} · ${spool.material} · ${describeColor(spool.color,spool.material).label} · ${money(spool.price)} / ${spool.original} g`);
    description.prepend(colorSwatch(spool.color,spool.material));card.append(head,description,bar);
    card.append(button(spool.archived ? 'Unarchive' : 'Archive',() => {
      try { const next=structuredClone(data); next.spools.find(s=>s.id===spool.id).archived=!spool.archived; commit(next); render(); message('Spool updated.'); }
      catch(e){message(e.message,true);}
    }));
    const remove=button('Delete spool',()=>{
      const references=data.prints.filter(p=>p.usages.some(u=>u.spoolId===spool.id));
      if (!confirm(`Permanently delete ${spool.name}?${references.length ? ' Print history and costs will stay. Plans using this spool will need a replacement; undo cannot restore filament to this deleted spool.' : ''} This cannot be undone without restoring a backup.`)) return;
      try { commit(deleteSpool(data,spool.id));render();message('Spool deleted. Any affected draft or plan needs a replacement spool.'); }
      catch(e){message(e.message,true);}
    });remove.className='danger';card.append(remove);
    if (spool.needsReview) {
      card.append(el('p','Added from import: assumed 1,000 g and zero price. Review spool details before recording a print.','hint'));
      const details=el('details'), form=el('form',undefined,'form-grid');
      details.append(el('summary','Review imported spool'));
      for (const [key,labelText] of [['name','Spool name'],['brand','Brand'],['material','Material'],['color','Color'],['price','Purchase price'],['original','Original filament (g)'],['remaining','Remaining filament (g)']]) {
        const label=el('label',labelText), input=el('input'); input.name=key;input.value=spool[key];
        if (['price','original','remaining'].includes(key)) { input.type='number';input.min=key==='original'?'0.01':'0';input.step='any';input.required=true; }
        else { input.maxLength=100;input.required=['name','material'].includes(key); }
        label.append(input);form.append(label);
      }
      const save=el('button','Save spool details','primary wide');save.type='submit';form.append(save);
      form.onsubmit=event=>{
        event.preventDefault();
        try {
          const values=new FormData(form), next=structuredClone(data), updated=next.spools.find(s=>s.id===spool.id);
          for (const key of ['name','brand','material','color']) updated[key]=values.get(key).trim();
          for (const key of ['price','original','remaining']) updated[key]=nonnegative(values.get(key),key);
          if (!updated.name || !updated.material || updated.original<=0 || updated.remaining>updated.original) throw new Error('Enter a name, material, and valid spool weights. Remaining weight cannot exceed original weight.');
          updated.needsReview=false;commit(next);render();message('Spool details saved.');
        } catch(e){message(e.message,true);}
      };
      details.append(form);card.append(details);
    }
    inventory.append(card);
  }
  const history=$('#history'); history.replaceChildren();
  if (!data.prints.length) { const td=el('td','No prints recorded yet.');td.colSpan=6;const tr=el('tr');tr.append(td);history.append(tr); }
  for (const p of data.prints) {
    const row=el('tr'), name=el('td',p.name); name.append(el('small',new Date(p.date).toLocaleString()));
    if (p.notes) name.append(el('small',p.notes));
    if (p.usages.some(u=>u.deletedSpool)) name.append(el('small',p.status==='planned'?'Spool deleted — choose a replacement when loading this plan.':'Includes a deleted spool; undo cannot restore its filament.'));
    const actions=el('td');
    if(p.status==='planned') actions.append(button('Load plan',()=>{
      editingId=p.id; imported=null; const f=$('#print-form').elements;
      f.name.value=p.name; f.hours.value=p.hours;f.other.value=p.other;f.status.value='completed';f.notes.value=p.notes;
      f.laborMinutes.value=p.pricing?.laborMinutes ?? 0;f.overhead.value=p.pricing?.overhead ?? data.settings.overhead;
      $('#usage-rows').replaceChildren();p.usages.forEach(u=>addUsage(u));$('#import-details').hidden=true;
      $('#save-print').textContent='Update planned print';$('#print-form').scrollIntoView({behavior:'smooth'});
      $('#print-heading').textContent='Review planned print';
      message('Review actual grams and duration, then save. No filament has been deducted yet.');
    }));
    actions.append(button(p.status==='planned'?'Delete plan':'Undo record',()=>{
      const deleted=p.usages.some(u=>u.deletedSpool);
      if(!confirm(p.status==='planned'?'Delete this planned print?':deleted?'Remove this record? Filament will return only to spools still in inventory. Deleted spools will not be recreated.':'Remove this record and return its filament to the original spools?'))return;
      try{commit(undoPrint(data,p.id));if(editingId===p.id)resetPrint();render();message('Print removed. Consumed filament was restored to existing spools if applicable.');}catch(e){message(e.message,true);}
    }));
    const costs=el('td',money(p.cost.total,p.cost.currency));
    if(p.pricing) { costs.append(el('small',`Suggested price ${money(p.pricing.sellingPrice,p.cost.currency)}`),el('small',`Projected profit ${money(p.pricing.profit,p.cost.currency)}`)); }
    const status=el('td');status.append(el('span',p.status,`status-badge ${p.status}`));
    row.append(name,status,el('td',`${p.usages.reduce((n,u)=>n+u.grams,0).toFixed(1)} g`),el('td',`${p.hours.toFixed(2)} h`),costs,actions);history.append(row);
  }
  const settings=$('#settings-form').elements;
  for (const [key,value] of Object.entries(data.settings)) if(settings[key]) settings[key].value=value;
  const pricingSettings=$('#pricing-form').elements;
  for(const key of Object.keys(PRICING_DEFAULTS)) pricingSettings[key].value=data.settings[key];
  // Refresh spool labels while preserving the unfinished draft.
  const drafts=[...$('#usage-rows').children].map(row=>({spoolId:row.querySelector('select').value,grams:row.querySelector('input').value,hint:row.querySelector('label').firstChild.textContent,color:row.dataset.color,material:row.dataset.material}));
  $('#usage-rows').replaceChildren();drafts.forEach(d=>addUsage(d,d.hint,d.color,d.material));updateEstimate();
}
$('#spool-form').onsubmit=event=>{
  event.preventDefault();
  try{
    const f=new FormData(event.currentTarget), original=nonnegative(f.get('original'),'Original weight'), remaining=nonnegative(f.get('remaining'),'Remaining weight');
    if(original<=0 || remaining>original)throw new Error('Original weight must be above zero and remaining weight cannot exceed it.');
    const name=f.get('name').trim();if(!name)throw new Error('Enter a spool name.');
    const next=structuredClone(data);next.spools.push({id:crypto.randomUUID(),name,brand:f.get('brand').trim(),material:f.get('material').trim(),color:f.get('color').trim(),price:nonnegative(f.get('price'),'Price'),original,remaining,archived:false});
    commit(next);event.currentTarget.reset();render();message('Spool saved.');
  }catch(e){message(e.message,true);}
};
$('#settings-form').onsubmit=event=>{
  event.preventDefault();try{
    const f=new FormData(event.currentTarget),currency=f.get('currency').trim().toUpperCase();
    if(!/^[A-Z]{3}$/.test(currency))throw new Error('Enter a three-letter currency code, such as USD, GBP, or EUR.');
    const next=structuredClone(data);next.settings={...next.settings,currency,electricity:nonnegative(f.get('electricity'),'Electricity price'),watts:nonnegative(f.get('watts'),'Watts'),machine:nonnegative(f.get('machine'),'Machine allowance')};
    commit(next);render();message('Settings saved. Historical costs remain as recorded.');
  }catch(e){message(e.message,true);}
};
$('#pricing-form').onsubmit=event=>{
  event.preventDefault();
  try {
    const values=new FormData(event.currentTarget),next=structuredClone(data);
    for(const key of Object.keys(PRICING_DEFAULTS)) {
      if(!values.get(key).trim()) throw new Error('Enter each pricing value (zero is allowed).');
      next.settings[key]=nonnegative(values.get(key),key);
    }
    if(next.settings.feePercent+next.settings.margin>=100) throw new Error('Selling fee and profit margin together must be below 100%.');
    const previous=data.settings.overhead;commit(next);
    const draft=$('#print-form').elements;
    if(!editingId && Number(draft.overhead.value)===previous) draft.overhead.value=data.settings.overhead;
    render();message('Pricing settings saved. Historical quotes remain unchanged.');
  } catch(e){message(e.message,true);}
};
$('#print-form').addEventListener('input',updateEstimate);
$('#print-form').addEventListener('change',updateEstimate);
$('#add-usage').onclick=()=>addUsage();
$('#print-form').onsubmit=event=>{
  event.preventDefault(); const submit=$('#save-print');submit.disabled=true;
  try{
    const f=new FormData(event.currentTarget),usages=readUsages(),name=f.get('name').trim();
    if(!name || !usages.length)throw new Error('Enter a print name and at least one filament entry.');
    const source=editingId ? data.prints.find(p=>p.id===editingId) : null;
    if(editingId && source?.status!=='planned')throw new Error('This planned print is no longer available.');
    const base=structuredClone(data);if(editingId)base.prints=base.prints.filter(p=>p.id!==editingId);
    const p={id:editingId || crypto.randomUUID(),date:source?.date || new Date().toISOString(),name,hours:nonnegative(f.get('hours'),'Hours'),other:nonnegative(f.get('other'),'Other costs'),status:f.get('status'),notes:f.get('notes').trim(),usages,pricing:readPricing(event.currentTarget.elements)};
    commit(recordPrint(base,p));resetPrint();render();message(p.status==='planned'?'Plan saved. Inventory unchanged.':'Print saved and filament deducted.');
  }catch(e){message(e.message,true);}finally{submit.disabled=false;}
};
$('#export').onclick=()=>download(JSON.stringify(data,null,2),`filament-backup-${new Date().toISOString().slice(0,10)}.json`);
$('#restore').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error('Backup exceeds 10 MB.');
    const next=validateData(JSON.parse(await file.text()));
    if(!confirm(`Replace current inventory and history with ${next.spools.length} spools and ${next.prints.length} prints? Export your current data first if needed.`))return;
    const wasBlocked=storageBlocked;storageBlocked=false;
    try{commit(next);}catch(e){storageBlocked=wasBlocked;throw e;}
    resetPrint();render();message('Backup restored.');
  }catch(e){message(e.message,true);}finally{event.target.value='';}
};
function applyPlate(plate) {
  const prepared=prepareImportedSpools(data,plate.filaments,()=>crypto.randomUUID());
  if(prepared.added.length) { commit(prepared.data);render(); }
  editingId=null;$('#save-print').textContent='Save print'; const f=$('#print-form').elements;
  $('#print-heading').textContent='Plan your next print';
  f.name.value=plate.name;f.hours.value=plate.seconds===null?'':(plate.seconds/3600).toFixed(3);f.other.value=0;f.status.value='planned';f.notes.value=`Imported from ${imported.filename}. Slicer estimates; review actual usage.`;
  f.laborMinutes.value=0;f.overhead.value=data.settings.overhead;
  $('#usage-rows').replaceChildren();
  if(!plate.filaments.length)addUsage();
  plate.filaments.forEach((filament,i)=>addUsage(prepared.usages[i],`Filament ${filament.id} ${filament.type} ${describeColor(filament.color,filament.type).label}`.trim(),filament.color,filament.type));updateEstimate();
  message(`Imported.${prepared.added.length ? ` Added ${prepared.added.length} spool(s); review their assumed weight and zero price in inventory.` : ''} Review spool selections and all estimates.`);
}
async function loadSlicer(file) {
  message('Reading slicer export…');
  try{
    const result=await importSlicer(file);imported=result;
    const details=$('#import-details');details.replaceChildren();details.hidden=false;
    details.append(el('p',`${result.filename} · ${result.plates.length} plate(s)`));
    if(result.plates.length>1){const label=el('label','Choose plate');const select=el('select');result.plates.forEach((p,i)=>select.append(new Option(p.name,String(i))));select.onchange=()=>{try{applyPlate(result.plates[Number(select.value)]);}catch(e){message(`Import failed: ${e.message}`,true);}};label.append(select);details.append(label);}
    for(const warning of result.warnings)details.append(el('p',warning));
    applyPlate(result.plates[0]);
  }catch(e){message(`Import failed: ${e.message}`,true);}
}
$('#slicer-file').onchange=async event=>{const file=event.target.files[0];if(file)await loadSlicer(file);event.target.value='';};
async function checkFolder(){
  if(!directory)return;
  try{
    const files=[];for await(const entry of directory.values())if(entry.kind==='file' && /\.(3mf|gcode)$/i.test(entry.name))files.push(entry);
    files.sort((a,b)=>a.name.localeCompare(b.name));const list=$('#folder-files');list.replaceChildren();
    if(!files.length)list.append(el('p','No .3mf or .gcode files in this folder.'));
    for(const entry of files)list.append(button(entry.name,async()=>{try{await loadSlicer(await entry.getFile());}catch(e){message(e.message,true);}}));
    message(`Folder checked: ${files.length} export(s). Choose a file to import.`);
  }catch(e){message(`Cannot read folder: ${e.message}. Reconnect the folder.`,true);}
}
$('#folder').onclick=async()=>{try{directory=await window.showDirectoryPicker({mode:'read'});$('#refresh-folder').hidden=false;await checkFolder();}catch(e){if(e.name!=='AbortError')message('Folder access failed. Use the Import Bambu file button instead.',true);}};
$('#refresh-folder').onclick=checkFolder;
if(!('showDirectoryPicker' in window)){ $('#folder').hidden=true; }
// Anchor navigation keeps forms visible and preserves unfinished drafts.
const navigation=[...document.querySelectorAll('.nav-link')];
function highlightSection(id) {
  for(const link of navigation) {
    if(link.hash===`#${id}`) link.setAttribute('aria-current','location');
    else link.removeAttribute('aria-current');
  }
}
function navigateToHash() {
  const id=location.hash.slice(1);
  if(id==='add-spool') { $('#add-spool').open=true;highlightSection('spools');$('#spool-form').elements.name.focus({preventScroll:true}); }
  else highlightSection(id || 'new-print');
}
window.addEventListener('hashchange',navigateToHash);
for(const link of document.querySelectorAll('a[href="#add-spool"]')) link.addEventListener('click',()=>{
  $('#add-spool').open=true;$('#spool-form').elements.name.focus({preventScroll:true});
});
if('IntersectionObserver' in window) {
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
    if(visible.length) highlightSection(visible[0].target.id);
  },{rootMargin:'-140px 0px -55% 0px',threshold:0});
  document.querySelectorAll('.navigation-section').forEach(section=>observer.observe(section));
}
// Associate field guidance with its input for assistive technology.
document.querySelectorAll('label').forEach((label,index)=>{
  const hint=label.querySelector('.hint'),input=label.querySelector('input,select');
  if(hint && input) { hint.id=`field-help-${index}`;input.setAttribute('aria-describedby',hint.id); }
});
navigateToHash();
// Make custom file-picker labels work with keyboard navigation too.
for (const label of document.querySelectorAll('label.button')) {
  label.tabIndex = 0;
  label.setAttribute('role', 'button');
  label.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); label.querySelector('input').click();
    }
  });
}
$('#print-form').elements.overhead.value=data.settings.overhead;
render();addUsage();

// Optional browser-agent interface. Ordinary browsers simply skip this block.
// These tools read inventory or stage a draft; saving still uses the visible form.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const definitions = [
    {name:'read_filament_inventory',description:'Read the spools currently stored in this browser.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){
      if(!input || typeof input!=='object' || Object.keys(input).length)throw new Error('No input fields are accepted.');
      return {spools:data.spools.map(s=>({id:s.id,name:s.name,material:s.material,remainingGrams:s.remaining,archived:s.archived}))};
    }},
    {name:'stage_print_draft',description:'Fill a planned print draft for review. Does not save a print or deduct inventory.',inputSchema:{type:'object',properties:{name:{type:'string'},hours:{type:'number',minimum:0},usages:{type:'array',minItems:1,items:{type:'object',properties:{spoolId:{type:'string'},grams:{type:'number',minimum:0}},required:['spoolId','grams'],additionalProperties:false}}},required:['name','hours','usages'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){
      if(!input || Object.keys(input).some(k=>!['name','hours','usages'].includes(k)) || typeof input.name!=='string' || !input.name.trim() || input.name.length>120 || typeof input.hours!=='number' || !Array.isArray(input.usages) || !input.usages.length || input.usages.some(u=>!u || typeof u.spoolId!=='string' || typeof u.grams!=='number' || Object.keys(u).some(k=>!['spoolId','grams'].includes(k))))throw new Error('Invalid draft.');
      calculate(data,input.usages,input.hours,0);
      resetPrint();const f=$('#print-form').elements;f.name.value=input.name;f.hours.value=input.hours;$('#usage-rows').replaceChildren();input.usages.forEach(u=>addUsage(u));message('Draft prepared. Review it before saving.');
      return {staged:true,saved:false};
    }}
  ];
  for(const tool of definitions){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional API: keep the regular UI usable. */}}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
