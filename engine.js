/*
  Pensioenplanner: rekenkern. Bevat alleen rekenlogica, geen beeld.
  Bijschrijving per maand = kapitaal x ((1 + overrendement)^(1/12) - 1) x toedeelfactor van de leeftijd in die maand.
  Het overrendement is het vaste rendement NA RTS-correctie. Er is geen beschermingsrendement.
  Premie = (min(salaris, maximum) x loonindex - franchise x prijsindex) x werkpercentage x premiepercentage / 12,
  bijgeschreven aan het eind van de maand. Die premie levert pas vanaf de volgende maand rendement op.
  Uitkering: ouderdomspensioen per jaar = kapitaal / annuiteitsdeler. Bij hoog/laag en laag/hoog wordt
  dat bedrag vóór de AOW-leeftijd verhoogd of verlaagd, en na de AOW-leeftijd omgekeerd verschoven.
*/
(function (global) {
  'use strict';

  const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function maandIndex(s) {
    const d = s.split('-').map(Number);
    return d[0] * 12 + (d[1] - 1);
  }

  function maandLabel(i) {
    return MAANDEN[i % 12] + ' ' + Math.floor(i / 12);
  }

  function leeftijdLabel(m) {
    return Math.floor(m / 12) + ' j ' + (m % 12) + ' m';
  }

  // Toedeelfactor op een leeftijd in maanden.
  function toedeelfactor(ageM, t) {
    const s = t.leeftijdStart * 12;
    const e = t.leeftijdEind * 12;
    if (ageM <= s) return t.factorVoor;
    if (ageM >= e) return t.factorNa;
    return t.factorVoor + (t.factorNa - t.factorVoor) * (ageM - s) / (e - s);
  }

  // Annuiteitsdeler op een leeftijd in jaren, lineair geinterpoleerd.
  function delerVoor(jaar, tabel) {
    const keys = Object.keys(tabel).map(Number).sort((a, b) => a - b);
    const x = Math.min(Math.max(jaar, keys[0]), keys[keys.length - 1]);
    const lo = Math.floor(x);
    const hi = Math.min(lo + 1, keys[keys.length - 1]);
    return tabel[lo] + (tabel[hi] - tabel[lo]) * (x - lo);
  }

  // Werkpercentage (0-1) in een maand. De lijst moet op datum gesorteerd zijn.
  function werkpctVoor(i, lijst) {
    let pct = 100;
    lijst.forEach(function (p) {
      if (maandIndex(p.vanaf) <= i) pct = p.percentage;
    });
    return pct / 100;
  }

  // Maandelijkse simulatie van het pensioenvermogen tot de pensioendatum.
  // o = { pensioenLeeftijdMaanden, rente (jaarlijks, na RTS), deeltijd: { idx, pct } | null }
  function simuleer(cfg, o) {
    const calc = maandIndex(cfg.calculatiedatum);
    const birth = maandIndex(cfg.deelnemer.geboortedatum);
    const reg = cfg.pensioenreglement;
    const pi = cfg.rendement.inflatiePrijs;
    const li = cfg.rendement.loonInflatie;
    const pensIdx = birth + o.pensioenLeeftijdMaanden;
    const j0 = Math.floor(calc / 12);
    const rm = Math.pow(1 + o.rente, 1 / 12) - 1;

    const deel = o.deeltijd;
    let S = cfg.deelnemer.startkapitaal;
    let deelJaar = 0;
    const rows = [];
    const totalen = { inleg: 0, over: 0 };

    for (let i = calc; i < pensIdx; i++) {
      const ageM = i - birth;
      const jaar = Math.floor(i / 12) - j0;
      const idxL = Math.pow(1 + li, jaar);
      const idxP = Math.pow(1 + pi, jaar);
      const begin = S;

      // Deeltijdpensioen: een deel van het kapitaal gaat in een keer naar uitkering.
      let onttrokken = 0;
      if (deel && i === deel.idx) {
        onttrokken = S * deel.pct;
        deelJaar = onttrokken / delerVoor(ageM / 12, cfg.annuiteitsdelers);
        S -= onttrokken;
      }

      // Overrendement over het kapitaal aan het begin van de maand. Geen beschermingsrendement.
      const toed = toedeelfactor(ageM, cfg.toedeelschaal);
      const over = S * rm * toed;
      S += over;

      // Premie over het pensioengevend salaris, pro rata met het werkpercentage.
      const deelPct = deel && i >= deel.idx ? deel.pct : 0;
      const werk = Math.max(0, werkpctVoor(i, cfg.werkpercentages) - deelPct);
      const pe = Math.max(0, Math.min(cfg.deelnemer.brutoSalaris, reg.maxPensioengevendSalaris) * idxL - reg.franchise * idxP) * werk;
      const inleg = pe * reg.premiepercentage / 12;
      S += inleg;

      totalen.inleg += inleg;
      totalen.over += over;

      rows.push({
        maand: maandLabel(i),
        leeftijd: leeftijdLabel(ageM),
        begin: begin,
        onttrokken: onttrokken,
        inleg: inleg,
        over: over,
        eind: S,
        reeel: S / Math.pow(1 + pi, (i - calc) / 12),
        werk: werk,
        toed: toed
      });
    }

    return {
      rows: rows,
      kapitaal: S,
      deelJaar: deelJaar,
      inflIdx: Math.pow(1 + pi, (pensIdx - calc) / 12),
      totalen: totalen
    };
  }

  // Jaarlijkse uitkeringen. opt = { uitruilPct, splitten: 'nee' | 'hoog' | 'laag', fractie }.
  // Bij partnerpensioenStandaard = true: uitruilPct is het percentage van het partnerpensioen dat u verlaagt
  //   (dat geeft extra ouderdomspensioen).
  // Bij partnerpensioenStandaard = false: uitruilPct is het percentage van het ouderdomspensioen dat u inruilt
  //   voor partnerpensioen.
  // splitten: 'hoog' = hoger vóór de AOW, lager erna; 'laag' = lager vóór de AOW, hoger erna.
  // fractie: hoe groot het verschil is (0-1). Vereenvoudigd kostenneutraal (zonder rente en sterfte).
  function uitkeringen(cfg, sim, opt, pensioenLeeftijdJaar) {
    const reg = cfg.pensioenreglement;
    const d = delerVoor(pensioenLeeftijdJaar, cfg.annuiteitsdelers);
    const std = sim.kapitaal / d;
    const v = (opt.uitruilPct || 0) / 100;
    const r = cfg.opties.uitruilRatio;
    let base = std;
    let partner;
    if (reg.partnerpensioenStandaard) {
      // Partnerpensioen is gereserveerd: verlagen geeft extra ouderdomspensioen.
      const partnerStd = std * reg.partnerpensioenFractie;
      partner = partnerStd * (1 - v);
      base = std + partnerStd * v / r;
    } else {
      // Geen standaard partnerpensioen: inruilen van ouderdomspensioen levert partnerpensioen op.
      base = std * (1 - v);
      partner = std * v * r;
    }

    const nPre = Math.max(0, reg.aowLeeftijdMaanden - pensioenLeeftijdJaar * 12);
    const nPost = Math.max(1, reg.eindLeeftijd * 12 - reg.aowLeeftijdMaanden);
    const ratio = nPre / nPost;
    const x = opt.fractie !== undefined ? opt.fractie : cfg.opties.aowOverbrugging;

    let pre = base;
    let post = base;
    if (nPre > 0 && opt.splitten === 'hoog') {
      pre = base * (1 + x);
      post = base * (1 - x * ratio);
    } else if (nPre > 0 && opt.splitten === 'laag') {
      pre = base * (1 - x);
      post = base * (1 + x * ratio);
    }

    return {
      standaard: std,
      pre: pre,
      post: post,
      partner: partner,
      preReeel: pre / sim.inflIdx,
      postReeel: post / sim.inflIdx,
      partnerReeel: partner / sim.inflIdx,
      deelJaar: sim.deelJaar,
      deelReeel: sim.deelJaar / sim.inflIdx,
      nPre: nPre
    };
  }

  // Maandelijkse uitkeringsreeks van de pensioendatum tot de eindleeftijd.
  // Geeft per maand het nominale en reële bedrag, plus het standaardpensioen ter vergelijking.
  function uitkeringsreeks(cfg, sim, u, pensioenLeeftijdJaar, deel) {
    const birth = maandIndex(cfg.deelnemer.geboortedatum);
    const calc = maandIndex(cfg.calculatiedatum);
    const reg = cfg.pensioenreglement;
    const pi = cfg.rendement.inflatiePrijs;
    const start = birth + pensioenLeeftijdJaar * 12;
    const eind = birth + reg.eindLeeftijd * 12;
    const aowIdx = birth + reg.aowLeeftijdMaanden;
    const punten = [];

    for (let i = start; i < eind; i++) {
      const voorAow = i < aowIdx;
      const jaarlijks = voorAow ? u.pre : u.post;
      const deelMaand = deel && i >= deel.idx ? sim.deelJaar / 12 : 0;
      const nominaal = jaarlijks / 12 + deelMaand;
      punten.push({
        leeftijd: (i - birth) / 12,
        maand: maandLabel(i),
        nominaal: nominaal,
        reeel: nominaal / Math.pow(1 + pi, (i - calc) / 12),
        standaard: u.standaard / 12
      });
    }

    return { punten: punten, aowIdx: aowIdx, startIdx: start, eindIdx: eind, aowLeeftijd: reg.aowLeeftijdMaanden / 12 };
  }

  // Netto jaarbedrag (€) uit bruto jaarinkomen, met de fictieve schijven en optioneel de heffingskorting.
  function nettoJaar(cfg, bruto, lhk) {
    if (bruto <= 0) return 0;
    let belasting = 0;
    let onder = 0;
    cfg.belasting.schijven.forEach(function (sch) {
      const boven = sch.tot === null ? bruto : Math.min(bruto, sch.tot);
      if (boven > onder) belasting += (boven - onder) * sch.tarief;
      onder = sch.tot === null ? bruto : sch.tot;
    });
    belasting -= lhk ? cfg.belasting.heffingskorting : 0;
    belasting = Math.max(0, Math.min(belasting, bruto));
    return bruto - belasting;
  }

  // Bandbreedte C = Y / sqrt((A - B) / 12), A = pensioenmaanden, B = leeftijd op de calculatiedatum in maanden.
  function scenarioMarge(cfg, pensioenLeeftijdMaanden) {
    const calc = maandIndex(cfg.calculatiedatum);
    const birth = maandIndex(cfg.deelnemer.geboortedatum);
    const A = pensioenLeeftijdMaanden;
    const B = calc - birth;
    if (A <= B) return 0;
    return cfg.rendement.yFactor / Math.sqrt((A - B) / 12);
  }

  const api = {
    maandIndex: maandIndex,
    maandLabel: maandLabel,
    toedeelfactor: toedeelfactor,
    delerVoor: delerVoor,
    simuleer: simuleer,
    uitkeringen: uitkeringen,
    uitkeringsreeks: uitkeringsreeks,
    scenarioMarge: scenarioMarge,
    nettoJaar: nettoJaar
  };

  global.PensioenEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
