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
const uA = E.uitkeringen(C, simA, { uitruilPct: 0, splitten: 'hoog', fractie: 0.25 }, aowM / 12);
check('2 AOW-datum: hoog/laag heeft geen effect', near(uA.pre, uA.post) && near(uA.pre, uA.standaard), uA.pre.toFixed(2) + ' vs ' + uA.post.toFixed(2));

// 3. Hoog-laag is kostenneutraal over het leven: pre*nPre + post*nPost == base*(nPre+nPost)
const pensJ = 62;
const simH = E.simuleer(C, { pensioenLeeftijdMaanden: pensJ * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
['hoog', 'laag'].forEach(sp => {
  const u = E.uitkeringen(C, simH, { uitruilPct: 0, splitten: sp, fractie: 0.25 }, pensJ);
  const nPre = u.nPre, nPost = reg.eindLeeftijd * 12 - aowM;
  const lhs = u.pre * nPre + u.post * nPost, rhs = u.standaard * (nPre + nPost);
  check('3 hoog-laag neutraal (' + sp + ')', near(lhs, rhs, 1e-6 * rhs), (lhs - rhs).toFixed(4));
  check('3b hoog-laag richting (' + sp + ')', sp === 'hoog' ? u.pre > u.standaard && u.post < u.standaard : u.pre < u.standaard && u.post > u.standaard);
});

// 4. Partner: verlagen van partnerpensioen levert ouderdomspensioen op; 0% == standaard
const u0 = E.uitkeringen(C, simA, { uitruilPct: 0, splitten: 'nee' }, aowM / 12);
const u20 = E.uitkeringen(C, simA, { uitruilPct: 20, splitten: 'nee' }, aowM / 12);
check('4a partner 0% == standaard ouderdom', near(u0.pre, u0.standaard));
check('4b partner verlagen geeft meer ouderdom en minder partner', u20.pre > u0.pre && u20.partner < u0.partner, (u20.pre - u0.pre).toFixed(2) + ' / ' + (u20.partner - u0.partner).toFixed(2));
// Zonder standaard partnerpensioen: inruilen geeft partner, minder ouderdom
const C2 = Object.assign({}, C, { pensioenreglement: Object.assign({}, reg, { partnerpensioenStandaard: false }) });
const v0 = E.uitkeringen(C2, simA, { uitruilPct: 0, splitten: 'nee' }, aowM / 12);
const v10 = E.uitkeringen(C2, simA, { uitruilPct: 10, splitten: 'nee' }, aowM / 12);
check('4c inruilen geeft minder ouderdom en meer partner', v10.pre < v0.pre && v10.partner > v0.partner);

// 5. Eerder stoppen: minder kapitaal, maar hogere deler mag niet leiden tot negatief
const sim60 = E.simuleer(C, { pensioenLeeftijdMaanden: 60 * 12, rente, deeltijd: null, parttimepercentages: std, startkapitaal: 80000 });
const u60 = E.uitkeringen(C, sim60, { uitruilPct: 0, splitten: 'nee' }, 60);
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
const uD = E.uitkeringen(C, simD, { uitruilPct: 0, splitten: 'nee' }, aowM / 12);
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
