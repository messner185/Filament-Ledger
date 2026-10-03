import test from 'node:test';
import assert from 'node:assert/strict';
import {initialData, PRICING_DEFAULTS, calculateSellingPrice, recordPrint, validateData} from '../core.js';

const inputs = {laborMinutes:15, laborRate:20, overhead:2, feePercent:0, fixedFee:0, margin:30};
const cost = {total:6, currency:'USD'};
function fixture() {
  const data=initialData();
  data.spools.push({id:'s',name:'PLA',brand:'Test',material:'PLA',color:'Blue',price:25,original:1000,remaining:1000,archived:false});
  return data;
}
function draft() {
  return {id:'p',date:'2026-10-02T12:00:00Z',name:'Bracket',hours:4,other:0,status:'planned',notes:'',usages:[{spoolId:'s',grams:80}],pricing:inputs};
}
test('selling price covers labor and overhead with margin rather than markup',()=>{
  const quote=calculateSellingPrice(cost,inputs);
  assert.equal(quote.labor,5);
  assert.equal(quote.totalCost,13);
  assert.equal(quote.sellingPrice,18.58);
  assert.ok(quote.profit/quote.sellingPrice>=.30);
  assert.ok(quote.sellingPrice>quote.totalCost*1.3);
});
test('percentage and fixed fees are covered while meeting the profit margin',()=>{
  const quote=calculateSellingPrice(cost,{...inputs,feePercent:9.5,fixedFee:.45});
  assert.equal(quote.sellingPrice,22.24);
  assert.ok(Math.abs(quote.sellingFees-(22.24*.095+.45))<1e-9);
  assert.ok(quote.profit/quote.sellingPrice>=.3);
  assert.ok((quote.sellingPrice-.01)*.605<13.45);
});
test('zero margins break even, and prices round upward in the selected currency',()=>{
  const quote=calculateSellingPrice({total:10,currency:'USD'},{...inputs,laborMinutes:0,overhead:0,margin:0,feePercent:3,fixedFee:.3});
  assert.equal(quote.sellingPrice,10.62);
  assert.ok(quote.profit>=0);
  const yen=calculateSellingPrice({total:100,currency:'JPY'},{...inputs,laborMinutes:0,overhead:0,margin:30});
  assert.equal(yen.sellingPrice,143);
  assert.equal(calculateSellingPrice({total:0,currency:'USD'},{...inputs,laborMinutes:0,overhead:0}).sellingPrice,0);
});
test('reject invalid pricing inputs and impossible fee/margin combinations',()=>{
  for(const key of Object.keys(inputs)) for(const value of [-1,NaN,Infinity,undefined]) {
    assert.throws(()=>calculateSellingPrice(cost,{...inputs,[key]:value}));
  }
  assert.throws(()=>calculateSellingPrice(cost,{...inputs,feePercent:70}),/below 100/);
  assert.throws(()=>calculateSellingPrice(cost,{...inputs,margin:100}),/below 100/);
  assert.throws(()=>calculateSellingPrice(cost,{...inputs,laborMinutes:Number.MAX_VALUE,laborRate:Number.MAX_VALUE}),/too large/);
});
test('legacy backups gain default settings without inventing historical quotes',()=>{
  const data=fixture();
  const oldDraft=draft();delete oldDraft.pricing;
  const old=recordPrint(data,oldDraft);
  for(const key of Object.keys(PRICING_DEFAULTS)) delete old.settings[key];
  const restored=validateData(old);
  assert.equal(restored.settings.laborRate,20);
  assert.equal(restored.settings.margin,30);
  assert.equal(restored.prints[0].pricing,undefined);
  assert.equal(old.settings.margin,undefined);
});
test('quotes survive backups and settings changes; tampered snapshots fail validation',()=>{
  const saved=recordPrint(fixture(),draft());
  const original=structuredClone(saved.prints[0].pricing);
  assert.equal(saved.spools[0].remaining,1000);
  assert.doesNotThrow(()=>validateData(JSON.parse(JSON.stringify(saved))));
  saved.settings.laborRate=100;saved.settings.margin=40;
  assert.deepEqual(validateData(saved).prints[0].pricing,original);
  for(const key of ['sellingPrice','profit','labor','totalCost','sellingFees']) {
    const changed=structuredClone(saved);changed.prints[0].pricing[key]+=1;
    assert.throws(()=>validateData(changed),/Invalid backup/);
  }
  const badSettings=structuredClone(saved);badSettings.settings.feePercent=60;
  assert.throws(()=>validateData(badSettings),/Invalid backup/);
  const badInput=structuredClone(saved);badInput.prints[0].pricing.margin=100;
  assert.throws(()=>validateData(badInput),/Invalid backup/);
});
