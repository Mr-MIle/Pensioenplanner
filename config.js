/*
  Pensioenplanner: configuratie.
  Alle variabelen staan hier. Pas een waarde aan en laad de pagina opnieuw.
  Alle waarden zijn fictief. Bedragen in euro, percentages als getal (2,5% = 0.025)
  tenzij anders vermeld.
*/
window.PLANNER_CONFIG = {

  // Calculatiedatum (rekendatum): de maand waarop de projectie start (jjjj-mm). Altijd de eerste van de maand.
  // Volgt uit de kalenderdatum: op of na de 15e de eerste van deze maand, vóór de 15e de eerste van de vorige maand.
  calculatiedatum: (function (nu) {
    var j = nu.getFullYear(), m = nu.getMonth() + 1;
    if (nu.getDate() < 15) { m--; if (m === 0) { m = 12; j--; } }
    return j + '-' + (m < 10 ? '0' : '') + m;
  })(new Date()),

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

  // Overrendement na RTS = nominaalRendement - spotrate uit de RTS (zie rts hieronder). Verschilt per deelnemer.
  rendement: {
    nominaalRendement: 0.052,   // vast nominaal overrendement per jaar, voor iedereen gelijk (vóór RTS-correctie)
    loonInflatie: 0.025,        // loon-inflatie per jaar, geïndexeerd op 1 januari
    inflatiePrijs: 0.02,        // prijsinflatie per jaar, voor de reële bedragen
    yFactor: 0.2               // Y-factor voor de bandbreedte (pessimistisch / optimistisch)
  },

  // Rentetermijnstructuur (RTS): spotrates per looptijd in jaren, als fractie (3,368% = 0.03368).
  // Looptijd = jaar waarin de deelnemer de AOW-leeftijd bereikt minus het jaar van de calculatiedatum.
  // Een looptijd buiten de tabel krijgt de spotrate van de kortste of langste looptijd; tussen twee looptijden wordt lineair geïnterpoleerd.
  rts: {
    peildatum: "2026-09-30",
    bron: "DNB, nominale rentetermijnstructuur pensioenfondsen (zero coupon), bestand (22-10-26)",
    spotrates: {
      1: 0.03368, 2: 0.03535, 3: 0.03571, 4: 0.03588, 5: 0.03598, 6: 0.03607, 7: 0.03625, 8: 0.03645, 9: 0.03672, 10: 0.03693,
      11: 0.03715, 12: 0.03733, 13: 0.03745, 14: 0.03756, 15: 0.03765, 16: 0.03752, 17: 0.0374, 18: 0.0373, 19: 0.03721, 20: 0.03713,
      21: 0.03685, 22: 0.03659, 23: 0.03636, 24: 0.03614, 25: 0.03594, 26: 0.03563, 27: 0.03535, 28: 0.03508, 29: 0.03483, 30: 0.0346,
      31: 0.03424, 32: 0.03391, 33: 0.0336, 34: 0.03331, 35: 0.03303, 36: 0.03277, 37: 0.03252, 38: 0.03229, 39: 0.03207, 40: 0.03186,
      41: 0.0315, 42: 0.03116, 43: 0.03083, 44: 0.03052, 45: 0.03022, 46: 0.02994, 47: 0.02967, 48: 0.02941, 49: 0.02916, 50: 0.02892,
      51: 0.02875, 52: 0.02859, 53: 0.02844, 54: 0.02829, 55: 0.02815, 56: 0.02801, 57: 0.02788, 58: 0.02775, 59: 0.02763, 60: 0.02751,
      61: 0.02739, 62: 0.02728, 63: 0.02717, 64: 0.02706, 65: 0.02696, 66: 0.02686, 67: 0.02677, 68: 0.02667, 69: 0.02658, 70: 0.0265,
      71: 0.02641, 72: 0.02633, 73: 0.02625, 74: 0.02617, 75: 0.02609, 76: 0.02602, 77: 0.02595, 78: 0.02588, 79: 0.02581, 80: 0.02574,
      81: 0.02567, 82: 0.02561, 83: 0.02555, 84: 0.02549, 85: 0.02543, 86: 0.02537, 87: 0.02531, 88: 0.02526, 89: 0.0252, 90: 0.02515,
      91: 0.0251, 92: 0.02505, 93: 0.025, 94: 0.02495, 95: 0.0249, 96: 0.02486, 97: 0.02481, 98: 0.02477, 99: 0.02472, 100: 0.02468
    }
  },

  // SCR (Spreading Capital Ratio, X%-projectie 21.1.5): de dekkingsgraad van het collectief in de uitkeringsfase.
  // De uitkering op de pensioendatum wordt door de SCR van dat moment gedeeld. Per maand groeit de SCR met het
  // overrendement na RTS maal de toedeelfactor op leeftijdToedeling (jaar). Elke 1 januari wordt het verschil met 1
  // over spreidingsperiode jaar verdeeld: aanpassing = (SCR - 1) / spreidingsperiode, SCR = SCR / (1 + aanpassing).
  // Geen boven- of ondergrens (zoals de specificatie). Zonder dit blok rekent de planner met SCR 1.
  scr: {
    startwaarde: 1.00,        // SCR van het fonds op de rekendatum (fictief)
    spreidingsperiode: 3,     // jaren, tussen 1 en 10
    leeftijdToedeling: 80     // de toedeelfactor van deze leeftijd geldt voor het hele collectief
  },

  // Toedeelschaal uit de rekensystematiek: tot leeftijdStart de factorVoor, daarna lineair naar factorNa op leeftijdEind.
  toedeelschaal: {
    leeftijdStart: 50,
    leeftijdEind: 67,
    factorVoor: 1.05,
    factorNa: 0.45
  },

  // Inkoopfactoren OP (vereenvoudigd, fictief): kapitaal per euro ouderdomspensioen per jaar. Kapitaal / inkoopfactor = jaarlijks OP.
  // Hoe hoger de leeftijd, hoe lager de inkoopfactor.
  inkoopfactorenOP: {
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
  // Na het einde van TOPHL daalt het levenslange OP kapitaalneutraal met inkoopfactor x TOPHL / inkoopfactor OP.
  tophl: {
    maxPctOP: 0.33,
    inkoopfactorPerJaar: 1,
    jarenNaAOW: 10
  },

  // Partnerpensioen (NP): het percentage van het ouderdomspensioen (OP) vóór TOPAOW/TOPHL dat op de pensioendatum wordt ingekocht.
  // inkoopfactorNP: kapitaal per euro NP per jaar. Kapitaal = OP x inkoopfactor OP + NP x inkoopfactorNP.
  partnerpensioen: {
    minPct: 0,
    maxPct: 70,
    standaardPct: 70,
    inkoopfactorNP: 4
  }
};
