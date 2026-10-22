/*
  Pensioenplanner: gedeelde koppeling voor de ontwerpvarianten (Fonds A, B en C).
  Volgt hetzelfde rekenpad als render() in ../index.html, zodat de bedragen in de varianten
  gelijk zijn aan die van de klassieke planner. Deeltijdpensioen en werkwijzigingen zitten
  niet in de varianten; het parttimeschema uit config.js telt wel mee, net als in de demo.
  Laad na ../config.js, ../config-overlay.js en ../engine.js.
*/
(function (global) {
  'use strict';
  var C = global.PLANNER_CONFIG;
  var E = global.PensioenEngine;

  var eur0 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  var AOW_M = C.pensioenreglement.aowLeeftijdMaanden;
  var AOW_JAREN = AOW_M / 12;
  var CALC = E.maandIndex(C.calculatiedatum);

  function leeftijdTekst(m) {
    var j = Math.floor(m / 12), r = m % 12;
    return j + ' jaar' + (r ? ' en ' + r + (r === 1 ? ' maand' : ' maanden') : '');
  }
  var AOW_LABEL = leeftijdTekst(AOW_M);

  // Deelnemer i uit config.js, met leeftijd op de calculatiedatum.
  function deelnemer(i) {
    var d = C.deelnemers[i];
    var maanden = CALC - E.maandIndex(d.geboortedatum);
    return { index: i, naam: d.naam, geboortedatum: d.geboortedatum, startkapitaal: d.startkapitaal,
      brutoSalaris: d.brutoSalaris, leeftijdMaanden: maanden, leeftijdJaar: Math.floor(maanden / 12) };
  }

  // Stopleeftijden die na de calculatiedatum liggen (zelfde regel als de keuzelijst in de demo).
  function leeftijden(i) {
    var birth = E.maandIndex(C.deelnemers[i].geboortedatum);
    var uit = [];
    for (var j = 60; j <= 70; j++) if (birth + j * 12 > CALC) uit.push(j);
    return uit;
  }

  function parttimeLijst() {
    return C.parttimepercentages.map(function (r) { return { vanaf: r.vanaf, percentage: r.percentage }; });
  }

  /*
    k = {
      deelnemer: index in C.deelnemers,
      start: 'aow' | 'ander', leeftijd: jaren (bij 'ander'),
      partnerPct: 0-70,
      topaow: euro per jaar, of 'max',
      tophlPct: 0-33 (procent van het OP na uitruil),
      tophlEind: leeftijd in maanden, of null voor de standaard,
      basis: 'netto' | 'bruto', lhk: loonheffingskorting (standaard aan)
    }
  */
  function bereken(k) {
    C.deelnemer = Object.assign({}, C.deelnemers[k.deelnemer]);
    var birth = E.maandIndex(C.deelnemer.geboortedatum);
    var jaar = k.start === 'aow' ? AOW_JAREN : Number(k.leeftijd);
    var pensM = Math.round(jaar * 12);
    var pensIdx = birth + pensM;
    var voorAow = pensM < AOW_M;
    var partnerPct = k.partnerPct === undefined ? C.partnerpensioen.standaardPct : Number(k.partnerPct);
    var rente = C.rendement.overrendementNaRTS;
    var sk = C.deelnemer.startkapitaal;
    var sim = E.simuleer(C, { pensioenLeeftijdMaanden: pensM, rente: rente, deeltijd: null, parttimepercentages: parttimeLijst(), startkapitaal: sk });

    var eindMaxM = AOW_M + C.tophl.jarenNaAOW * 12;
    var eindMinM = pensM + 1;
    var tophlMogelijk = eindMinM <= eindMaxM;
    var eindStdM = voorAow ? AOW_M : eindMaxM;
    var werkfractie = sim.rows.length ? sim.rows[sim.rows.length - 1].werk : 1;

    // AOW-overbrugging: op het (afgeronde) maximum gebruikt de rekenkern het exacte maximum, net als de schuif in de demo.
    var maxT1 = E.uitkeringen(C, sim, { partnerPct: partnerPct, topaow: Infinity, werkfractie: werkfractie }, jaar).maxT1;
    var maxHeel = Math.floor(maxT1);
    var gevraagd = k.topaow === 'max' ? maxHeel : Math.max(0, Number(k.topaow) || 0);
    var sl1 = Math.min(gevraagd, maxHeel);
    var topT1 = maxHeel > 0 && sl1 >= maxHeel ? maxT1 : sl1;

    var pctHL = tophlMogelijk ? Math.max(0, Number(k.tophlPct) || 0) / 100 : 0;
    var eindKeuze = null;
    if (tophlMogelijk) {
      var e = k.tophlEind === null || k.tophlEind === undefined ? eindStdM : Number(k.tophlEind);
      eindKeuze = Math.min(eindMaxM, Math.max(eindMinM, e));
    }
    var u = E.uitkeringen(C, sim, { partnerPct: partnerPct, topaow: topT1, tophlPct: pctHL, tophlEindMaanden: eindKeuze, werkfractie: werkfractie }, jaar);

    var basis = k.basis || 'netto';
    var lhk = k.lhk === undefined ? true : !!k.lhk;
    function maand(jaarBruto) {
      return basis === 'netto' ? E.nettoJaar(C, jaarBruto, lhk) / 12 : jaarBruto / 12;
    }

    var aowJaar = C.aowBrutoMaand * 12;
    var bedragAow = E.jaarlijkseUitkering(u, AOW_M);
    var bedragNa = voorAow ? bedragAow : u.post;
    var tussenJaar = u.t2 > 0 && voorAow && eindKeuze < AOW_M ? E.jaarlijkseUitkering(u, eindKeuze) : null;
    var aOP = E.delerVoor(jaar, C.annuiteitsdelers);

    return {
      k: k, C: C, deelnemer: deelnemer(k.deelnemer), birth: birth, jaar: jaar, pensM: pensM, pensIdx: pensIdx,
      voorAow: voorAow, partnerPct: partnerPct, sim: sim, u: u, basis: basis, lhk: lhk,
      maxT1: maxHeel, tophlMogelijk: tophlMogelijk, eindMinM: eindMinM, eindMaxM: eindMaxM, eindStdM: eindStdM,
      eindKeuze: eindKeuze, pctHL: pctHL, aOP: aOP,
      // Bedragen per maand in de gekozen basis, zoals in het resultaatpaneel van de demo.
      maand: maand,
      eerst: maand(u.pre),                        // vanaf de pensioendatum
      opNa: maand(u.opNa),                        // levenslang OP vóór het einde van TOPHL
      t1: maand(u.t1),
      t2: maand(u.t2),
      later: maand(bedragNa),                     // levenslang, na de fase met TOPAOW en TOPHL
      laterInclAow: maand(bedragNa + aowJaar),
      tussen: tussenJaar === null ? null : maand(tussenJaar),
      partner: maand(u.partner),
      kapitaal: sim.kapitaal,
      // Kapitaalverdeling op de pensioendatum (som = kapitaal).
      verdeling: {
        partner: u.partner * C.partnerpensioen.inkoopfactorNP,
        topaow: C.topaow.inkoopfactor * u.t1,
        tophl: u.inkoopHL * u.t2,
        levenslang: u.post * aOP
      },
      tekst: {
        pensioendatum: E.maandLabel(pensIdx),
        stop: k.start === 'aow' ? 'op de AOW-leeftijd (' + AOW_LABEL + ')' : 'op ' + jaar + ' jaar',
        tophlEind: u.t2 > 0 ? E.maandLabel(birth + eindKeuze) + ', op ' + leeftijdTekst(eindKeuze) : ''
      }
    };
  }

  // Gemiddeld maandbedrag per levensjaar (werk, OP, TOPAOW, TOPHL, AOW), netto via dezelfde tabel als de demo.
  // Zelfde opbouw als jaarSerie() in de demo, zonder deeltijdpensioen.
  function jaarSerie(r) {
    var j0 = Math.floor(CALC / 12);
    var eindIdx = r.birth + C.pensioenreglement.grafiekEindLeeftijd * 12;
    var aowIdx = r.birth + AOW_M;
    var li = C.rendement.loonInflatie;
    var salaris = C.deelnemers[r.k.deelnemer].brutoSalaris;
    var rowMap = {};
    r.sim.rows.forEach(function (row, i) { rowMap[CALC + i] = row; });
    var jaren = {};
    for (var i = CALC; i < eindIdx; i++) {
      var leeftijd = Math.floor((i - r.birth) / 12);
      var g = jaren[leeftijd] || (jaren[leeftijd] = { w: 0, op: 0, t1: 0, t2: 0, a: 0, n: 0 });
      var row = rowMap[i];
      if (i < r.pensIdx && row) g.w += salaris * Math.pow(1 + li, Math.floor(i / 12) - j0) / 12 * row.werk;
      if (i >= r.pensIdx) {
        var ageM = i - r.birth;
        var t1m = ageM < r.u.aowM ? r.u.t1 : 0;
        var t2m = ageM < r.u.eindM ? r.u.t2 : 0;
        g.t1 += t1m / 12;
        g.t2 += t2m / 12;
        g.op += (E.jaarlijkseUitkering(r.u, ageM) - t1m - t2m) / 12;
      }
      if (i >= aowIdx) g.a += C.aowBrutoMaand;
      g.n++;
    }
    return Object.keys(jaren).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
      var g = jaren[k];
      var w = g.w / g.n, op = g.op / g.n, t1 = g.t1 / g.n, t2 = g.t2 / g.n, a = g.a / g.n;
      var bruto = w + op + t1 + t2 + a;
      var f = r.basis === 'netto' ? (bruto > 0 ? E.nettoJaar(C, bruto * 12, r.lhk) / 12 / bruto : 0) : 1;
      return { leeftijd: k, w: w * f, op: op * f, t1: t1 * f, t2: t2 * f, a: a * f, totaal: bruto * f };
    });
  }

  global.VariantKern = {
    C: C, E: E, eur: function (v) { return eur0.format(Math.round(v)); },
    AOW_M: AOW_M, AOW_JAREN: AOW_JAREN, AOW_LABEL: AOW_LABEL,
    leeftijdTekst: leeftijdTekst, deelnemer: deelnemer, leeftijden: leeftijden,
    bereken: bereken, jaarSerie: jaarSerie
  };
})(window);
