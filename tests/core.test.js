import test from 'node:test';
import assert from 'node:assert/strict';
import {initialData, calculate, recordPrint, undoPrint, validateData, prepareImportedSpools, deleteSpool} from '../core.js';
import {parseDuration, parseGcode} from '../importer.js';
function fixture(){const d=initialData();d.spools.push({id:'s1',name:'PLA',brand:'Test',material:'PLA',color:'Blue',price:25,original:1000,remaining:1000,archived:false});return d;}
function print(status='completed'){return{id:'p1',date:'2026-10-02T12:00:00Z',name:'Bracket',hours:4,other:.2,status,notes:'',usages:[{spoolId:'s1',grams:80}]};}
test('cost uses original weight and electricity converts watts to kW',()=>{const d=fixture();d.spools[0].remaining=500;const c=calculate(d,print().usages,4,.2);assert.equal(c.filament,2);assert.ok(Math.abs(c.electricity-.18)<1e-9);assert.equal(c.total,4.38);});
test('completed and failed prints deduct and undo restores',()=>{for(const status of ['completed','failed']){const d=fixture();const saved=recordPrint(d,print(status));assert.equal(saved.spools[0].remaining,920);assert.equal(d.spools[0].remaining,1000);assert.equal(undoPrint(saved,'p1').spools[0].remaining,1000);assert.doesNotThrow(()=>validateData(saved));}});
test('planned prints do not consume stock',()=>{const saved=recordPrint(fixture(),print('planned'));assert.equal(saved.spools[0].remaining,1000);});
test('combined entries cannot overdraw one spool; failed save is atomic',()=>{const d=fixture(),p=print();p.usages=[{spoolId:'s1',grams:600},{spoolId:'s1',grams:500}];assert.throws(()=>recordPrint(d,p),/Not enough/);assert.equal(d.spools[0].remaining,1000);assert.equal(d.prints.length,0);});
test('reject duplicate records, missing spools, and negative consumption',()=>{const d=recordPrint(fixture(),print());assert.throws(()=>recordPrint(d,print()),/already/);assert.throws(()=>calculate(d,[{spoolId:'missing',grams:1}],0,0),/Choose/);assert.throws(()=>calculate(d,[{spoolId:'s1',grams:-1}],0,0),/nonnegative/);});
test('backup validation rejects invalid numbers, broken references and duplicate IDs',()=>{const d=fixture();d.spools[0].original=0;assert.throws(()=>validateData(d));const saved=recordPrint(fixture(),print());saved.prints[0].usages[0].spoolId='missing';assert.throws(()=>validateData(saved));const duplicate=fixture();duplicate.spools.push({...duplicate.spools[0]});assert.throws(()=>validateData(duplicate));});
test('historical costs do not change with current settings',()=>{const d=recordPrint(fixture(),print());d.settings.electricity=100;assert.equal(d.prints[0].cost.total,4.38);});
test('parses Bambu-style G-code weights and normal-mode duration',()=>{const p=parseGcode('; filament used [g] = 80.5, 12.2\n; filament_type = PLA;PETG\n; estimated printing time (normal mode) = 1h 30m 5s');assert.equal(p.seconds,5405);assert.deepEqual(p.filaments.map(f=>f.grams),[80.5,12.2]);assert.equal(p.filaments[1].type,'PETG');});
test('unknown duration stays unknown',()=>{assert.equal(parseDuration(undefined),null);assert.equal(parseDuration('not available'),null);assert.equal(parseDuration('3600'),3600);});

test('imports create valid spools, reuse repeated filament, and leave stock untouched',()=>{
  const source=initialData();let id=0;
  const filaments=[{type:'PLA',color:'#00AAFF',grams:80},{type:' pla ',color:'#00aaffFF',grams:null},{type:'PETG',color:'#00AAFF',grams:20}];
  const result=prepareImportedSpools(source,filaments,()=>`import-${++id}`);
  assert.equal(source.spools.length,0);
  assert.equal(result.added.length,2);
  assert.equal(result.usages[0].spoolId,result.usages[1].spoolId);
  assert.equal(result.usages[1].grams,null);
  assert.equal(result.data.spools[0].remaining,1000);
  assert.equal(result.data.spools[0].price,0);
  assert.equal(result.data.spools[0].needsReview,true);
  assert.doesNotThrow(()=>validateData(result.data));
  const repeated=prepareImportedSpools(result.data,filaments,()=>assert.fail('Unexpected duplicate'));
  assert.equal(repeated.added.length,0);
  assert.deepEqual(repeated.usages,result.usages);
});
test('imports reuse active matches without changing inventory, and separate different colors',()=>{
  const source=fixture();source.spools[0].remaining=500;
  const result=prepareImportedSpools(source,[{type:' pla ',color:' BLUE ',grams:80},{type:'PLA',color:'Red',grams:20}],()=> 'red');
  assert.equal(result.usages[0].spoolId,'s1');
  assert.equal(result.added.length,1);
  assert.deepEqual(result.data.spools[0],source.spools[0]);
});
test('imports exclude archived spools and do not guess ambiguous or unknown materials',()=>{
  const source=fixture();source.spools.push({...source.spools[0],id:'s2'});
  const ambiguous=prepareImportedSpools(source,[{type:'PLA',color:'Blue',grams:10},{color:'Red',grams:null}],()=>assert.fail('Unexpected spool'));
  assert.deepEqual(ambiguous.usages,[{spoolId:'',grams:10},{spoolId:'',grams:null}]);
  source.spools.forEach(s=>s.archived=true);
  const archived=prepareImportedSpools(source,[{type:'PLA',color:'Blue',grams:10}],()=> 'new');
  assert.equal(archived.added.length,1);
  assert.equal(archived.usages[0].spoolId,'new');
});

test('deleting an unused or archived spool removes it without mutating the source',()=>{
  const source=fixture();source.spools[0].archived=true;
  const result=deleteSpool(source,'s1');
  assert.equal(result.spools.length,0);
  assert.equal(source.spools.length,1);
  assert.doesNotThrow(()=>validateData(result));
  assert.throws(()=>deleteSpool(source,'missing'),/not found/);
});
test('deleting a spool preserves print history and costs, and undo restores only existing spools',()=>{
  for (const status of ['completed','failed']) {
    const source=fixture();source.spools.push({...source.spools[0],id:'s2',name:'Second spool'});
    const p=print(status);p.usages.push({spoolId:'s2',grams:20});
    const saved=recordPrint(source,p), result=deleteSpool(saved,'s1');
    assert.equal(result.spools.length,1);
    assert.equal(result.prints[0].usages[0].spoolId,null);
    assert.equal(result.prints[0].usages[0].spoolName,'PLA');
    assert.equal(result.prints[0].usages[0].grams,80);
    assert.deepEqual(result.prints[0].cost,saved.prints[0].cost);
    assert.doesNotThrow(()=>validateData(JSON.parse(JSON.stringify(result))));
    const undone=undoPrint(result,p.id);
    assert.equal(undone.spools.length,1);
    assert.equal(undone.spools[0].remaining,1000);
    assert.equal(undone.prints.length,0);
    assert.equal(saved.prints[0].usages[0].spoolId,'s1');
  }
});
test('plans with deleted spools require replacements and unmarked broken references are rejected',()=>{
  const source=recordPrint(fixture(),print('planned')), result=deleteSpool(source,'s1');
  assert.doesNotThrow(()=>validateData(result));
  const p={...result.prints[0],id:'new',status:'completed'};
  assert.throws(()=>recordPrint(result,p),/Choose a spool/);
  const broken=structuredClone(result);delete broken.prints[0].usages[0].deletedSpool;
  assert.throws(()=>validateData(broken),/Invalid backup/);
  const forged=structuredClone(result);forged.prints[0].usages[0].spoolId='missing';
  assert.throws(()=>validateData(forged),/Invalid backup/);
  assert.equal(undoPrint(result,'p1').prints.length,0);
});
