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
    peildatum: "2026-10-31",
    bron: "DNB Statistics API, tabel 1.3.1 nominale rentetermijnstructuur pensioenfondsen (zero coupon), release 03-11-26",
    spotrates: {
      1: 0.03236, 2: 0.03363, 3: 0.03386, 4: 0.03388, 5: 0.03384, 6: 0.03388, 7: 0.03396, 8: 0.0341, 9: 0.03428, 10: 0.03446,
      11: 0.03464, 12: 0.0348, 13: 0.03489, 14: 0.03496, 15: 0.03503, 16: 0.0349, 17: 0.0348, 18: 0.0347, 19: 0.03461, 20: 0.03454,
      21: 0.03426, 22: 0.034, 23: 0.03377, 24: 0.03355, 25: 0.03336, 26: 0.03307, 27: 0.0328, 28: 0.03254, 29: 0.03231, 30: 0.03209,
      31: 0.03175, 32: 0.03142, 33: 0.03112, 34: 0.03083, 35: 0.03056, 36: 0.03031, 37: 0.03006, 38: 0.02984, 39: 0.02962, 40: 0.02941,
      41: 0.0291, 42: 0.02879, 43: 0.02851, 44: 0.02823, 45: 0.02797, 46: 0.02772, 47: 0.02748, 48: 0.02725, 49: 0.02703, 50: 0.02681,
      51: 0.02666, 52: 0.02651, 53: 0.02637, 54: 0.02623, 55: 0.0261, 56: 0.02597, 57: 0.02584, 58: 0.02573, 59: 0.02561, 60: 0.0255,
      61: 0.02539, 62: 0.02529, 63: 0.02519, 64: 0.02509, 65: 0.02499, 66: 0.0249, 67: 0.02481, 68: 0.02473, 69: 0.02464, 70: 0.02456,
      71: 0.02448, 72: 0.0244, 73: 0.02433, 74: 0.02426, 75: 0.02418, 76: 0.02412, 77: 0.02405, 78: 0.02398, 79: 0.02392, 80: 0.02386,
      81: 0.0238, 82: 0.02374, 83: 0.02368, 84: 0.02362, 85: 0.02357, 86: 0.02351, 87: 0.02346, 88: 0.02341, 89: 0.02336, 90: 0.02331,
      91: 0.02326, 92: 0.02321, 93: 0.02317, 94: 0.02312, 95: 0.02308, 96: 0.02304, 97: 0.02299, 98: 0.02295, 99: 0.02291, 100: 0.02287
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

  // Inkoopfactoren OP op de rekendatum (X%-projectie 21.1.10, fictief): kapitaal per euro ouderdomspensioen per jaar,
  // naar de leeftijd van de deelnemer op de rekendatum, voor pensioen op de AOW-leeftijd (uitgestelde factor).
  // Hoe jonger, hoe lager: het kapitaal groeit in de planner alleen met het overrendement, de rente zit in deze factor.
  // Waarden: inkoopfactor bij ingang op 67 jaar (17,4) x (1 + spotrate RTS)^-looptijd, zonder sterfte.
  inkoopfactorenOP: {
    20: 4.40, 21: 4.48, 22: 4.56, 23: 4.64, 24: 4.72, 25: 4.80, 26: 4.88, 27: 4.96, 28: 5.08, 29: 5.20,
    30: 5.32, 31: 5.45, 32: 5.58, 33: 5.71, 34: 5.85, 35: 5.99, 36: 6.13, 37: 6.27, 38: 6.45, 39: 6.63,
    40: 6.81, 41: 7.00, 42: 7.20, 43: 7.42, 44: 7.65, 45: 7.89, 46: 8.14, 47: 8.39, 48: 8.69, 49: 9.00,
    50: 9.32, 51: 9.65, 52: 10.00, 53: 10.38, 54: 10.79, 55: 11.21, 56: 11.65, 57: 12.11, 58: 12.58, 59: 13.07,
    60: 13.56, 61: 14.07, 62: 14.58, 63: 15.11, 64: 15.66, 65: 16.23, 66: 16.83, 67: 17.40
  },

  // Inkoopfactoren bij ingang (fictief), naar de pensioenleeftijd. Alleen de verhouding telt: stopt de deelnemer op een
  // andere leeftijd dan de AOW-leeftijd, dan is de inkoopfactor OP = factor op de rekendatum x ingang(pensioenleeftijd)
  // / ingang(AOW-leeftijd). Eerder stoppen is zo duurder per euro pensioen.
  inkoopfactorenIngang: {
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
