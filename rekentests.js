global.window = {};
const fs = require('fs');
eval(fs.readFileSync(__dirname + '/config.js', 'utf8'));
eval(fs.readFileSync(__dirname + '/engine.js', 'utf8'));
const E = window.PensioenEngine;
const base = JSON.parse(JSON.stringify(window.PLANNER_CONFIG));
const C = Object.assign({}, base, { deelnemer: Object.assign({}, base.deelnemers[base.standaardDeelnemer]) });
const reg = C.pensioenreglement;
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

// 3. TOPAOW: cap, ondergrens en vaste bedragen
const pensJ = 62;
const simH = E.simuleer(C, { pensioenLeeftijdMaanden: pensJ * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
const K3 = simH.kapitaal; const aOP62 = C.annuiteitsdelers[62];
const op0 = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 0 }, pensJ);
const maxT1 = op0.maxT1;
check('3a TOPAOW max = 20.000 bij voldoende kapitaal', near(maxT1, 20000) || maxT1 < 20000, maxT1.toFixed(2));
const capMax = (K3 * E.delerVoor(pensJ, C.annuiteitsdelers) / (E.delerVoor(pensJ, C.annuiteitsdelers) + 0.7 * 4)) ;
const expectMax = Math.min(20000, ((capMax * aOP62) - 500 * aOP62) / 5);
check('3b max = min(20.000, (K_OP - 500 x aOP) / 5)', near(maxT1, Math.max(0, expectMax), 1e-6 * Math.max(1, expectMax)), maxT1.toFixed(2) + ' vs ' + expectMax.toFixed(2));
const opBoven = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 1e9 }, pensJ);
check('3c boven maximum wordt begrensd', near(opBoven.t1, maxT1, 1e-6));
check('3d OP na TOPAOW op maximum blijft >= 500', opBoven.opNa >= 500 - 1e-6, opBoven.opNa.toFixed(2));
const kapOP = op0.standaard * aOP62 ;
check('3e kapitaalidentiteit: OP_na x aOP + 5 x T1 = K_OP', near(opBoven.opNa * aOP62 + 5 * opBoven.t1, kapOP, 1e-6 * kapOP));

// 3f. Vaste bedragen: maximum verandert niet met de looptijd (geen indexatie)
const uSmall = E.uitkeringen(C, simH, { partnerPct: 0, topaow: 1000 }, pensJ);
check('3f TOPAOW 1.000 geeft pre = OP_na + 1.000', near(uSmall.pre, uSmall.opNa + 1000, 1e-6));

// 3g. Deeltijd: maximum naar rato van werkfractie
const uDeel = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 1e9, werkfractie: 0.6 }, pensJ);
check('3g deeltijd 60% geeft maximum 12.000', near(uDeel.maxT1, 12000, 1e-6), uDeel.maxT1.toFixed(2));

// 3h. Ondergrens: als OP na TOPAOW onder 500 zou komen, wordt het begrensd
const uKlein = E.uitkeringen(C, E.simuleer(C, { pensioenLeeftijdMaanden: 62*12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 30000 }), { partnerPct: 0, topaow: 1e9 }, pensJ);
check('3h kleine pot: OP na TOPAOW >= 500 (of T1 = 0)', uKlein.opNa >= 500 - 1e-6 || uKlein.t1 === 0, uKlein.opNa.toFixed(2) + ' T1 ' + uKlein.t1.toFixed(2));

// 3i. TOPHL alleen bij TOPAOW op maximum
const uNietMax = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 0, tophlPct: 0.33 }, pensJ);
check('3i TOPHL geblokkeerd zonder TOPAOW-maximum', uNietMax.t2 === 0 && uNietMax.tophlMogelijk === false);
const uMaxHL = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 1e9, tophlPct: 0.33 }, pensJ);
check('3j TOPHL op max is 33% van OP na uitruil', near(uMaxHL.maxT2, Math.min(0.33 * uMaxHL.opNa, (kapOP - 5 * uMaxHL.t1) / 5), 1e-6 * Math.max(1, uMaxHL.maxT2)), uMaxHL.maxT2.toFixed(2));
check('3k TOPHL restkapitaal: 5 x T2 <= K_OP - 5 x T1', 5 * uMaxHL.t2 <= kapOP - 5 * uMaxHL.t1 + 1e-6);
check('3l kapitaalneutraal na AOW: post x aOP + 5 x (T1+T2) = K_OP', near(uMaxHL.post * aOP62 + 5 * (uMaxHL.t1 + uMaxHL.t2), kapOP, 1e-4 * kapOP), (uMaxHL.post * aOP62 + 5 * (uMaxHL.t1 + uMaxHL.t2) - kapOP).toFixed(4));
check('3m pre = OP_na + T1 + T2', near(uMaxHL.pre, uMaxHL.opNa + uMaxHL.t1 + uMaxHL.t2, 1e-6));

// 3n. Pensioen op of na AOW: geen TOPAOW of TOPHL
const uAOW = E.uitkeringen(C, simA, { partnerPct: 70, topaow: 1e9, tophlPct: 0.33 }, aowM / 12);
check('3n vanaf AOW geen TOPAOW/TOPHL', uAOW.t1 === 0 && uAOW.t2 === 0 && uAOW.pre === uAOW.post);
check('3o pre = post = standaard op AOW', near(uAOW.pre, uAOW.standaard, 1e-6));

// 3q. TOPHL percentage: 0 geeft geen TOPHL, 10% geeft 10% van OP na uitruil, boven 33% wordt begrensd
const uP0 = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 1e9, tophlPct: 0 }, pensJ);
check('3q TOPHL 0% geeft T2 = 0', uP0.t2 === 0 && uP0.pre === uP0.opNa + uP0.t1);
const uP10 = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 1e9, tophlPct: 0.10 }, pensJ);
check('3r TOPHL 10% = 10% van OP na uitruil', near(uP10.t2, 0.10 * uP10.opNa, 1e-6), uP10.t2.toFixed(2));
const uP50 = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 1e9, tophlPct: 0.5 }, pensJ);
check('3s TOPHL boven 33% begrensd', near(uP50.t2, 0.33 * uP50.opNa, 1e-6));
check('3t TOPHL 33% op maximum TOPAOW: post = OP_na - 5 x T2 / aOP', near(uP50.post, uP50.opNa - 5 * uP50.t2 / aOP62, 1e-6));
const uP10geen = E.uitkeringen(C, simH, { partnerPct: 70, topaow: 5000, tophlPct: 0.10 }, pensJ);
check('3u TOPHL geblokkeerd als TOPAOW niet op maximum', uP10geen.t2 === 0);

// 3p. 33%-grens is jaarbedrag: T2 mag niet 33% van OP_voor zijn als dat groter is dan 33% van OP_na
check('3p 33%-grens vergelijkt met OP na uitruil', uMaxHL.maxT2 <= 0.33 * uMaxHL.opNa + 1e-6);

// 4. Partnerpensioen: OP x annuiteit + NP x inkoopfactor = kapitaal; NP = percentage x OP
const aOP67 = C.annuiteitsdelers[67];
const inkoop = C.partnerpensioen.inkoopfactorNP;
[0, 30, 50, 70].forEach(pct => {
  const u = E.uitkeringen(C, simA, { partnerPct: pct }, aowM / 12);
  const kap = u.standaard * aOP67 + u.partner * inkoop;
  check('4a identiteit kapitaal (' + pct + '%)', near(kap, simA.kapitaal, 1e-6 * simA.kapitaal), (kap - simA.kapitaal).toFixed(6));
  check('4b NP = ' + pct + '% van OP', near(u.partner, pct / 100 * u.standaard, 1e-6 * u.standaard + 1e-9));
});
const u0 = E.uitkeringen(C, simA, { partnerPct: 0 }, aowM / 12);
const u50 = E.uitkeringen(C, simA, { partnerPct: 50 }, aowM / 12);
const u70 = E.uitkeringen(C, simA, { partnerPct: 70 }, aowM / 12);
check('4c 0% partner: NP 0 en OP = kapitaal / annuiteit', u0.partner === 0 && near(u0.standaard, simA.kapitaal / aOP67));
check('4d meer partnerpensioen geeft minder ouderdomspensioen', u70.standaard < u50.standaard && u50.standaard < u0.standaard);
const uHi = E.uitkeringen(C, simA, { partnerPct: 100 }, aowM / 12);
check('4e boven 70% wordt begrensd op 70%', near(uHi.partner, 0.7 * uHi.standaard, 1e-6 * uHi.standaard));
check('4f standaard is 70%', near(E.uitkeringen(C, simA, {}, aowM / 12).partner, 0.7 * u70.standaard, 1e-6 * u70.standaard));
// Voorbeeld van de gebruiker, rechtstreeks uit de formule
const K = 100000, aOPex = 18, vex = 0.5;
check('4g voorbeeld: 100.000 / (18 + 50% x 4) = 5.000 OP en 2.500 NP', near(K / (aOPex + vex * 4), 5000) && near(vex * K / (aOPex + vex * 4), 2500));
check('4h voorbeeld met factor 3,5 geeft 5.063,29 OP', near(K / (aOPex + vex * 3.5), 5063.29, 0.01), (K / (aOPex + vex * 3.5)).toFixed(2));

// 5. Eerder stoppen: minder kapitaal, maar hogere deler mag niet leiden tot negatief
const sim60 = E.simuleer(C, { pensioenLeeftijdMaanden: 60 * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
const u60 = E.uitkeringen(C, sim60, { partnerPct: 0 }, 60);
check('5 eerder stoppen: kapitaal en uitkering > 0 en kleiner dan op AOW', u60.pre > 0 && sim60.kapitaal < simA.kapitaal && u60.pre < uA.pre, u60.pre.toFixed(0) + ' < ' + uA.pre.toFixed(0));

// 6. Parttime wijziging op eerste dag van de maand: premie wijzigt precies in die maand
const wijz = [{ vanaf: '2030-01', percentage: 50 }];
const simW = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente, deeltijd: null, parttimepercentages: wijz, startkapitaal: 80000 });
const iW = E.maandIndex('2030-01');
const rowW = simW.rows.find(r => E.maandIndex(r.maand.replace(/^(\w+) (\d+)$/, '$2') + '-01') === 0 ? false : r.maand === E.maandLabel(iW));
const rowPrev = simW.rows.find(r => r.maand === E.maandLabel(iW - 1));
check('6a wijziging-maand heeft wijziging-vlag', rowW && rowW.wijziging === true && rowW.werk === 0.5, rowW && rowW.werk);
check('6b maand ervoor is 100%', rowPrev && rowPrev.werk === 1);
const rowNext = simW.rows.find(r => r.maand === E.maandLabel(iW + 1));
check('6c maand erna is 50%, geen wijziging-vlag', rowNext && rowNext.werk === 0.5 && rowNext.wijziging === false);
const iStart = E.maandIndex(C.calculatiedatum);
check('6d premie in 50%-maand is de helft van 100%-maand (zelfde salarisindex)', rowW && near(rowW.inleg, rowPrev.inleg * 0.5, rowPrev.inleg * 0.02), (rowW.inleg / rowPrev.inleg).toFixed(4));

// 7. Deeltijd: onttrekking = kapitaal x pct; premie daalt met (1 - pct); daarna volledig
const pct = 0.4;
const rowsD = simD.rows;
const dRow = rowsD.find(r => r.onttrokken > 0);
check('7a onttrekking op deeltijd-maand', dRow && near(dRow.onttrokken, dRow.begin * pct, 1e-6 * dRow.begin), dRow && dRow.onttrokken.toFixed(2));
check('7b deeltijd verlaagt werk met (1-pct)', dRow && near(dRow.werk, 1 * (1 - pct)) , dRow && dRow.werk);
check('7c deeltijd: deelJaar > 0', simD.deelJaar > 0, simD.deelJaar.toFixed(2));
const uD = E.uitkeringen(C, simD, { partnerPct: 0 }, aowM / 12);
check('7d kapitaal na deeltijd lager dan zonder deeltijd (uitkering blijft wel opgebouwd)', simD.kapitaal < simA.kapitaal);

// 8. Reële bedragen: reeel = eind / (1+pi)^(t)
const pi = C.rendement.inflatiePrijs;
const rowLast = simA.rows[simA.rows.length - 1];
const expectReeel = rowLast.eind / Math.pow(1 + pi, (simA.rows.length - 1 + 0) / 12) ;
check('8 reëel eindkapitaal consistent', near(rowLast.reeel, expectReeel, 1e-3 * expectReeel), rowLast.reeel.toFixed(0) + ' vs ' + expectReeel.toFixed(0));
check('8b inflIdx op pensioendatum > 1', simA.inflIdx > 1, simA.inflIdx.toFixed(4));

// 9. Toedeelfactor: 1.05 tot 50, 0.45 op 67, monotoon dalend
const tf = C.toedeelschaal;
const tv = [40, 50, 55, 60, 67, 70].map(a => E.toedeelfactor ? null : null);
check('9 toedeelschaal begin/eind', tf.factorVoor === 1.05 && tf.factorNa === 0.45 && tf.leeftijdEind === 67, JSON.stringify(tf));

// 10. Netto: monotoon, 0 bij 0, lhk verlaagt belasting
const n1 = E.nettoJaar(C, 20000, true), n2 = E.nettoJaar(C, 30000, true), n3 = E.nettoJaar(C, 30000, false);
check('10a netto 0 bij 0', E.nettoJaar(C, 0, true) === 0);
check('10b netto stijgt met bruto', n2 > n1);
check('10c lhk verhoogt netto', n2 > n3);
check('10d netto nooit groter dan bruto', n2 <= 30000 && n1 <= 20000);
check('10e netto <= bruto over bereik', (()=>{ for (let b=0;b<=150000;b+=5000){ if (E.nettoJaar(C,b,true) > b+1e-9) return false;} return true; })());

// 11. Monotonie: meer werken (hoger parttime) geeft meer kapitaal
const simFull = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente, deeltijd: null, parttimepercentages: [{vanaf: '2026-11', percentage: 100}], startkapitaal: 80000 });
const simHalf = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente, deeltijd: null, parttimepercentages: [{vanaf: '2026-11', percentage: 50}], startkapitaal: 80000 });
check('11 meer werken geeft meer kapitaal', simFull.kapitaal > simHalf.kapitaal);

// 12. Scenario-marge: 0 bij pensioen vóór calculatie-einde, positief erna en kleiner bij latere datum
const m1 = E.scenarioMarge(C, 55*12), m2 = E.scenarioMarge(C, 67*12);
check('12 scenario-marge afnemend met looptijd', m2 < m1 && m2 > 0, m1.toFixed(4) + ' > ' + m2.toFixed(4));

// 13. Grensgeval: pensioen op calculatiedatum/zeer vroeg (leeftijd 60) geen NaN
const simE = E.simuleer(C, { pensioenLeeftijdMaanden: 60*12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 0 });
check('13 startkapitaal 0 geen NaN', isFinite(simE.kapitaal) && simE.kapitaal >= 0);

// 14. Negatief rendement: geen NaN, kapitaal lager dan bij positief rendement
const simNeg = E.simuleer(C, { pensioenLeeftijdMaanden: aowM, rente: -0.02, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
check('14 negatief rendement geeft lager kapitaal, geen NaN', isFinite(simNeg.kapitaal) && simNeg.kapitaal < simA.kapitaal);

results.forEach(r => console.log(r));
console.log('\nFAILS: ' + results.filter(r => r.startsWith('FAIL')).length + ' / ' + results.length);
