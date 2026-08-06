/* ============================================================
   JKD Legacy — Etiquetas de analítica y marketing (config-driven)
   Los IDs se administran desde el backoffice del CRM:
     Configuración del sitio → componentes externos.
   Este script lee /api/public/site-config e inicializa solo lo configurado.
   (Portado del sitio actual jkdlegacy.com.au: GA4 + Meta Pixel.)
   ============================================================ */
(function () {
  var host = location.hostname;
  // Demo estática sin backend (GitHub Pages): no pidas /api/public/site-config (evita 404 en consola).
  if (window.JKD_NO_BACKEND) return;
  // No disparar en entornos locales/preview para no ensuciar las cuentas reales.
  if (host === 'localhost' || host === '127.0.0.1' || host === '' || /\.local$/.test(host)) return;

  fetch('/api/public/site-config', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (cfg) { if (cfg && cfg.enabled) init(cfg); })
    .catch(function () {});

  function loadScript(src) {
    var s = document.createElement('script'); s.async = true; s.src = src;
    document.head.appendChild(s); return s;
  }

  function init(cfg) {
    var isThanks = location.pathname.replace(/\/+$/, '') === '/thanks';

    /* ---- Google: gtag (GA4 + Google Ads) ---- */
    var googleIds = [cfg.ga4_id, cfg.google_ads_id].filter(Boolean);
    if (googleIds.length) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { dataLayer.push(arguments); };
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(googleIds[0]));
      gtag('js', new Date());
      googleIds.forEach(function (id) { gtag('config', id); });
      if (isThanks && cfg.ga4_id) gtag('event', 'generate_lead', { value: 1, currency: 'AUD' });
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
        t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', cfg.meta_pixel_id);
      fbq('track', 'PageView');
      if (isThanks) fbq('track', 'Lead');
    }

    /* ---- TikTok Pixel ---- */
    if (cfg.tiktok_pixel_id) {
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
  }
})();
