/*
  Pensioenplanner: configuratie.
  Alle variabelen staan hier. Pas een waarde aan en laad de pagina opnieuw.
  Alle waarden zijn fictief. Bedragen in euro, percentages als getal (2,5% = 0.025)
  tenzij anders vermeld.
*/
window.PLANNER_CONFIG = {

  // Calculatiedatum: de maand waarop de projectie start (jjjj-mm). Altijd de eerste van de maand.
  calculatiedatum: "2026-11",

  // Demo-deelnemers. In de planner kiest u er één via de keuzelijst bovenaan. Die bepaalt de geboortedatum
  // (dd-mm-jjjj, alleen de maand telt mee), het startkapitaal en het salaris. Alle waarden zijn fictief.
  deelnemers: [
    { naam: "Deelnemer A", geboortedatum: "1990-07-01", startkapitaal: 80000,  brutoSalaris: 25000 },
    { naam: "Deelnemer B", geboortedatum: "1980-05-01", startkapitaal: 125000, brutoSalaris: 37500 },
    { naam: "Deelnemer C", geboortedatum: "1970-03-01", startkapitaal: 250000, brutoSalaris: 55000 },
    { naam: "Deelnemer D", geboortedatum: "1960-08-01", startkapitaal: 490000, brutoSalaris: 125000 }
  ],
  standaardDeelnemer: 0,   // index in deelnemers die bij het laden is geselecteerd
  deelnemer: null,         // wordt in de planner gezet op de gekozen deelnemer (kopie van deelnemers[i])

  // Stabiliteitsrendement (rentehedge), alleen voor de pagina bij- en afschrijvingen.
  // De grootste maandelijkse schok (fractie van het kapitaal) hangt af van de leeftijd van de deelnemer:
  // jong (leeftijdJong) krijgt maxSchokJong, oud (leeftijdOud) krijgt maxSchokOud, daartussen lineair.
  // Een schok ligt tussen ondergrensFractie x de maximale schok en de maximale schok zelf.
  stabiliteit: {
    maxSchokJong: 0.005,
    maxSchokOud: 0.05,
    leeftijdJong: 40,
    leeftijdOud: 65,
    ondergrensFractie: 0.2,
    // Waar de schok terechtkomt, afhankelijk van de leeftijd (lineair tussen jong en oud):
    // jong: renterisico niet afgedekt, de schok raakt vooral het verwachte pensioen;
    // oud: renteafdekking hoog, de schok raakt vooral het kapitaal.
    kapitaalAandeelJong: 0.2,  // fractie van de schok die in het kapitaal terechtkomt (jong)
    kapitaalAandeelOud: 1.0,   // fractie van de schok die in het kapitaal terechtkomt (oud)
    pensioenAandeelJong: 1.0,  // fractie van de schok die in het verwachte pensioen terechtkomt (jong)
    pensioenAandeelOud: 0.0    // fractie van de schok die in het verwachte pensioen terechtkomt (oud)
  },

  pensioenreglement: {
    premiepercentage: 0.20,           // 20% van het pensioengevend salaris
    franchise: 17500,                 // voltijd franchise per jaar (€), geïndexeerd met prijsinflatie
    maxPensioengevendSalaris: 137000, // voltijd maximum per jaar (€), geïndexeerd met loon-inflatie
    aowLeeftijdMaanden: 804,          // AOW-leeftijd in maanden (804 = 67 jaar)
    eindLeeftijd: 100,                // rekenkundige horizon van de uitkeringsreeks, jaren
    grafiekEindLeeftijd: 80,          // laatste leeftijd op de X-as van de uitkeringsgrafiek (jaren); na het uiterste einde van TOPHL (AOW + 10 jaar)
    standaardPensioenleeftijd: 65,    // startwaarde in de planner (jaren)
  },

  // Parttimepercentage van het voltijdssalaris, vanaf een maand. Gesorteerd op datum.
  // Leeg: standaard werkt de deelnemer voltijd (100%). Wijzigingen kiest de gebruiker zelf in de wizard.
  parttimepercentages: [],

  rendement: {
    overrendementNaRTS: 0.02,   // vast jaarlijks overrendement NA RTS-correctie
    loonInflatie: 0.025,        // loon-inflatie per jaar, geïndexeerd op 1 januari
    inflatiePrijs: 0.02,        // prijsinflatie per jaar, voor de reële bedragen
    yFactor: 0.2               // Y-factor voor de bandbreedte (pessimistisch / optimistisch)
  },

  // Toedeelschaal uit de rekensystematiek: tot leeftijdStart de factorVoor, daarna lineair naar factorNa op leeftijdEind.
  toedeelschaal: {
    leeftijdStart: 50,
    leeftijdEind: 67,
    factorVoor: 1.05,
    factorNa: 0.45
  },

  // Vereenvoudigde annuïteitsdelers (fictief): kapitaal gedeeld door deze factor = jaarlijks ouderdomspensioen.
  // Hoe hoger de leeftijd, hoe lager de deler.
  annuiteitsdelers: {
    40: 25.5, 41: 25.2, 42: 24.9, 43: 24.6, 44: 24.3, 45: 24.0, 46: 23.7, 47: 23.4,
    48: 23.1, 49: 22.8, 50: 22.5, 51: 22.2, 52: 21.9, 53: 21.6, 54: 21.3,
    55: 21.0, 56: 20.7, 57: 20.4, 58: 20.1, 59: 19.8, 60: 19.5,
    61: 19.2, 62: 18.9, 63: 18.6, 64: 18.3, 65: 18.0, 66: 17.7,
    67: 17.4, 68: 17.1, 69: 16.8, 70: 16.5
  },

  // AOW-uitkering (bruto per maand, fictief) om het pensioen 'inclusief AOW' te tonen.
  aowBrutoMaand: 1450,

  // Fictieve, vereenvoudigde belastingindicatie voor de netto weergave. Geen officiële tarieven.
  // schijven: tot welk jaarbedrag (€) welk tarief geldt. Het laatste bedrag is null (geen bovengrens).
  // heffingskorting: jaarbedrag (€) dat alleen meetelt als 'loonheffingskorting toepassen' aan staat.
  belasting: {
    schijven: [
      { tot: 38000, tarief: 0.37 },
      { tot: 76000, tarief: 0.38 },
      { tot: null, tarief: 0.495 }
    ],
    heffingskorting: 2900
  },

  // TOPAOW: extra pensioen vóór de AOW-leeftijd, gefinancierd uit eigen kapitaal. Maximum per jaar (€), niet geïndexeerd.
  // Bij deeltijd naar rato van de werkfractie. Het OP mag na uitruil niet onder de ondergrens (€ per jaar) komen.
  // inkoopfactor: kapitaal per euro per jaar (vast, ongeacht de looptijd tot de AOW).
  topaow: {
    maxPerJaar: 20000,
    ondergrensOP: 500,
    inkoopfactor: 5
  },

  // TOPHL: tijdelijk extra pensioen van de pensioendatum tot een eerste van de maand, gekozen door de deelnemer.
  // Standaard eindigt het op de AOW-leeftijd als de pensioendatum ervoor ligt. Anders kiest de deelnemer een einde
  // tot uiterlijk jarenNaAOW jaar na de AOW-leeftijd. Maximum: 33% van het levenslange OP na uitruil, zodat het
  // levenslange OP plus TOPHL niet hoger wordt dan 133% van het levenslange OP.
  // inkoopfactorPerJaar: kapitaal per euro per jaar TOPHL, per jaar looptijd. Hoe langer TOPHL loopt, hoe duurder het is:
  // inkoopfactor = inkoopfactorPerJaar x looptijd in jaren (van de pensioendatum tot het einde, in hele maanden / 12).
  // Vereenvoudigd: geen rente of sterfte.
  // Na het einde van TOPHL daalt het levenslange OP kapitaalneutraal met inkoopfactor x TOPHL / annuïteitsfactor.
  tophl: {
    maxPctOP: 0.33,
    inkoopfactorPerJaar: 1,
    jarenNaAOW: 10
  },

  // Partnerpensioen (NP): het percentage van het ouderdomspensioen (OP) vóór TOPAOW/TOPHL dat op de pensioendatum wordt ingekocht.
  // inkoopfactorNP: kapitaal per euro NP per jaar. Kapitaal = OP x annuïteitsfactor OP + NP x inkoopfactorNP.
  partnerpensioen: {
    minPct: 0,
    maxPct: 70,
    standaardPct: 70,
    inkoopfactorNP: 4
  }
};
