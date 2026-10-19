/*
  Pensioenplanner: rekenkern. Bevat alleen rekenlogica, geen beeld.
  Bijschrijving per maand = kapitaal x ((1 + overrendement)^(1/12) - 1) x toedeelfactor van de leeftijd in die maand.
  Het overrendement is het vaste rendement NA RTS-correctie. Er is geen beschermingsrendement.
  Premie = (min(salaris, maximum) x loonindex - franchise x prijsindex) x parttimepercentage x premiepercentage / 12,
  bijgeschreven aan het eind van de maand. Die premie levert pas vanaf de volgende maand rendement op.
  Uitkering: ouderdomspensioen per jaar = kapitaal / annuiteitsdeler. Met TOPAOW en TOPHL wordt het
  bedrag vóór de AOW-leeftijd verhoogd; na de AOW-leeftijd daalt het OP bij TOPHL kapitaalneutraal.
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

  // Parttimepercentage (0-1) in een maand. De lijst moet op datum gesorteerd zijn.
  function parttimePctVoor(i, lijst) {
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
    // Parttimepercentages: uit de wizard (o.parttimepercentages) of uit de configuratie. Gesorteerd op datum.
    const lijst = (o.parttimepercentages || cfg.parttimepercentages).slice().sort(function (a, b) { return maandIndex(a.vanaf) - maandIndex(b.vanaf); });

    const deel = o.deeltijd;
    let S = o.startkapitaal !== undefined ? o.startkapitaal : cfg.deelnemer.startkapitaal;
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

      // Premie over het pensioengevend salaris, pro rata met het parttimepercentage.
      // Tijdens deeltijdpensioen daalt de premiebasis evenredig: parttimepercentage x (1 - deelpercentage).
      const deelPct = deel && i >= deel.idx ? deel.pct : 0;
      const schema = parttimePctVoor(i, lijst);
      const vorigSchema = parttimePctVoor(i - 1, lijst);
      const werk = Math.max(0, schema * (1 - deelPct));
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
        defl: 1 / Math.pow(1 + pi, (i - calc) / 12),
        werk: werk,
        schema: schema,
        wijziging: schema !== vorigSchema,
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

  // Jaarlijkse uitkeringen met TOPAOW en TOPHL.
  // Partnerpensioen (NP): percentage v van het ouderdomspensioen (OP) vóór uitruil. OP_voor = K / (aOP + v x inkoopfactorNP).
  // K_OP = OP_voor x aOP is het kapitaal dat voor het ouderdomspensioen overblijft.
  // TOPAOW (T1, €/jaar, alleen tot de AOW-leeftijd): kost topaow.inkoopfactor x T1 kapitaal. OP_na = (K_OP - 5 x T1) / aOP.
  //   Maximum: min(topaow.maxPerJaar x werkfractie, (K_OP - ondergrensOP x aOP) / 5). De ondergrens geldt voor OP_na.
  // TOPHL (T2, €/jaar, alleen tot de AOW-leeftijd): alleen als T1 op het maximum staat.
  //   T2 = tophlPct x OP_na, begrensd op min(tophl.maxPctOP x OP_na, (K_OP - 5 x T1) / 5). Kost 5 x T2 kapitaal.
  //   Kapitaalneutraal: het OP na de AOW-leeftijd daalt met 5 x T2 / aOP.
  // Uitkering vóór de AOW-leeftijd: pre = OP_na + T1 + T2. Vanaf de AOW-leeftijd: post = OP_na - 5 x T2 / aOP.
  // opt = { partnerPct, topaow (€/jaar), tophlPct (0-0,33 van OP na uitruil), werkfractie (0-1, standaard 1) }.
  function uitkeringen(cfg, sim, opt, pensioenLeeftijdJaar) {
    const reg = cfg.pensioenreglement;
    const pp = cfg.partnerpensioen;
    const ta = cfg.topaow;
    const th = cfg.tophl;
    const aOP = delerVoor(pensioenLeeftijdJaar, cfg.annuiteitsdelers);
    const pct = opt.partnerPct !== undefined ? opt.partnerPct : pp.standaardPct;
    const v = Math.min(pp.maxPct, Math.max(pp.minPct, pct)) / 100;

    // Stap 1: OP vóór uitruil, en het NP daarover.
    const opVoor = sim.kapitaal / (aOP + v * pp.inkoopfactorNP);
    const partner = v * opVoor;
    const kOP = opVoor * aOP;

    // Stap 2: TOPAOW. Alleen als de pensioendatum vóór de AOW-leeftijd ligt.
    const nPre = Math.max(0, reg.aowLeeftijdMaanden - pensioenLeeftijdJaar * 12);
    const voorAOW = nPre > 0;
    const werkfractie = opt.werkfractie !== undefined ? opt.werkfractie : 1;
    const maxT1 = voorAOW
      ? Math.max(0, Math.min(ta.maxPerJaar * werkfractie, (kOP - ta.ondergrensOP * aOP) / ta.inkoopfactor))
      : 0;
    const t1 = Math.min(maxT1, Math.max(0, opt.topaow || 0));
    const opNa = (kOP - ta.inkoopfactor * t1) / aOP;

    // Stap 3: TOPHL. Alleen als TOPAOW op het maximum staat.
    const tophlMogelijk = voorAOW && maxT1 > 0 && t1 >= maxT1 - 1e-9;
    const maxT2 = tophlMogelijk
      ? Math.max(0, Math.min(th.maxPctOP * opNa, (kOP - th.inkoopfactor * t1) / th.inkoopfactor))
      : 0;
    const pctHL = Math.min(th.maxPctOP, Math.max(0, opt.tophlPct || 0));
    const t2 = tophlMogelijk ? Math.min(maxT2, pctHL * opNa) : 0;
    const opPost = opNa - th.inkoopfactor * t2 / aOP;

    const pre = opNa + t1 + t2;
    const post = opPost;

    return {
      standaard: opVoor,
      opNa: opNa,
      pre: pre,
      post: post,
      partner: partner,
      t1: t1,
      t2: t2,
      maxT1: maxT1,
      maxT2: maxT2,
      tophlMogelijk: tophlMogelijk,
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
  // Maandelijkse uitkeringsreeks, van de start van het deeltijdpensioen (of de pensioendatum) tot de eindleeftijd.
  // Vóór de pensioendatum: alleen het deeltijdpensioen (null = geen waarde). Vanaf de pensioendatum: volledig pensioen.
  function uitkeringsreeks(cfg, sim, u, pensioenLeeftijdJaar, deel) {
    const birth = maandIndex(cfg.deelnemer.geboortedatum);
    const calc = maandIndex(cfg.calculatiedatum);
    const reg = cfg.pensioenreglement;
    const pi = cfg.rendement.inflatiePrijs;
    const pensIdx = birth + Math.round(pensioenLeeftijdJaar * 12);
    const start = deel ? Math.min(deel.idx, pensIdx) : pensIdx;
    const eind = birth + reg.eindLeeftijd * 12;
    const aowIdx = birth + reg.aowLeeftijdMaanden;
    const punten = [];

    for (let i = start; i < eind; i++) {
      const index = Math.pow(1 + pi, (i - calc) / 12);
      if (i < pensIdx) {
        // Deeltijdfase: het deeltijdpensioen, verder niets.
        const nominaal = deel && i >= deel.idx ? sim.deelJaar / 12 : null;
        punten.push({
          leeftijd: (i - birth) / 12,
          maand: maandLabel(i),
          nominaal: nominaal,
          reeel: nominaal === null ? null : nominaal / index,
          standaard: null,
          fase: 'deeltijd'
        });
      } else {
        const jaarlijks = i < aowIdx ? u.pre : u.post;
        const nominaal = jaarlijks / 12 + (deel ? sim.deelJaar / 12 : 0);
        punten.push({
          leeftijd: (i - birth) / 12,
          maand: maandLabel(i),
          nominaal: nominaal,
          reeel: nominaal / index,
          standaard: u.standaard / 12,
          fase: 'volledig'
        });
      }
    }

    return {
      punten: punten,
      aowIdx: aowIdx,
      startIdx: start,
      pensIdx: pensIdx,
      eindIdx: eind,
      aowLeeftijd: reg.aowLeeftijdMaanden / 12,
      deelLeeftijd: deel ? (deel.idx - birth) / 12 : null,
      pensLeeftijd: pensIdx / 12 - birth / 12
    };
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
