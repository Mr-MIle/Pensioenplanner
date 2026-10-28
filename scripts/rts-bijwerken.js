/*
  Pensioenplanner: RTS bijwerken vanuit de DNB Statistics API (tabel 1.3.1, nominale RTS pensioenfondsen, zero coupon).
  Draait maandelijks via .github/workflows/rts-bijwerken.yml, of met de hand:

    DNB_PRIMARYKEY=... node scripts/rts-bijwerken.js [--forceer]

  Haalt de nieuwste curve op, controleert hem en schrijft hem in het rts-blok van config.js
  (peildatum, bron, spotrates) en als archief in rts/jjjj-mm.json. Is de peildatum niet nieuwer
  dan die in config.js, dan verandert er niets.

  Omgeving:
    DNB_PRIMARYKEY, DNB_SECONDARYKEY  abonnementssleutels (de tweede alleen als de eerste geweigerd wordt)
    DNB_TEST_BESTAND                  lees de API-respons uit dit bestand in plaats van de API (voor testen)
    GITHUB_OUTPUT                     als gezet: schrijft bijgewerkt, peildatum en verouderd voor de workflow
  --forceer: sla de controle op een grote sprong ten opzichte van de huidige curve over.
*/
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const API = 'https://api.dnb.nl/statisticsdata/v2026061000/nominal-irts-for-pension-funds-zero-coupon';
const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'config.js');
const ARCHIEF = path.join(ROOT, 'rts');

const MAX_LOOPTIJD = 100;
const MAX_SPOTRATE = 0.2;    // fractie; hoger wijst op een fout in de eenheid
const MAX_SPRONG = 0.01;     // gemiddelde absolute verschuiving t.o.v. de huidige curve (100 basispunten)

const forceer = process.argv.includes('--forceer');

function stop(msg) {
  console.error('FOUT: ' + msg);
  process.exit(1);
}

function uitvoer(naam, waarde) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, naam + '=' + waarde + '\n');
}

// ---------- ophalen ----------

async function haalOp() {
  if (process.env.DNB_TEST_BESTAND) return JSON.parse(fs.readFileSync(process.env.DNB_TEST_BESTAND, 'utf8'));

  const sleutels = [process.env.DNB_PRIMARYKEY, process.env.DNB_SECONDARYKEY].filter(Boolean);
  if (!sleutels.length) stop('geen sleutel: zet DNB_PRIMARYKEY (en eventueel DNB_SECONDARYKEY).');

  // Aflopend op periode: de eerste 500 records bevatten de nieuwste curve (100 looptijden) volledig.
  const url = API + '?page=1&pageSize=500&sort=' + encodeURIComponent('period desc');
  for (let i = 0; i < sleutels.length; i++) {
    const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': sleutels[i], 'Accept': 'application/json' } });
    if ((res.status === 401 || res.status === 403) && i < sleutels.length - 1) {
      console.log('Sleutel ' + (i + 1) + ' geweigerd (' + res.status + '), probeer de volgende.');
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      stop('DNB geeft ' + res.status + ': deze API-versie bestaat niet meer. Zoek de nieuwe versie op api.portal.dnb.nl en pas API aan in dit script.');
    }
    if (!res.ok) stop('DNB geeft ' + res.status + ' ' + res.statusText + ': ' + (await res.text()).slice(0, 300));
    return res.json();
  }
}

// ---------- verwerken ----------

function laatsteDag(jaar, maand) {
  return new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
}

// De curve van de nieuwste periode, als { peildatum, spotrates } met spotrates als fractie.
function nieuwsteCurve(data) {
  const records = data && Array.isArray(data.records) ? data.records : stop('de respons bevat geen records.');
  const perioden = records.map(r => String(r.period).slice(0, 7)).filter(p => /^\d{4}-\d{2}$/.test(p)).sort();
  if (!perioden.length) stop('geen geldige perioden in de respons.');
  const maand = perioden[perioden.length - 1];
  const jaar = Number(maand.slice(0, 4)), mm = Number(maand.slice(5, 7));
  // DNB-RTS geldt per ultimo maand, zoals de peildatum in config.js.
  const peildatum = maand + '-' + String(laatsteDag(jaar, mm)).padStart(2, '0');

  const spotrates = {};
  records.filter(r => String(r.period).slice(0, 7) === maand).forEach(r => {
    const lt = Number(r.maturityInYears), v = Number(r.value);
    if (!Number.isInteger(lt) || lt < 1 || lt > MAX_LOOPTIJD) stop('onverwachte looptijd ' + r.maturityInYears + ' in ' + maand + '.');
    if (r.value === null || r.value === undefined || !isFinite(v)) stop('geen waarde bij looptijd ' + lt + ' in ' + maand + '.');
    if (lt in spotrates) stop('looptijd ' + lt + ' komt dubbel voor in ' + maand + '.');
    // De API geeft percentages (3,368), de planner rekent met fracties (0,03368).
    spotrates[lt] = Number((v / 100).toFixed(7));
  });

  const ontbreekt = [];
  for (let lt = 1; lt <= MAX_LOOPTIJD; lt++) if (!(lt in spotrates)) ontbreekt.push(lt);
  if (ontbreekt.length) stop('curve ' + maand + ' is onvolledig, ontbrekende looptijden: ' + ontbreekt.join(', ') + '.');
  const teHoog = Object.keys(spotrates).filter(lt => Math.abs(spotrates[lt]) > MAX_SPOTRATE);
  if (teHoog.length) stop('spotrate boven ' + MAX_SPOTRATE * 100 + '% bij looptijd ' + teHoog.join(', ') + ': klopt de eenheid nog (percentage)?');

  return { peildatum: peildatum, spotrates: spotrates, periode: records.find(r => String(r.period).slice(0, 7) === maand).period };
}

// ---------- config.js ----------

// Begin en einde (exclusief) van het object na de sleutel rts, in config.js zoals met de hand geschreven
// (rts: { ... }) of zoals gedownload uit config-bewerken.html ("rts": { ... }).
function zoekRtsBlok(tekst) {
  const m = /(^|\n)([ \t]*)(rts|"rts")\s*:\s*\{/.exec(tekst);
  if (!m) stop('geen rts-blok gevonden in config.js.');
  const begin = m.index + m[0].length - 1;
  let diepte = 0, tekenreeks = null;
  for (let i = begin; i < tekst.length; i++) {
    const c = tekst[i];
    if (tekenreeks) {
      if (c === '\\') i++;
      else if (c === tekenreeks) tekenreeks = null;
    } else if (c === '"' || c === "'") tekenreeks = c;
    else if (c === '{') diepte++;
    else if (c === '}' && --diepte === 0) return { begin: begin, einde: i + 1, inspringing: m[2] };
  }
  stop('het rts-blok in config.js sluit niet af.');
}

function leesConfig(tekst) {
  const ctx = { window: {} };
  vm.runInNewContext(tekst, ctx, { filename: 'config.js' });
  if (!ctx.window.PLANNER_CONFIG) stop('config.js zet window.PLANNER_CONFIG niet.');
  return ctx.window.PLANNER_CONFIG;
}

// Het rts-object in dezelfde opmaak als nu in config.js: 10 looptijden per regel.
function rtsTekst(rts, inspringing) {
  const i1 = inspringing + '  ', i2 = inspringing + '    ';
  const lt = Object.keys(rts.spotrates).map(Number).sort((a, b) => a - b);
  const regels = [];
  for (let k = 0; k < lt.length; k += 10) {
    regels.push(i2 + lt.slice(k, k + 10).map(a => a + ': ' + rts.spotrates[a]).join(', '));
  }
  return '{\n' +
    i1 + 'peildatum: ' + JSON.stringify(rts.peildatum) + ',\n' +
    i1 + 'bron: ' + JSON.stringify(rts.bron) + ',\n' +
    i1 + 'spotrates: {\n' + regels.join(',\n') + '\n' + i1 + '}\n' +
    inspringing + '}';
}

function datumNl(iso) {
  const d = String(iso).slice(0, 10).split('-');
  return d.length === 3 ? d[2] + '-' + d[1] + '-' + d[0].slice(2) : String(iso);
}

// ---------- hoofdprogramma ----------

(async function () {
  const data = await haalOp();
  const meta = data._metadata || {};
  const release = data.lastReleaseDate || meta.lastReleaseDate || '';
  const verouderd = meta.isDeprecated === true;
  uitvoer('verouderd', verouderd ? 'ja' : 'nee');
  if (verouderd) {
    console.log('LET OP: DNB meldt dat deze API-versie verouderd is' +
      (meta.expectedRemovalDate ? ', verwijdering verwacht op ' + String(meta.expectedRemovalDate).slice(0, 10) : '') + '.');
    uitvoer('verwijderdatum', String(meta.expectedRemovalDate || '').slice(0, 10));
  }

  const curve = nieuwsteCurve(data);
  console.log('Nieuwste curve bij DNB: periode ' + curve.periode + ' (peildatum ' + curve.peildatum + '), release ' + (release || 'onbekend') + '.');

  const tekst = fs.readFileSync(CONFIG, 'utf8');
  const huidig = leesConfig(tekst).rts || {};
  console.log('Huidige curve in config.js: peildatum ' + (huidig.peildatum || 'onbekend') + '.');

  if (huidig.peildatum && String(huidig.peildatum).slice(0, 7) >= curve.peildatum.slice(0, 7)) {
    console.log('Geen nieuwe curve: config.js is al bij.');
    uitvoer('bijgewerkt', 'nee');
    return;
  }

  // Een grote sprong ten opzichte van de huidige curve wijst eerder op een fout dan op de markt.
  const oud = huidig.spotrates || {};
  const gedeeld = Object.keys(curve.spotrates).filter(lt => typeof oud[lt] === 'number');
  if (gedeeld.length) {
    const sprong = gedeeld.reduce((s, lt) => s + Math.abs(curve.spotrates[lt] - oud[lt]), 0) / gedeeld.length;
    console.log('Gemiddelde verschuiving: ' + (sprong * 10000).toFixed(1) + ' basispunten.');
    if (sprong > MAX_SPRONG && !forceer) {
      stop('de curve verschuift gemiddeld ' + (sprong * 10000).toFixed(0) + ' basispunten (grens ' + MAX_SPRONG * 10000 +
        '). Controleer de data bij DNB en start de workflow zo nodig met forceer.');
    }
  }

  const rts = {
    peildatum: curve.peildatum,
    bron: 'DNB Statistics API, tabel 1.3.1 nominale rentetermijnstructuur pensioenfondsen (zero coupon)' +
      (release ? ', release ' + datumNl(release) : ''),
    spotrates: curve.spotrates
  };

  const blok = zoekRtsBlok(tekst);
  const nieuw = tekst.slice(0, blok.begin) + rtsTekst(rts, blok.inspringing) + tekst.slice(blok.einde);

  // Lees het resultaat terug: config.js moet geldig blijven en precies deze curve bevatten.
  const terug = leesConfig(nieuw).rts;
  if (terug.peildatum !== rts.peildatum || JSON.stringify(terug.spotrates) !== JSON.stringify(rts.spotrates)) {
    stop('na het bijwerken bevat config.js niet de verwachte curve; er is niets geschreven.');
  }

  fs.writeFileSync(CONFIG, nieuw);
  fs.mkdirSync(ARCHIEF, { recursive: true });
  const archief = path.join(ARCHIEF, rts.peildatum.slice(0, 7) + '.json');
  fs.writeFileSync(archief, JSON.stringify(Object.assign({ release: release || null }, rts), null, 2) + '\n');

  console.log('Bijgewerkt: config.js en ' + path.relative(ROOT, archief).replace(/\\/g, '/') + '.');
  uitvoer('bijgewerkt', 'ja');
  uitvoer('peildatum', rts.peildatum);
})().catch(e => stop(e && e.stack || String(e)));
