/*
  Pensioenplanner: talen (Nederlands, Engels, Deens).
  Nederlands is de bron: elke tekst staat eerst in i18n/nl.js, met dezelfde sleutel in en.js en da.js.
  Ontbreekt een vertaling, dan valt de tekst terug op het Nederlands (met ?i18n=debug zichtbaar als [NL]).
  Controle op ontbrekende, ongebruikte en verouderde vertalingen: node i18n/i18n-check.js.

  Gebruik:
    - vaste HTML: data-i18n="sleutel" (vult de inhoud, kleine opmaak mag) en
      data-i18n-attr="aria-label:sleutel;title:sleutel2" voor attributen;
    - JavaScript: I18N.t('sleutel', { bedrag: ... }); een tekst als [enkelvoud, meervoud] kiest op vars.n;
    - opmaak: I18N.getal(), I18N.eur(), I18N.datum('2026-10-01'), I18N.maanden();
    - taalknop: een leeg element met data-taalknop; I18N.opWissel(fn) tekent de pagina opnieuw na een wissel.
  Laad i18n.js vóór nl.js, en.js en da.js, en die vóór de scripts van de pagina.
*/
(function (global) {
  'use strict';

  var TALEN = {
    nl: { naam: 'Nederlands', kort: 'NL', locale: 'nl-NL' },
    en: { naam: 'English', kort: 'EN', locale: 'en-GB' },
    da: { naam: 'Dansk', kort: 'DA', locale: 'da-DK' }
  };
  var BRON = 'nl';
  var KEY = 'pensioenplanner.taal';
  var woorden = { nl: {}, en: {}, da: {} };
  var luisteraars = [];

  var zoek = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
  var debug = zoek.get('i18n') === 'debug';

  function bewaard() {
    try { return global.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function bewaar(t) {
    try { global.localStorage.setItem(KEY, t); } catch (e) { /* geen opslag: alleen deze pagina */ }
  }

  // Taal uit ?lang=, anders de vorige keuze, anders Nederlands.
  var taal = (function () {
    var q = (zoek.get('lang') || '').toLowerCase();
    if (TALEN[q]) { bewaar(q); return q; }
    var b = bewaard();
    return TALEN[b] ? b : BRON;
  })();

  function voeg(t, obj) { Object.assign(woorden[t], obj); }

  function kies(waarde, vars) {
    if (Array.isArray(waarde)) return vars && vars.n === 1 ? waarde[0] : waarde[1];
    return waarde;
  }
  function vul(tekst, vars) {
    if (!vars) return tekst;
    return tekst.replace(/\{(\w+)\}/g, function (m, k) { return k in vars ? vars[k] : m; });
  }

  // Tekst bij een sleutel in de gekozen taal, met {plekken} ingevuld.
  function t(sleutel, vars) {
    var w = woorden[taal][sleutel];
    var terug = false;
    if (w === undefined) { w = woorden[BRON][sleutel]; terug = taal !== BRON; }
    if (w === undefined) return debug ? '[?' + sleutel + ']' : sleutel;
    var uit = vul(kies(w, vars), vars);
    return terug && debug ? '[NL] ' + uit : uit;
  }
  function heeft(sleutel) { return woorden[BRON][sleutel] !== undefined; }

  // Getalnotatie per taal (nl-NL: 1.234,5 · en-GB: 1,234.5 · da-DK: 1.234,5). De valuta blijft de euro.
  var cache = {};
  function fmt(opties) {
    var k = taal + JSON.stringify(opties);
    return cache[k] || (cache[k] = new Intl.NumberFormat(TALEN[taal].locale, opties));
  }
  function getal(v, min, max) {
    return fmt({ minimumFractionDigits: min || 0, maximumFractionDigits: max === undefined ? (min || 0) : max }).format(v);
  }
  function eur(v, decimalen) {
    var d = decimalen || 0;
    return fmt({ style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d }).format(d ? v : Math.round(v));
  }
  // Datum 'jjjj-mm-dd' (of 'jjjj-mm', dan de eerste) als 01-10-2026, 01/10/2026 of 01.10.2026.
  function datum(iso) {
    var d = iso.split('-').map(Number);
    var dt = new Date(Date.UTC(d[0], d[1] - 1, d[2] || 1));
    return new Intl.DateTimeFormat(TALEN[taal].locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(dt);
  }
  function maanden() {
    var m = woorden[taal]['gemeen.maanden'] || woorden[BRON]['gemeen.maanden'];
    return m || ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  }

  // Vaste teksten in de HTML invullen.
  function vertaal(root) {
    if (typeof document === 'undefined') return;
    root = root || document;
    document.documentElement.lang = taal;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (paar) {
        var p = paar.split(':');
        if (p.length === 2) el.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    root.querySelectorAll('[data-taalknop]').forEach(tekenKnop);
  }

  function zetTaal(nieuw) {
    if (!TALEN[nieuw] || nieuw === taal) return;
    taal = nieuw;
    bewaar(nieuw);
    if (zoek.has('lang') && typeof history !== 'undefined') {
      zoek.set('lang', nieuw);
      history.replaceState(null, '', location.pathname + '?' + zoek.toString() + location.hash);
    }
    vertaal();
    luisteraars.forEach(function (fn) { fn(taal); });
  }
  function opWissel(fn) { luisteraars.push(fn); }

  // Taalknop: één knop met de huidige taal, met een klein menu met de drie talen.
  var STIJL = '.taalkeuze{position:relative;display:inline-block}' +
    '.taalkeuze>button{white-space:nowrap;font:inherit;font-size:13px;font-weight:600;padding:3px 10px;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;opacity:.9}' +
    '.taalkeuze>button:hover{opacity:1}.taalkeuze>button:focus-visible{outline:2px solid #f0c36a;outline-offset:2px}' +
    '.taalkeuze ul{position:absolute;right:0;top:calc(100% + 6px);z-index:200;margin:0;padding:4px;list-style:none;min-width:150px;background:#fff;color:#1c2421;border:1px solid #d9d5ca;border-radius:10px;box-shadow:0 10px 24px -10px rgba(0,0,0,.35)}' +
    '.taalkeuze ul[hidden]{display:none}' +
    '.taalkeuze li button{display:flex;justify-content:space-between;gap:12px;width:100%;font:500 14px/1.3 system-ui,sans-serif;padding:7px 10px;border:0;border-radius:6px;background:none;color:inherit;text-align:left;cursor:pointer}' +
    '.taalkeuze li button:hover,.taalkeuze li button:focus-visible{background:#eef1ee;outline:none}' +
    '.taalkeuze li button[aria-current="true"]{font-weight:700}.taalkeuze li small{color:#5d6661}';
  function stijl() {
    if (document.getElementById('taalkeuze-stijl')) return;
    var s = document.createElement('style');
    s.id = 'taalkeuze-stijl';
    s.textContent = STIJL;
    document.head.appendChild(s);
  }
  function tekenKnop(el) {
    stijl();
    var id = 'taalmenu-' + Math.random().toString(36).slice(2, 8);
    el.className = 'taalkeuze';
    el.innerHTML = '<button type="button" aria-haspopup="true" aria-expanded="false" aria-controls="' + id + '" aria-label="' + t('gemeen.taalKiezen') + '">' +
      '<span aria-hidden="true">&#127760;</span> ' + TALEN[taal].kort + '</button><ul id="' + id + '" role="menu" hidden>' +
      Object.keys(TALEN).map(function (k) {
        return '<li role="none"><button type="button" role="menuitem" lang="' + k + '" data-taal="' + k + '" aria-current="' + (k === taal) + '">' +
          TALEN[k].naam + '<small>' + TALEN[k].kort + '</small></button></li>';
      }).join('') + '</ul>';
    if (el.hasAttribute('data-taal-actief')) return;
    // Luisteraars één keer per element; de knop en het menu worden bij elke wissel opnieuw getekend.
    el.setAttribute('data-taal-actief', '');
    function open(ja) {
      var knop = el.firstChild, menu = el.lastChild;
      menu.hidden = !ja;
      knop.setAttribute('aria-expanded', String(ja));
      if (ja) menu.querySelector('[aria-current="true"]').focus();
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-taal]');
      if (b) {
        open(false);
        zetTaal(b.getAttribute('data-taal'));
        el.firstChild.focus();
      } else if (e.target.closest('.taalkeuze > button')) open(el.lastChild.hidden);
    });
    el.addEventListener('keydown', function (e) {
      var menu = el.lastChild;
      if (menu.hidden) return;
      if (e.key === 'Escape') { open(false); el.firstChild.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var items = Array.prototype.slice.call(menu.querySelectorAll('button'));
        var i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        e.preventDefault();
      }
    });
    document.addEventListener('click', function (e) { if (!el.contains(e.target)) open(false); });
  }

  global.I18N = {
    TALEN: TALEN, BRON: BRON, woorden: woorden,
    get taal() { return taal; },
    voeg: voeg, t: t, heeft: heeft, getal: getal, eur: eur, datum: datum, maanden: maanden,
    vertaal: vertaal, zetTaal: zetTaal, opWissel: opWissel
  };
})(typeof window !== 'undefined' ? window : globalThis);
