/*
  Pensioenplanner: configuratie-overlay.
  Past de aanpassingen uit config-bewerken.html toe op window.PLANNER_CONFIG.
  config.js blijft ongewijzigd. De aanpassingen staan in de localStorage van deze browser
  (alleen de waarden die afwijken van config.js). Laad dit script direct na config.js.
*/
(function (global) {
  'use strict';

  var KEY = 'pensioenplanner.configOverrides';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // Verschil tussen basis en bewerkte versie. Arrays en primitieven worden als geheel opgeslagen.
  function diff(base, edited) {
    if (isObj(base) && isObj(edited)) {
      var out = {}, any = false;
      Object.keys(edited).forEach(function (k) {
        var d = (k in base) ? diff(base[k], edited[k]) : edited[k];
        if (d !== undefined) { out[k] = d; any = true; }
      });
      return any ? out : undefined;
    }
    return same(base, edited) ? undefined : edited;
  }

  // Past overrides toe op target (in place).
  function merge(target, over) {
    Object.keys(over).forEach(function (k) {
      if (isObj(target[k]) && isObj(over[k])) merge(target[k], over[k]);
      else target[k] = over[k];
    });
    return target;
  }

  // Telt de afwijkende waarden (arrays en primitieven tellen als één).
  function tel(o) {
    if (o === undefined) return 0;
    if (isObj(o)) return Object.keys(o).reduce(function (n, k) { return n + tel(o[k]); }, 0);
    return 1;
  }

  function lees() {
    try {
      var v = JSON.parse(global.localStorage.getItem(KEY) || 'null');
      return isObj(v) ? v : null;
    } catch (e) { return null; }
  }

  function schrijf(obj) {
    try {
      if (obj && Object.keys(obj).length) global.localStorage.setItem(KEY, JSON.stringify(obj));
      else global.localStorage.removeItem(KEY);
      return true;
    } catch (e) { return false; }
  }

  // Of er na het toepassen echt iets afwijkt van config.js. Een bewaarde aanpassing die niet meer meetelt
  // (zoals een oude calculatiedatum) of gelijk is aan config.js, geeft geen melding.
  var actief = false;
  if (global.PLANNER_CONFIG) {
    global.PLANNER_BASIS = clone(global.PLANNER_CONFIG);
    var ov = lees();
    if (ov) {
      ov = clone(ov);
      // De calculatiedatum volgt uit de kalenderdatum en is niet aan te passen; oude aanpassingen tellen niet mee.
      delete ov.calculatiedatum;
      // Oude naam van de inkoopfactoren OP.
      if (ov.annuiteitsdelers) { ov.inkoopfactorenOP = ov.annuiteitsdelers; delete ov.annuiteitsdelers; }
      merge(global.PLANNER_CONFIG, ov);
      actief = diff(global.PLANNER_BASIS, global.PLANNER_CONFIG) !== undefined;
    }
  }

  var editor = typeof document !== 'undefined' && document.documentElement && document.documentElement.hasAttribute('data-configbewerker');
  // De bewerkpagina staat naast dit script, ook als een pagina in een submap (varianten/) het laadt.
  var bewerkUrl = typeof document !== 'undefined' && document.currentScript
    ? new URL('config-bewerken.html', document.currentScript.src).href : 'config-bewerken.html';

  // Ververs open planner-pagina's zodra de configuratie in een andere tab wijzigt.
  if (!editor) {
    global.addEventListener('storage', function (e) {
      if (e.key === KEY) global.location.reload();
    });
  }

  // Melding op de planner-pagina's zolang er aanpassingen actief zijn.
  // Tekst in de gekozen taal als i18n/i18n.js geladen is, anders Nederlands.
  function bannerTekst() {
    var t = global.I18N ? global.I18N.t : null;
    return (t ? t('gemeen.configActief') : 'Configuratie-aanpassingen actief.') +
      ' <a href="' + bewerkUrl + '" style="color:#8a5a00;font-weight:600">' + (t ? t('gemeen.configBewerken') : 'Bewerken') + '</a>';
  }
  function toonBanner() {
    if (editor || !actief || typeof document === 'undefined') return;
    var b = document.createElement('div');
    b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;background:#fff4d6;color:#8a5a00;border:1px solid #e0b860;border-radius:8px;padding:8px 12px;font:14px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.12)';
    b.innerHTML = bannerTekst();
    document.body.appendChild(b);
    if (global.I18N) global.I18N.opWissel(function () { b.innerHTML = bannerTekst(); });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', toonBanner);
    else toonBanner();
  }

  global.PensioenOverlay = {
    KEY: KEY,
    actief: actief,
    clone: clone,
    diff: diff,
    merge: merge,
    tel: tel,
    lees: lees,
    schrijf: schrijf
  };
})(typeof window !== 'undefined' ? window : globalThis);
