# Pensioenplanner (proof of concept)

Statische website, geen build-stap nodig.

Bestanden:
- index.html: de pagina en de wizard
- config.js: alle variabelen (fictieve waarden)
- engine.js: de rekenkern

Deployen op Vercel: importeer deze map (of de repository waarin ze staan) als project,
kies framework "Other", laat build command en output directory leeg.

Talen (Nederlands, Engels, Deens) in de demo (index.html), pensioenpot per maand en de ontwerpvarianten (varianten/);
testspecialisten en config-bewerken blijven Nederlands:
- i18n/i18n.js: taalknop, vertaalfunctie en getal-, bedrag- en datumnotatie per taal
- i18n/nl.js is de bron; en.js en da.js hebben dezelfde sleutels
- een tekst wijzigen: eerst in nl.js, dan in en.js en da.js, en daarna
  `node i18n/i18n-check.js` (ontbrekend, ongebruikt, verouderd) en `node i18n/i18n-check.js --bijgewerkt`
- `?lang=en` of `?lang=da` in de link opent de pagina meteen in die taal; `?i18n=debug` toont [NL] bij ontbrekende vertalingen
