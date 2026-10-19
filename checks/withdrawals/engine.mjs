// The engine of a page (Live), cut out of its index.html as a module for node - no browser.
// usage: node checks/withdrawals/engine.mjs <index.html> <out.cjs>
import fs from 'node:fs';
const [, , src, out] = process.argv;
const L = fs.readFileSync(src, 'utf8').split('\n');
const one = (re) => { const i = L.findIndex((l) => re.test(l)); if (i < 0) throw new Error('not found: ' + re); return L[i]; };
const span = (a, b) => { const i = L.findIndex((l) => a.test(l)); if (i < 0) throw new Error('not found: ' + a); let j = i; while (!b.test(L[j])) j++; return L.slice(i, j + 1).join('\n'); };
// (a line a page may not have: `text120`, how a statement's text is kept when its row is filed - since 64975ab, the
// fees of 19 October 2026; a page before it cut the text at 120 inside toTx, and its module exports text120: null)
const may = (re) => { const i = L.findIndex((l) => re.test(l)); return i < 0 ? '' : L[i]; };
const parts = [
  one(/^const FOUNDERS=/), one(/^const BANKS=/), one(/^const CURS=/), one(/^const GENERIC=/), one(/^const FX0=/),
  span(/^const fxSorted=/, /^function fxDayOn/), one(/^const uid=/), one(/^const round2=/), one(/^const norm=/), one(/^const owner=/), one(/^const FN=/),
  span(/^const Live=\(\(\)=>\{/, /^\}\)\(\);/), may(/^const text120=/),
];
fs.writeFileSync(out, parts.join('\n') + '\nmodule.exports={Live,FOUNDERS,CURS,BANKS,uid,norm,text120:typeof text120==="function"?text120:null};\n');
console.log('built', out, parts.join('\n').length);
