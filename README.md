# Pensioenplanner (proof of concept)

Statische website, geen build-stap nodig.

Bestanden:
- index.html: de pagina en de wizard
- config.js: alle variabelen (fictieve waarden)
- engine.js: de rekenkern

Deployen op Vercel: importeer deze map (of de repository waarin ze staan) als project,
kies framework "Other", laat build command en output directory leeg.

Rentetermijnstructuur (RTS), maandelijks automatisch:
- .github/workflows/rts-bijwerken.yml draait van de 1e tot de 12e van de maand en roept scripts/rts-bijwerken.js aan
- het script haalt de nominale RTS pensioenfondsen (zero coupon, DNB-tabel 1.3.1) op bij de DNB Statistics API,
  met de secrets DNB_PRIMARYKEY en DNB_SECONDARYKEY, en schrijft een nieuwe curve in het rts-blok van config.js
  (peildatum, bron, spotrates) en in rts/jjjj-mm.json; daarna rekentests, commit naar main, Vercel deployt
- het rts-blok blijft gewone configuratie: zichtbaar en aan te passen in config.js en config-bewerken.html.
  Een aanpassing in de browser vervalt zodra er een curve met een nieuwe peildatum is
- mislukt een controle (onvolledige curve, sprong van meer dan 100 basispunten, falende test), dan blijft de oude
  curve staan en stuurt GitHub een mail. Met de hand starten kan via Actions → RTS bijwerken → Run workflow,
  met de opties forceer (sprong toestaan) en proef (niets committen)
- lokaal: `DNB_PRIMARYKEY=... node scripts/rts-bijwerken.js`

Talen (Nederlands, Engels, Deens) in de demo (index.html), pensioenpot per maand en de ontwerpvarianten (varianten/);
testspecialisten en config-bewerken blijven Nederlands:
- i18n/i18n.js: taalknop, vertaalfunctie en getal-, bedrag- en datumnotatie per taal
- i18n/nl.js is de bron; en.js en da.js hebben dezelfde sleutels
- een tekst wijzigen: eerst in nl.js, dan in en.js en da.js, en daarna
  `node i18n/i18n-check.js` (ontbrekend, ongebruikt, verouderd) en `node i18n/i18n-check.js --bijgewerkt`
- `?lang=en` of `?lang=da` in de link opent de pagina meteen in die taal; `?i18n=debug` toont [NL] bij ontbrekende vertalingen
