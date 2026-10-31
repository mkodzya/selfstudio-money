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
// The owner's answer 15 of 31 October 2026 («15 да»), written into a page of before that lacks it: a row of a typed
// balance's own day goes after that balance by its mark only when the mark was made after the balance was typed. The
// pages these scripts compare with (dev, pre) count such a row after the balance whenever the mark is of a later day;
// the answer changes «Денег сейчас» exactly there, so without it F and P report every such life as a difference.
// The page as it is has the rule already and is built untouched; a page that has neither line stops the build.
const B15old = 'else if(f.d>A.asOf||(f.d===A.asOf&&p&&later(p,A)))a.after+=f.a;', B15 = 'else if(f.d>A.asOf||(f.d===A.asOf&&p&&later(p,A)&&(+p.at||0)>A.at))a.after+=f.a;';
let code = parts.join('\n'), note = '';
if (code.includes(B15old)) { code = code.replace(B15old, B15); note = ' (answer 15 of 31 October 2026 written in)'; }
else if (!code.includes(B15)) throw new Error('rule 4 of the typed balance\'s own day not found: ' + src);
fs.writeFileSync(out, code + '\nmodule.exports={Live,FOUNDERS,CURS,BANKS,uid,norm,text120:typeof text120==="function"?text120:null};\n');
console.log('built', out, code.length + note);
