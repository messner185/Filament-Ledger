import test from 'node:test';
import assert from 'node:assert/strict';
import {describeColor} from '../colors.js';

test('hex colors produce exact opaque swatches and approximate readable names',()=>{
  for (const [hex,name] of [['#FF0000','Red'],['#0000ff','Blue'],['#00FF00','Green'],['#FFFFFF','White'],['#000000','Black'],['#808080','Gray'],['#FFFF00','Yellow']]) {
    const result=describeColor(hex);
    assert.equal(result.css,hex.toUpperCase());
    assert.equal(result.label,`${name} (approx.) · ${hex.toUpperCase()}`);
  }
  assert.deepEqual(describeColor(' #00aaffFF '),describeColor('#00AAFF'));
  assert.deepEqual(describeColor('00AAFF'),describeColor('#00AAFF'));
});
test('unknown, named, and malformed colors stay text without becoming CSS',()=>{
  assert.deepEqual(describeColor(' Blue '),{css:null,label:'Blue'});
  assert.deepEqual(describeColor(null),{css:null,label:'Unknown color'});
  for (const value of ['#GGGGGG','#12345','url(https://example.com/color)','<script>']) {
    assert.deepEqual(describeColor(value),{css:null,label:value});
  }
});

test('official Bambu shades are matched offline by exact RGB including imported alpha',()=>{
  for (const [hex,name] of [['#0056B8','Cobalt Blue'],['#FF9016','Pumpkin Orange'],['#00AE42','Bambu Green']]) {
    assert.deepEqual(describeColor(`${hex}FF`,'PLA Basic'),{css:hex,label:`${name} (Bambu catalog) · ${hex}`});
  }
  assert.match(describeColor('0056b8','PLA').label,/Cobalt Blue \(Bambu catalog\)/);
  assert.match(describeColor('#0056B8').label,/Cobalt Blue \(Bambu catalog\)/);
});
test('material context resolves shared codes without guessing a product family',()=>{
  assert.match(describeColor('#0086D6','PLA').label,/Cyan \(Bambu catalog\)/);
  assert.match(describeColor('#0086D6','PETG Basic').label,/Navy Blue \(Bambu catalog\)/);
  assert.match(describeColor('#0086D6').label,/\(approx\.\)/);
  assert.match(describeColor('#FFFFFF','PLA Basic').label,/Jade White \(Bambu catalog\)/);
  assert.match(describeColor('#FFFFFF','PLA Matte').label,/Ivory White \(Bambu catalog\)/);
  assert.match(describeColor('#FFFFFF','PLA').label,/\(approx\.\)/);
  assert.match(describeColor('#000000','PC').label,/\(approx\.\)/);
});
test('unmatched colors and incompatible materials retain approximate labels',()=>{
  assert.match(describeColor('#0056B9','PLA Basic').label,/\(approx\.\)/);
  assert.match(describeColor('#0056B8','Unknown material').label,/\(approx\.\)/);
  assert.match(describeColor('#0056B8',' pla basic ').label,/Cobalt Blue \(Bambu catalog\)/);
});
