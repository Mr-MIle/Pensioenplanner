/*
  Controle van de taalbestanden. Gebruik:
    node i18n/i18n-check.js               controleren
    node i18n/i18n-check.js --bijgewerkt  na het bijwerken van en.js en da.js: legt vast op welke Nederlandse tekst
                                          de vertalingen nu gebaseerd zijn (i18n/bron-hash.json)
  Meldt per taal: ontbrekende sleutels, sleutels die niet in nl.js staan, verschillen in {plekken} of enkelvoud/meervoud,
  en vertalingen waarvan de Nederlandse bron sinds de vorige --bijgewerkt is veranderd (verouderd).
  Meldt ook sleutels uit nl.js die nergens in de pagina's gebruikt worden.
  Eindigt met code 1 bij ontbrekende sleutels of verschillende plekken.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAP = __dirname;
const ROOT = path.join(MAP, '..');
const HASHBESTAND = path.join(MAP, 'bron-hash.json');
// Pagina's en scripts waarin sleutels gebruikt worden.
const BRONNEN = ['config-overlay.js', 'index.html', 'bij-en-afschrijvingen.html', 'engine.js', 'varianten/index.html', 'varianten/fonds-a.html', 'varianten/fonds-b.html', 'varianten/fonds-c.html', 'varianten/kern.js', 'i18n/i18n.js'];

global.window = global;
eval(fs.readFileSync(path.join(MAP, 'i18n.js'), 'utf8'));
const I18N = global.I18N;
const TALEN = Object.keys(I18N.TALEN);
TALEN.forEach(t => eval(fs.readFileSync(path.join(MAP, t + '.js'), 'utf8')));
const W = I18N.woorden, nl = W[I18N.BRON];

const hash = v => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 10);
const plekken = v => [].concat(v).join(' ').match(/\{\w+\}/g) || [];
const zelfde = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

let hashes = {};
try { hashes = JSON.parse(fs.readFileSync(HASHBESTAND, 'utf8')); } catch (e) { hashes = {}; }

if (process.argv.includes('--bijgewerkt')) {
  TALEN.filter(t => t !== I18N.BRON).forEach(t => {
    hashes[t] = {};
    Object.keys(W[t]).filter(k => k in nl).sort().forEach(k => { hashes[t][k] = hash(nl[k]); });
  });
  fs.writeFileSync(HASHBESTAND, JSON.stringify(hashes, null, 2) + '\n');
  console.log('Vastgelegd: de vertalingen zijn bijgewerkt tot de huidige Nederlandse teksten.');
  process.exit(0);
}

let fouten = 0;
const regel = (soort, tekst) => console.log('  ' + soort.padEnd(12) + tekst);

TALEN.filter(t => t !== I18N.BRON).forEach(t => {
  const w = W[t], h = hashes[t] || {};
  const ontbreekt = Object.keys(nl).filter(k => !(k in w));
  const extra = Object.keys(w).filter(k => !(k in nl));
  const plek = Object.keys(nl).filter(k => k in w && (!zelfde(plekken(nl[k]), plekken(w[k])) || Array.isArray(nl[k]) !== Array.isArray(w[k])));
  const oud = Object.keys(nl).filter(k => k in w && h[k] !== hash(nl[k]));
  console.log(I18N.TALEN[t].naam + ' (' + t + '.js): ' + Object.keys(w).length + ' van ' + Object.keys(nl).length + ' sleutels');
  ontbreekt.forEach(k => regel('ontbreekt', k));
  extra.forEach(k => regel('onbekend', k + '  (staat niet in nl.js)'));
  plek.forEach(k => regel('plekken', k + '  nl ' + plekken(nl[k]).join(' ') + ' · ' + t + ' ' + plekken(w[k]).join(' ')));
  oud.forEach(k => regel('verouderd', k + (h[k] ? '  (Nederlandse tekst gewijzigd)' : '  (nog niet vastgelegd)')));
  if (!ontbreekt.length && !extra.length && !plek.length && !oud.length) regel('in orde', '');
  fouten += ontbreekt.length + plek.length;
});

// Ongebruikte sleutels: letterlijk in de bronnen, of als voorvoegsel in een samengestelde sleutel ('gemeen.' + basis).
const tekst = BRONNEN.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const letterlijk = new Set((tekst.match(/['"][\w.]+['"]/g) || []).map(s => s.slice(1, -1)));
(tekst.match(/data-i18n-attr="[^"]+"/g) || []).forEach(a => a.slice(16, -1).split(';').forEach(p => letterlijk.add(p.split(':')[1].trim())));
const voorvoegsels = (tekst.match(/['"][\w.]+['"]\s*\+/g) || []).map(s => s.replace(/['"\s+]/g, ''));
const ongebruikt = Object.keys(nl).filter(k => !letterlijk.has(k) && !voorvoegsels.some(v => k.startsWith(v)));
console.log('Nederlands (nl.js): ' + Object.keys(nl).length + ' sleutels');
ongebruikt.forEach(k => regel('ongebruikt', k));
if (!ongebruikt.length) regel('in orde', '');

process.exit(fouten ? 1 : 0);
