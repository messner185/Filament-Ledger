import {bambuColors} from './vendor/bambu-colors.js';

function catalogName(css, material) {
  const type = String(material ?? '').trim().toLowerCase();
  let matches = bambuColors.filter(([hex]) => hex.slice(0,7) === css);
  if (type) {
    const exact = matches.filter(([,family]) => family.toLowerCase() === type);
    matches = exact.length ? exact : matches.filter(([,family]) => family.toLowerCase().startsWith(`${type} `) || family.toLowerCase().startsWith(`${type}-`));
  }
  const names = new Set(matches.map(([, ,name]) => name));
  return names.size === 1 ? [...names][0] : null;
}
// Preserve precise colors; use official catalog names only for unambiguous matches.
export function describeColor(value, material = '') {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
  if (!match) return {css:null, label:raw || 'Unknown color'};
  const css = `#${match[1].toUpperCase()}`;
  const officialName = catalogName(css, material);
  if (officialName) return {css, label:`${officialName} (Bambu catalog) · ${css}`};
  const [r,g,b] = [0,2,4].map(i => parseInt(match[1].slice(i,i+2),16)/255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max-min;
  let name;
  if (max < .15) name = 'Black';
  else if (delta < .08) name = max > .9 ? 'White' : max > .65 ? 'Light gray' : max < .35 ? 'Dark gray' : 'Gray';
  else {
    let hue = (max === r ? (g-b)/delta : max === g ? (b-r)/delta+2 : (r-g)/delta+4)*60;
    hue = (hue+360)%360;
    name = hue < 15 || hue >= 345 ? 'Red' : hue < 45 ? (max < .65 ? 'Brown' : 'Orange') : hue < 70 ? 'Yellow' : hue < 165 ? 'Green' : hue < 200 ? 'Cyan' : hue < 260 ? 'Blue' : hue < 290 ? 'Purple' : 'Pink';
  }
  return {css, label:`${name} (approx.) · ${css}`};
}
