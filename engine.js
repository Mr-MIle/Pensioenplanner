/*
  Pensioenplanner: rekenkern. Bevat alleen rekenlogica, geen beeld.
  Bijschrijving per maand = kapitaal x ((1 + overrendement)^(1/12) - 1) x toedeelfactor van de leeftijd in die maand.
  Het overrendement (na RTS-correctie) = vast nominaal rendement - spotrate uit de RTS bij de looptijd tot het AOW-jaar
  (zie overrendement()). Het verschilt dus per deelnemer. Er is geen beschermingsrendement.
  Premie = (min(salaris, maximum) x loonindex - franchise x prijsindex) x parttimepercentage x premiepercentage / 12,
  bijgeschreven aan het eind van de maand. Die premie levert pas vanaf de volgende maand rendement op.
  Uitkering: ouderdomspensioen per jaar = kapitaal / inkoopfactor OP. TOPAOW (AOW-overbrugging) loopt tot de AOW-leeftijd.
  TOPHL loopt van de pensioendatum tot een gekozen eerste van de maand, uiterlijk 10 jaar na de AOW-leeftijd.
  Na het einde van TOPHL daalt het levenslange OP kapitaalneutraal. Hoe langer TOPHL loopt, hoe duurder het is.
*/
(function (global) {
  'use strict';

  const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function maandIndex(s) {
    const d = s.split('-').map(Number);
    return d[0] * 12 + (d[1] - 1);
  }

  // Korte maandnamen uit de gekozen taal (i18n/i18n.js) als die geladen is; anders Nederlands.
  function maandLabel(i) {
    const namen = global.I18N ? global.I18N.maanden() : MAANDEN;
    return namen[i % 12] + ' ' + Math.floor(i / 12);
  }

  function leeftijdLabel(m) {
    if (global.I18N) return global.I18N.t('kern.leeftijdTabel', { j: Math.floor(m / 12), m: m % 12 });
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

  // Inkoopfactor OP op een leeftijd in jaren, lineair geinterpoleerd.
  function inkoopfactorVoor(jaar, tabel) {
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
        deelJaar = onttrokken / inkoopfactorVoor(ageM / 12, cfg.inkoopfactorenOP);
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
        // Eind = kapitaal aan het einde van maand i (= begin van maand i + 1): reëel daarom over i + 1 - calc maanden,
        // zodat de laatste rij gelijk is aan kapitaal / inflIdx op de pensioendatum.
        reeel: S / Math.pow(1 + pi, (i + 1 - calc) / 12),
        defl: 1 / Math.pow(1 + pi, (i + 1 - calc) / 12),
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

  // Jaarlijkse uitkeringen met TOPAOW (AOW-overbrugging) en TOPHL.
  // Partnerpensioen (NP): percentage v van het ouderdomspensioen (OP) vóór uitruil. OP_voor = K / (aOP + v x inkoopfactorNP).
  // K_OP = OP_voor x aOP is het kapitaal dat voor het ouderdomspensioen overblijft.
  // TOPAOW (T1, €/jaar, alleen vóór de AOW-leeftijd): kost topaow.inkoopfactor x T1 kapitaal. OP_na = (K_OP - 5 x T1) / aOP.
  //   Maximum: min(topaow.maxPerJaar x werkfractie, (K_OP - ondergrensOP x aOP) / 5). De ondergrens geldt voor OP_na.
  // TOPHL (T2, €/jaar): loopt van de pensioendatum tot eindM (leeftijd in maanden, eerste van de maand).
  //   Standaard eindM = AOW-leeftijd als de pensioendatum ervoor ligt, anders uiterlijk 10 jaar na de AOW-leeftijd.
  //   Bereik eindM: van pensioendatum + 1 maand tot AOW-leeftijd + tophl.jarenNaAOW jaar.
  //   T2 = tophlPct x OP_na, begrensd op tophl.maxPctOP x OP_na (de hoogste uitkering = levenslang OP + TOPHL blijft onder 133%).
  //   Inkoopfactor TOPHL = tophl.inkoopfactorPerJaar x looptijd in jaren ((eindM - pensioendatum) / 12): langer is duurder.
  //   T2 kost inkoopfactor x T2 kapitaal. Na het einde van TOPHL daalt het levenslange OP met R = inkoopfactor x T2 / aOP (kapitaalneutraal).
  // Uitkering op een leeftijd (zie jaarlijkseUitkering): OP_na + T1 (vóór AOW) + T2 (vóór eindM) - R (vanaf eindM).
  // opt = { partnerPct, topaow (€/jaar), tophlPct (0-0,33 van OP na uitruil), tophlEindMaanden (leeftijd in maanden, optioneel), werkfractie (0-1, standaard 1) }.
  function uitkeringen(cfg, sim, opt, pensioenLeeftijdJaar) {
    const reg = cfg.pensioenreglement;
    const pp = cfg.partnerpensioen;
    const ta = cfg.topaow;
    const th = cfg.tophl;
    const aOP = inkoopfactorVoor(pensioenLeeftijdJaar, cfg.inkoopfactorenOP);
    const pct = opt.partnerPct !== undefined ? opt.partnerPct : pp.standaardPct;
    const v = Math.min(pp.maxPct, Math.max(pp.minPct, pct)) / 100;

    // Stap 1: OP vóór uitruil, en het NP daarover.
    const opVoor = sim.kapitaal / (aOP + v * pp.inkoopfactorNP);
    const partner = v * opVoor;
    const kOP = opVoor * aOP;

    // Stap 2: TOPAOW (AOW-overbrugging). Alleen als de pensioendatum vóór de AOW-leeftijd ligt.
    const aowM = reg.aowLeeftijdMaanden;
    const pensM = Math.round(pensioenLeeftijdJaar * 12);
    const nPre = Math.max(0, aowM - pensM);
    const voorAow = nPre > 0;
    const werkfractie = opt.werkfractie !== undefined ? opt.werkfractie : 1;
    const maxT1 = voorAow
      ? Math.max(0, Math.min(ta.maxPerJaar * werkfractie, (kOP - ta.ondergrensOP * aOP) / ta.inkoopfactor))
      : 0;
    const t1 = Math.min(maxT1, Math.max(0, opt.topaow || 0));
    const opNa = (kOP - ta.inkoopfactor * t1) / aOP;

    // Stap 3: TOPHL. Loopt van de pensioendatum tot een eerste van de maand, uiterlijk 10 jaar na de AOW-leeftijd.
    const eindMax = aowM + (th.jarenNaAOW || 10) * 12;
    const eindMin = pensM + 1;
    const tophlMogelijk = eindMin <= eindMax;
    const eindStandaard = voorAow ? aowM : eindMax;
    const gekozen = opt.tophlEindMaanden !== undefined && opt.tophlEindMaanden !== null ? opt.tophlEindMaanden : eindStandaard;
    const eindM = tophlMogelijk ? Math.min(eindMax, Math.max(eindMin, Math.round(gekozen))) : 0;
    // Looptijd in jaren bepaalt de inkoopfactor: hoe langer TOPHL loopt, hoe duurder.
    const looptijdHL = tophlMogelijk ? (eindM - pensM) / 12 : 0;
    const inkoopHL = th.inkoopfactorPerJaar * looptijdHL;
    const maxT2 = tophlMogelijk && inkoopHL > 0
      ? Math.max(0, Math.min(th.maxPctOP * opNa, (kOP - ta.inkoopfactor * t1) / inkoopHL))
      : 0;
    const pctHL = Math.min(th.maxPctOP, Math.max(0, opt.tophlPct || 0));
    const t2 = tophlMogelijk ? Math.min(maxT2, pctHL * opNa) : 0;
    const R = inkoopHL * t2 / aOP;
    const opPost = opNa - R;

    const u = {
      standaard: opVoor,
      opNa: opNa,
      pre: opNa + t1 + t2,
      post: opPost,
      partner: partner,
      t1: t1,
      t2: t2,
      R: R,
      looptijdHL: looptijdHL,
      inkoopHL: inkoopHL,
      aowM: aowM,
      eindM: eindM,
      eindMin: eindMin,
      eindMax: eindMax,
      eindStandaard: tophlMogelijk ? eindStandaard : 0,
      maxT1: maxT1,
      maxT2: maxT2,
      tophlMogelijk: tophlMogelijk,
      voorAow: voorAow,
      nPre: nPre
    };
    u.preReeel = u.pre / sim.inflIdx;
    u.postReeel = u.post / sim.inflIdx;
    u.partnerReeel = partner / sim.inflIdx;
    u.deelJaar = sim.deelJaar;
    u.deelReeel = sim.deelJaar / sim.inflIdx;
    return u;
  }

  // Jaarlijkse uitkering (levenslang OP + TOPAOW + TOPHL) op een leeftijd in maanden, vóór het deeltijdpensioen.
  function jaarlijkseUitkering(u, ageM) {
    return u.opNa
      + (ageM < u.aowM ? u.t1 : 0)
      + (ageM < u.eindM ? u.t2 : 0)
      - (ageM >= u.eindM ? u.R : 0);
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
        const jaarlijks = jaarlijkseUitkering(u, i - birth);
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
  // Spotrate bij een looptijd in jaren: buiten de tabel de kortste of langste looptijd, ertussen lineair
  // tussen de dichtstbijzijnde looptijden (ook als de tabel gaten heeft).
  function spotrate(looptijd, tabel) {
    const keys = Object.keys(tabel).map(Number).sort((a, b) => a - b);
    if (looptijd <= keys[0]) return tabel[keys[0]];
    if (looptijd >= keys[keys.length - 1]) return tabel[keys[keys.length - 1]];
    let i = 0;
    while (keys[i + 1] < looptijd) i++;
    const lo = keys[i], hi = keys[i + 1];
    return tabel[lo] + (tabel[hi] - tabel[lo]) * (looptijd - lo) / (hi - lo);
  }

  // Overrendement na RTS-correctie voor de deelnemer in cfg.deelnemer.
  // Looptijd = jaar waarin de AOW-leeftijd wordt bereikt - jaar van de calculatiedatum (hele jaren).
  // Spotrate uit cfg.rts.spotrates bij die looptijd; buiten de tabel de kortste of langste looptijd, ertussen lineair.
  function overrendement(cfg) {
    const calcJaar = Math.floor(maandIndex(cfg.calculatiedatum) / 12);
    const aowJaar = Math.floor((maandIndex(cfg.deelnemer.geboortedatum) + cfg.pensioenreglement.aowLeeftijdMaanden) / 12);
    const looptijd = aowJaar - calcJaar;
    const spot = spotrate(looptijd, cfg.rts.spotrates);
    const nominaal = cfg.rendement.nominaalRendement;
    return { aowJaar: aowJaar, calcJaar: calcJaar, looptijd: looptijd, spot: spot, nominaal: nominaal, rente: nominaal - spot };
  }

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
    inkoopfactorVoor: inkoopfactorVoor,
    simuleer: simuleer,
    uitkeringen: uitkeringen,
    jaarlijkseUitkering: jaarlijkseUitkering,
    uitkeringsreeks: uitkeringsreeks,
    overrendement: overrendement,
    scenarioMarge: scenarioMarge,
    nettoJaar: nettoJaar
  };

  global.PensioenEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
