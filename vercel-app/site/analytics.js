/* ============================================================
   JKD Legacy — Etiquetas de analítica y marketing (config-driven)
   Los IDs se administran desde el backoffice del CRM:
     Configuración del sitio → componentes externos.
   Este script lee /api/public/site-config e inicializa solo lo configurado.

   - Páginas normales: la carga se difiere (1ª interacción o 4 s tras el load) para no
     penalizar LCP/TBT.
   - /thanks: SIN retraso. Dispara generate_lead con transaction_id = id del lead (?lid=),
     envía user_data (correo + teléfono E.164) para conversiones avanzadas y Meta Lead con
     eventID = lid. Una recarga no vuelve a contar la conversión.
   - Clic en cualquier a[href^="tel:"] → evento GA4 phone_click (carga gtag si aún no está).
   - Depuración: ?jkd_debug=1 (o localStorage jkd_debug=1) funciona también en localhost,
     NO carga scripts externos ni envía nada: registra en consola y en window.dataLayer.
   ============================================================ */
(function () {
  var host = location.hostname;
  // Demo estática sin backend (GitHub Pages): no pidas /api/public/site-config (evita 404 en consola).
  if (window.JKD_NO_BACKEND) return;

  var qs = new URLSearchParams(location.search);
  var DEBUG = qs.has('jkd_debug');
  try { if (!DEBUG) DEBUG = localStorage.getItem('jkd_debug') === '1'; } catch (e) {}
  // No disparar en entornos locales/preview para no ensuciar las cuentas reales (salvo modo debug).
  var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || /\.local$/.test(host);
  if (isLocal && !DEBUG) return;

  var isThanks = location.pathname.replace(/\/+$/, '').replace(/\.html$/, '') === '/thanks';
  function log() { if (DEBUG && window.console) console.log.apply(console, ['[jkd-analytics]'].concat([].slice.call(arguments))); }

  var started = false, ready = false, pending = [];
  function go() { if (started) return; started = true; boot(); }
  function boot() {
    fetch('/api/public/site-config', { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .catch(function () { return null; })
      .then(function (cfg) {
        if (DEBUG && (!cfg || !cfg.enabled || !(cfg.ga4_id || cfg.google_ads_id))) {
          cfg = { enabled: true, ga4_id: 'G-DEBUG', google_ads_id: 'AW-DEBUG', meta_pixel_id: 'DEBUG' };
        }
        if (cfg && cfg.enabled) init(cfg);
      });
  }

  if (isThanks) {
    go();                                   // conversión: sin esperar interacción ni 4 s
  } else {
    // Diferir la analítica fuera de la carga crítica (mejor LCP/TBT).
    ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) { addEventListener(ev, go, { once: true, passive: true }); });
    var later = function () { setTimeout(go, 4000); };
    if (document.readyState === 'complete') later(); else addEventListener('load', later);
  }

  /* ---- Clics en teléfono (sitio + landing) ---- */
  function track(name, params) {
    if (ready && window.gtag) { window.gtag('event', name, params); }
    else { pending.push([name, params]); go(); }   // se envía apenas cargue gtag
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"]') : null;
    if (!a) return;
    var num = (a.getAttribute('href') || '').slice(4);
    track('phone_click', { phone: num, link_url: 'tel:' + num, page_path: location.pathname });
  }, true);

  function loadScript(src) {
    if (DEBUG) { log('loadScript (omitido en debug):', src); return null; }
    var s = document.createElement('script'); s.async = true; s.src = src;
    document.head.appendChild(s); return s;
  }

  function init(cfg) {
    /* ---- Datos de la conversión (solo /thanks) ---- */
    var lid = isThanks ? String(qs.get('lid') || '').replace(/[^\w-]/g, '').slice(0, 40) : '';
    var convKey = 'jkd_conv:' + (lid || 'nolid');
    var already = false, ud = null;
    if (isThanks) {
      // Con lid: una vez por lead en este navegador. Sin lid: una vez por pestaña.
      try { already = lid ? localStorage.getItem(convKey) === '1' : sessionStorage.getItem(convKey) === '1'; } catch (e) {}
      try { ud = JSON.parse(sessionStorage.getItem('jkd_ud') || 'null'); } catch (e) {}
      if (already) log('conversión ya contada para', convKey, '— no se repite');
    }
    var fireConversion = isThanks && !already;
    var fired = false;

    /* ---- Google: gtag (GA4 + Google Ads) ---- */
    var googleIds = [cfg.ga4_id, cfg.google_ads_id].filter(Boolean);
    if (googleIds.length) {
      window.dataLayer = window.dataLayer || [];
      if (!window.gtag) {
        window.gtag = DEBUG
          ? function () { dataLayer.push(arguments); log.apply(null, ['gtag'].concat([].slice.call(arguments))); }
          : function () { dataLayer.push(arguments); };
      }
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(googleIds[0]));
      gtag('js', new Date());
      if (cfg.ga4_id) gtag('config', cfg.ga4_id);
      if (cfg.google_ads_id) gtag('config', cfg.google_ads_id, { allow_enhanced_conversions: true });
      if (fireConversion) {
        // Conversiones avanzadas: user_data ANTES del evento (correo normalizado + teléfono E.164)
        if (ud && (ud.email || ud.phone_number)) {
          var u = {};
          if (ud.email) u.email = ud.email;
          if (ud.phone_number) u.phone_number = ud.phone_number;
          gtag('set', 'user_data', u);
        }
        var ev = { value: 1, currency: 'AUD' };
        if (lid) ev.transaction_id = lid;
        gtag('event', 'generate_lead', ev);
        fired = true;
      }
      ready = true;
      while (pending.length) { var p = pending.shift(); gtag('event', p[0], p[1]); }
    }

    /* ---- Google Tag Manager (contenedor) ---- */
    if (cfg.gtm_id) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(cfg.gtm_id));
    }

    /* ---- Meta (Facebook) Pixel ---- */
    if (cfg.meta_pixel_id) {
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        if (DEBUG) { log('fbq: script omitido en debug'); return; }
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', cfg.meta_pixel_id);
      fbq('track', 'PageView');
      if (fireConversion) {
        if (lid) fbq('track', 'Lead', {}, { eventID: lid }); else fbq('track', 'Lead');
        fired = true;
      }
      if (DEBUG) log('fbq queue:', JSON.stringify(fbq.queue.map(function (a) { return [].slice.call(a); })));
    }

    /* ---- TikTok Pixel ---- */
    if (cfg.tiktok_pixel_id && !DEBUG) {
      !function (w, d, t) {
        w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
        ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
        ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.load = function (e, n) {
          var i = 'https://analytics.tiktok.com/i18n/pixel/events.js';
          ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i; ttq._t = ttq._t || {}; ttq._t[e] = +new Date();
          ttq._o = ttq._o || {}; ttq._o[e] = n || {};
          var o = d.createElement('script'); o.type = 'text/javascript'; o.async = !0; o.src = i + '?sdkid=' + e + '&lib=' + t;
          var a = d.getElementsByTagName('script')[0]; a.parentNode.insertBefore(o, a);
        };
        ttq.load(cfg.tiktok_pixel_id); ttq.page();
      }(window, document, 'ttq');
    }

    /* ---- Cierre de la conversión: marcar como contada y borrar los datos personales ---- */
    if (isThanks) {
      if (fired) { try { (lid ? localStorage : sessionStorage).setItem(convKey, '1'); } catch (e) {} }
      try { sessionStorage.removeItem('jkd_ud'); } catch (e) {}
    }
  }
})();
