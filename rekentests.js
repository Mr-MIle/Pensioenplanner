global.window = {};
const fs = require('fs');
eval(fs.readFileSync(__dirname + '/config.js', 'utf8'));
eval(fs.readFileSync(__dirname + '/engine.js', 'utf8'));
const E = window.PensioenEngine;
const base = JSON.parse(JSON.stringify(window.PLANNER_CONFIG));
const C = Object.assign({}, base, { deelnemer: Object.assign({}, base.deelnemers[base.standaardDeelnemer]) });
const reg = C.pensioenreglement;
const ta = C.topaow;
const th = C.tophl;
const pp = C.partnerpensioen;
const aowM = reg.aowLeeftijdMaanden;
const birth = E.maandIndex(C.deelnemer.geboortedatum);
const calc = E.maandIndex(C.calculatiedatum);
const rente = C.rendement.overrendementNaRTS;
const std = C.parttimepercentages.map(r => ({ vanaf: r.vanaf, percentage: r.percentage }));
const results = [];
function check(name, ok, detail) { results.push((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  [' + detail + ']' : '')); }
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 * Math.max(1, Math.abs(b)) : tol);

// 1. Saldo per maand: begin + inleg + over - onttrokken == eind (ook bij deeltijd)
function saldoOk(sim) {
  let worst = 0;
  sim.rows.forEach(r => { worst = Math.max(worst, Math.abs(r.begin + r.inleg + r.over - r.onttrokken - r.eind)); });
  return worst;
}
const simA = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
check('1a saldo maandtabel zonder deeltijd', saldoOk(simA) < 0.01, saldoOk(simA).toFixed(6));
const deelIdx = birth + 60 * 12;
const simD = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente, deeltijd: { idx: deelIdx, pct: 0.4 }, parttimepercentages: std, startkapitaal: 80000 });
check('1b saldo maandtabel met deeltijd', saldoOk(simD) < 0.01, saldoOk(simD).toFixed(6));

// 2. Pensioen precies op AOW-datum: pre == post, geen verdeling
const uA = E.uitkeringen(C, simA, { partnerPct: 0 }, aowM / 12);
check('2 AOW-datum: geen effect', near(uA.pre, uA.post) && near(uA.pre, uA.standaard), uA.pre.toFixed(2) + ' vs ' + uA.post.toFixed(2));

// 3. TOPAOW en TOPHL: alle grenzen uit config.js
const pensJ = 62;
const simH = E.simuleer(C, { pensioenLeeftijdMaanden: pensJ * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
const K3 = simH.kapitaal;
const aOP62 = E.delerVoor(pensJ, C.annuiteitsdelers);
const op0 = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 0 }, pensJ);
const maxT1 = op0.maxT1;
const kOP0 = op0.standaard * aOP62;

// 3a: bij ruim kapitaal is het TOPAOW-maximum gelijk aan maxPerJaar uit de config (niet vacuüm)
const simRijk = E.simuleer(C, { pensioenLeeftijdMaanden: pensJ * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 5000000 });
const uRijk = E.uitkeringen(C, simRijk, { partnerPct: pp.standaardPct, topaow: 0 }, pensJ);
check('3a TOPAOW-max = config maxPerJaar bij ruim kapitaal', near(uRijk.maxT1, ta.maxPerJaar), uRijk.maxT1.toFixed(2) + ' vs ' + ta.maxPerJaar);

// 3b: maximum = min(maxPerJaar, (K_OP - ondergrensOP x aOP) / inkoopfactor), met de partnerpensioen-inkoop uit de config
const capMax = K3 * aOP62 / (aOP62 + pp.standaardPct / 100 * pp.inkoopfactorNP);
const expectMax = Math.min(ta.maxPerJaar, ((capMax * aOP62) - ta.ondergrensOP * aOP62) / ta.inkoopfactor);
check('3b max = min(maxPerJaar, (K_OP - ondergrensOP x aOP) / inkoopfactor)', near(maxT1, Math.max(0, expectMax), 1e-6 * Math.max(1, expectMax)), maxT1.toFixed(2) + ' vs ' + expectMax.toFixed(2));
const opBoven = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 1e9 }, pensJ);
check('3c boven maximum wordt begrensd', near(opBoven.t1, maxT1, 1e-6));
check('3d OP na TOPAOW blijft >= ondergrensOP', opBoven.opNa >= ta.ondergrensOP - 1e-6, opBoven.opNa.toFixed(2));
check('3e kapitaalidentiteit: OP_na x aOP + inkoopfactor x T1 = K_OP', near(opBoven.opNa * aOP62 + ta.inkoopfactor * opBoven.t1, kOP0, 1e-6 * kOP0));

// 3f: vaste bedragen, geen indexatie van het maximum
const uSmall = E.uitkeringen(C, simH, { partnerPct: 0, topaow: 1000 }, pensJ);
check('3f TOPAOW 1.000 geeft pre = OP_na + 1.000', near(uSmall.pre, uSmall.opNa + 1000, 1e-6));

// 3g: deeltijd: maximum naar rato van de werkfractie
const uDeel = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 1e9, werkfractie: 0.6 }, pensJ);
check('3g deeltijd 60% geeft 60% van maxPerJaar', near(uDeel.maxT1, ta.maxPerJaar * 0.6, 1e-6), uDeel.maxT1.toFixed(2));

// 3h: kleine pot: OP na TOPAOW blijft boven de ondergrens (of TOPAOW is 0)
const uKlein = E.uitkeringen(C, E.simuleer(C, { pensioenLeeftijdMaanden: pensJ * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 30000 }), { partnerPct: 0, topaow: 1e9 }, pensJ);
check('3h kleine pot: OP na TOPAOW >= ondergrensOP (of T1 = 0)', uKlein.opNa >= ta.ondergrensOP - 1e-6 || uKlein.t1 === 0, uKlein.opNa.toFixed(2) + ' T1 ' + uKlein.t1.toFixed(2));

// 3i: TOPHL is los van de AOW-overbrugging: ook zonder TOPAOW-maximum mogelijk
const uNietMax = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 0, tophlPct: th.maxPctOP }, pensJ);
check('3i TOPHL onafhankelijk van TOPAOW-maximum', uNietMax.t2 > 0 && near(uNietMax.t2, th.maxPctOP * uNietMax.opNa, 1e-6), uNietMax.t2.toFixed(2));

// 3j: TOPHL-maximum = maxPctOP x OP na uitruil (levenslang OP + TOPHL blijft onder 133%)
const uMaxHL = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 1e9, tophlPct: th.maxPctOP }, pensJ);
check('3j TOPHL-max = maxPctOP x OP na uitruil', near(uMaxHL.maxT2, th.maxPctOP * uMaxHL.opNa, 1e-6), uMaxHL.maxT2.toFixed(2));
const kOPmax = uMaxHL.standaard * aOP62;

// 3k: kapitaalgrens: inkoop TOPHL + inkoop TOPAOW past binnen het kapitaal voor ruil
check('3k TOPHL-inkoop + TOPAOW-inkoop <= K_OP', th.inkoopfactor * uMaxHL.t2 + ta.inkoopfactor * uMaxHL.t1 <= kOPmax + 1e-6);

// 3l: kapitaalneutraal na het einde van TOPHL (standaard eind = AOW): post x aOP + inkoopTOPAOW x T1 + inkoopTOPHL x T2 = K_OP
check('3l kapitaalneutraal na einde TOPHL', near(uMaxHL.post * aOP62 + ta.inkoopfactor * uMaxHL.t1 + th.inkoopfactor * uMaxHL.t2, kOPmax, 1e-4 * kOPmax),
  (uMaxHL.post * aOP62 + ta.inkoopfactor * uMaxHL.t1 + th.inkoopfactor * uMaxHL.t2 - kOPmax).toFixed(4));

// 3m: uitkering bij ingang = OP_na + T1 + T2
check('3m pre = OP_na + T1 + T2', near(uMaxHL.pre, uMaxHL.opNa + uMaxHL.t1 + uMaxHL.t2, 1e-6));

// 3n: vanaf de AOW-datum geen TOPAOW; TOPHL kan nog tot AOW + 10 jaar
const uAOW = E.uitkeringen(C, simA, { partnerPct: pp.standaardPct, topaow: 1e9, tophlPct: th.maxPctOP }, aowM / 12);
check('3n vanaf AOW geen TOPAOW', uAOW.t1 === 0);
check('3n vanaf AOW TOPHL tot AOW + 10 jaar', uAOW.eindM === aowM + th.jarenNaAOW * 12 && near(uAOW.t2, th.maxPctOP * uAOW.opNa, 1e-6), uAOW.eindM / 12);

// 3o: op AOW zonder TOPHL: uitkering vóór = na = standaard
const uAOW0 = E.uitkeringen(C, simA, { partnerPct: pp.standaardPct, topaow: 1e9, tophlPct: 0 }, aowM / 12);
check('3o op AOW zonder TOPHL: pre = post = standaard', near(uAOW0.pre, uAOW0.standaard, 1e-6) && near(uAOW0.post, uAOW0.standaard, 1e-6));

// 3p: TOPHL is nooit meer dan maxPctOP van het OP na uitruil
check('3p TOPHL <= maxPctOP x OP na uitruil', uMaxHL.t2 <= th.maxPctOP * uMaxHL.opNa + 1e-6);

// 3q, 3r: TOPHL 0% geeft geen TOPHL; 10% geeft 10% van OP na TOPAOW
const uP0 = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 1e9, tophlPct: 0 }, pensJ);
check('3q TOPHL 0% geeft T2 = 0', uP0.t2 === 0 && uP0.pre === uP0.opNa + uP0.t1);
const uP10 = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 1e9, tophlPct: 0.10 }, pensJ);
check('3r TOPHL 10% = 10% van OP na TOPAOW', near(uP10.t2, 0.10 * uP10.opNa, 1e-6), uP10.t2.toFixed(2));

// 3s: TOPHL boven het maximum wordt begrensd op maxPctOP
const uP50 = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 1e9, tophlPct: 0.5 }, pensJ);
check('3s TOPHL boven maximum begrensd op maxPctOP', near(uP50.t2, th.maxPctOP * uP50.opNa, 1e-6), uP50.t2.toFixed(2));
check('3t post = OP_na - inkoopTOPHL x T2 / aOP', near(uP50.post, uP50.opNa - th.inkoopfactor * uP50.t2 / aOP62, 1e-6));

// 3u: TOPHL ook mogelijk bij een TOPAOW onder het maximum
const uP10geen = E.uitkeringen(C, simH, { partnerPct: pp.standaardPct, topaow: 5000, tophlPct: 0.10 }, pensJ);
check('3u TOPHL mogelijk bij TOPAOW onder maximum', uP10geen.t2 > 0 && near(uP10geen.t2, 0.10 * uP10geen.opNa, 1e-6));

// 15. TOPHL-einddatum
const tMax = aowM + th.jarenNaAOW * 12;
const c70 = E.simuleer(C, { pensioenLeeftijdMaanden: 70 * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
const c78 = E.simuleer(C, { pensioenLeeftijdMaanden: 78 * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
const h = { partnerPct: pp.standaardPct, topaow: 1e9, tophlPct: 0.2 };
const e1 = E.uitkeringen(C, simH, h, pensJ);
check('15a pensioen vóór AOW: standaard einde = AOW-datum', e1.eindM === aowM && near(e1.t2, 0.2 * e1.opNa, 1e-6), e1.eindM / 12);
const e2 = E.uitkeringen(C, simA, h, aowM / 12);
check('15b pensioen op AOW: standaard einde = AOW + 10 jaar', e2.eindM === tMax, e2.eindM / 12);
const e3 = E.uitkeringen(C, c70, h, 70);
check('15c pensioen na AOW: standaard einde = AOW + 10 jaar', e3.eindM === tMax && e3.t1 === 0);
const k1 = E.uitkeringen(C, simH, { ...h, tophlEindMaanden: 70 * 12 }, pensJ);
check('15d gekozen einde binnen bereik wordt gebruikt', k1.eindM === 70 * 12);
const k2 = E.uitkeringen(C, simH, { ...h, tophlEindMaanden: pensJ * 12 - 24 }, pensJ);
check('15e einde vóór pensioendatum wordt begrensd op pensioendatum + 1 maand', k2.eindM === pensJ * 12 + 1, k2.eindM);
const k3 = E.uitkeringen(C, simH, { ...h, tophlEindMaanden: tMax + 60 }, pensJ);
check('15f einde na AOW + 10 jaar wordt begrensd op AOW + 10 jaar', k3.eindM === tMax);
const k4 = E.uitkeringen(C, c70, { ...h, tophlEindMaanden: 72 * 12 }, 70);
check('15g pensioen na AOW, einde 72 jaar gekozen', k4.eindM === 72 * 12 && k4.t2 > 0);
const k5 = E.uitkeringen(C, c78, h, 78);
check('15h pensioen na AOW + 10 jaar: geen TOPHL meer mogelijk', k5.tophlMogelijk === false && k5.t2 === 0);
check('15i jaarlijkse uitkering bij ingang = pre', near(E.jaarlijkseUitkering(e1, pensJ * 12), e1.pre, 1e-6));
check('15j jaarlijkse uitkering bij AOW (einde = AOW) = post', near(E.jaarlijkseUitkering(e1, aowM), e1.post, 1e-6));
const tussen = E.uitkeringen(C, simH, { ...h, tophlEindMaanden: 65 * 12 }, pensJ);
check('15k TOPHL eindigt vóór AOW: tussen einde en AOW = OP_na - R + T1',
  near(E.jaarlijkseUitkering(tussen, 66 * 12), tussen.opNa - tussen.R + tussen.t1, 1e-6), E.jaarlijkseUitkering(tussen, 66 * 12).toFixed(2));
const na = E.uitkeringen(C, simH, { ...h, tophlEindMaanden: aowM + 60 }, pensJ);
check('15l TOPHL eindigt na AOW: op AOW = OP_na + T2 (geen TOPAOW)', near(E.jaarlijkseUitkering(na, aowM), na.opNa + na.t2, 1e-6));
check('15m 133%-grens: OP na uitruil + TOPHL <= 133% van levenslang OP', na.opNa + na.t2 <= 1.33 * na.opNa + 1e-6);
const aOP70 = E.delerVoor(70, C.annuiteitsdelers);
const p70 = E.uitkeringen(C, c70, { partnerPct: pp.standaardPct, topaow: 1e9, tophlPct: th.maxPctOP }, 70);
check('15n kapitaalneutraal bij einde AOW + 10 jaar', near(p70.post * aOP70 + th.inkoopfactor * p70.t2, p70.standaard * aOP70, 1e-6 * p70.standaard * aOP70));

// 4. Partnerpensioen: OP x annuiteit + NP x inkoopfactorNP = kapitaal; NP = percentage x OP
const aOP67 = E.delerVoor(aowM / 12, C.annuiteitsdelers);
const inkoop = pp.inkoopfactorNP;
[pp.minPct, pp.maxPct / 2, pp.maxPct].forEach(pct => {
  const u = E.uitkeringen(C, simA, { partnerPct: pct }, aowM / 12);
  const kap = u.standaard * aOP67 + u.partner * inkoop;
  check('4a identiteit kapitaal (' + pct + '%)', near(kap, simA.kapitaal, 1e-6 * simA.kapitaal), (kap - simA.kapitaal).toFixed(6));
  check('4b NP = ' + pct + '% van OP', near(u.partner, pct / 100 * u.standaard, 1e-6 * u.standaard + 1e-9));
});
const uMin = E.uitkeringen(C, simA, { partnerPct: pp.minPct }, aowM / 12);
const uMid = E.uitkeringen(C, simA, { partnerPct: pp.maxPct / 2 }, aowM / 12);
const uMax = E.uitkeringen(C, simA, { partnerPct: pp.maxPct }, aowM / 12);
check('4c minimum partnerpensioen: NP = minPct x OP', near(uMin.partner, pp.minPct / 100 * uMin.standaard, 1e-6 * uMin.standaard + 1e-9));
check('4d meer partnerpensioen geeft minder ouderdomspensioen', uMax.standaard < uMid.standaard && uMid.standaard < uMin.standaard);
const uHi = E.uitkeringen(C, simA, { partnerPct: pp.maxPct + 30 }, aowM / 12);
check('4e boven maxPct wordt begrensd op maxPct', near(uHi.partner, pp.maxPct / 100 * uHi.standaard, 1e-6 * uHi.standaard));
const uDef = E.uitkeringen(C, simA, {}, aowM / 12);
check('4f standaard partnerpensioen = config standaardPct', near(uDef.partner, pp.standaardPct / 100 * uDef.standaard, 1e-6 * uDef.standaard));
check('4g standaardPct ligt binnen minPct en maxPct', pp.standaardPct >= pp.minPct && pp.standaardPct <= pp.maxPct, pp.minPct + ' <= ' + pp.standaardPct + ' <= ' + pp.maxPct);
// Rekenvoorbeeld: K = 100.000, aOP = 18, 50% partner: OP x 18 + NP x inkoopfactor = K
const Kv = 100000, aOPex = 18, vex = 0.5;
const opEx = Kv / (aOPex + vex * inkoop), npEx = vex * opEx;
check('4h rekenvoorbeeld: OP x 18 + NP x inkoopfactorNP = 100.000', near(opEx * aOPex + npEx * inkoop, Kv, 1e-6 * Kv), opEx.toFixed(2) + ' / ' + npEx.toFixed(2));

// 5. Eerder stoppen: minder kapitaal, lagere uitkering dan op de AOW-datum
const sim60 = E.simuleer(C, { pensioenLeeftijdMaanden: 60 * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
const u60 = E.uitkeringen(C, sim60, { partnerPct: 0 }, 60);
check('5 eerder stoppen: kapitaal en uitkering > 0 en kleiner dan op AOW', u60.pre > 0 && sim60.kapitaal < simA.kapitaal && u60.pre < uA.pre, u60.pre.toFixed(0) + ' < ' + uA.pre.toFixed(0));

// 6. Parttime wijziging op eerste dag van de maand: premie wijzigt precies in die maand
const wijz = [{ vanaf: '2030-01', percentage: 50 }];
const simW = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente, deeltijd: null, parttimepercentages: wijz, startkapitaal: 80000 });
const iW = E.maandIndex('2030-01');
const rowW = simW.rows.find(r => r.maand === E.maandLabel(iW));
const rowPrev = simW.rows.find(r => r.maand === E.maandLabel(iW - 1));
check('6a wijziging-maand heeft wijziging-vlag', rowW && rowW.wijziging === true && rowW.werk === 0.5, rowW && rowW.werk);
check('6b maand ervoor is 100%', rowPrev && rowPrev.werk === 1);
const rowNext = simW.rows.find(r => r.maand === E.maandLabel(iW + 1));
check('6c maand erna is 50%, geen wijziging-vlag', rowNext && rowNext.werk === 0.5 && rowNext.wijziging === false);
check('6d premie in 50%-maand is de helft van 100%-maand (zelfde salarisindex)', rowW && near(rowW.inleg, rowPrev.inleg * 0.5, rowPrev.inleg * 0.02), (rowW.inleg / rowPrev.inleg).toFixed(4));

// 7. Deeltijd: onttrekking = kapitaal x pct; premie daalt met (1 - pct); daarna volledig
const pct = 0.4;
const dRow = simD.rows.find(r => r.onttrokken > 0);
check('7a onttrekking op deeltijd-maand', dRow && near(dRow.onttrokken, dRow.begin * pct, 1e-6 * dRow.begin), dRow && dRow.onttrokken.toFixed(2));
check('7b deeltijd verlaagt werk met (1-pct)', dRow && near(dRow.werk, 1 * (1 - pct)), dRow && dRow.werk);
check('7c deeltijd: deelJaar > 0', simD.deelJaar > 0, simD.deelJaar.toFixed(2));
check('7d kapitaal na deeltijd lager dan zonder deeltijd', simD.kapitaal < simA.kapitaal);

// 8. Reële bedragen: reeel = eind / (1+pi)^(t)
const pi = C.rendement.inflatiePrijs;
const rowLast = simA.rows[simA.rows.length - 1];
const expectReeel = rowLast.eind / Math.pow(1 + pi, (simA.rows.length - 1) / 12);
check('8 reëel eindkapitaal consistent', near(rowLast.reeel, expectReeel, 1e-3 * expectReeel), rowLast.reeel.toFixed(0) + ' vs ' + expectReeel.toFixed(0));
check('8b inflIdx op pensioendatum > 1', simA.inflIdx > 1, simA.inflIdx.toFixed(4));

// 9. Toedeelfactor: factorVoor tot leeftijdStart, factorNa vanaf leeftijdEind, lineair daartussen
const tf = C.toedeelschaal;
check('9a toedeelfactor = factorVoor vóór leeftijdStart', E.toedeelfactor((tf.leeftijdStart - 1) * 12, tf) === tf.factorVoor);
check('9b toedeelfactor = factorNa vanaf leeftijdEind', E.toedeelfactor((tf.leeftijdEind + 1) * 12, tf) === tf.factorNa);
const midAge = (tf.leeftijdStart + tf.leeftijdEind) / 2;
check('9c toedeelfactor lineair daartussen', near(E.toedeelfactor(midAge * 12, tf), (tf.factorVoor + tf.factorNa) / 2, 1e-9), E.toedeelfactor(midAge * 12, tf).toFixed(4));

// 10. Netto: monotoon, 0 bij 0, lhk verlaagt belasting
const n1 = E.nettoJaar(C, 20000, true), n2 = E.nettoJaar(C, 30000, true), n3 = E.nettoJaar(C, 30000, false);
check('10a netto 0 bij 0', E.nettoJaar(C, 0, true) === 0);
check('10b netto stijgt met bruto', n2 > n1);
check('10c lhk verhoogt netto', n2 > n3);
check('10d netto nooit groter dan bruto', n2 <= 30000 && n1 <= 20000);
check('10e netto <= bruto over bereik', (() => { for (let b = 0; b <= 150000; b += 5000) { if (E.nettoJaar(C, b, true) > b + 1e-9) return false; } return true; })());

// 11. Monotonie: meer werken (hoger parttime) geeft meer kapitaal
const simFull = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente, deeltijd: null, parttimepercentages: [{ vanaf: '2026-11', percentage: 100 }], startkapitaal: 80000 });
const simHalf = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente, deeltijd: null, parttimepercentages: [{ vanaf: '2026-11', percentage: 50 }], startkapitaal: 80000 });
check('11 meer werken geeft meer kapitaal', simFull.kapitaal > simHalf.kapitaal);

// 12. Scenario-marge: afnemend met looptijd, positief
const m1 = E.scenarioMarge(C, 55 * 12), m2 = E.scenarioMarge(C, 67 * 12);
check('12 scenario-marge afnemend met looptijd', m2 < m1 && m2 > 0, m1.toFixed(4) + ' > ' + m2.toFixed(4));

// 13. Grensgeval: startkapitaal 0 geeft geen NaN
const simE = E.simuleer(C, { pensioenLeeftijdMaanden: 60 * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 0 });
check('13 startkapitaal 0 geen NaN', isFinite(simE.kapitaal) && simE.kapitaal >= 0);

// 14. Negatief rendement: geen NaN, lager kapitaal
const simNeg = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente: -0.02, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
check('14 negatief rendement geeft lager kapitaal, geen NaN', isFinite(simNeg.kapitaal) && simNeg.kapitaal < simA.kapitaal);

results.forEach(r => console.log(r));
console.log('\nFAILS: ' + results.filter(r => r.startsWith('FAIL')).length + ' / ' + results.length);
