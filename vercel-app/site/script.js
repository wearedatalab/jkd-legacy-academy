// ===== Nav scroll state =====
const nav = document.querySelector('.nav');
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ===== Mobile menu =====
if (navToggle) {
  const setMenu = (open) => {
    nav.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);   // bloquea el scroll del fondo
    navToggle.setAttribute('aria-expanded', open);
    if (typeof updateFloat === 'function') updateFloat();
  };
  navToggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
}

// ===== Reveal on scroll =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ===== Centerline scroll progress =====
const centerline = document.querySelector('.centerline');
const clRead = document.querySelector('[data-cl-read]');
if (centerline) {
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
    centerline.style.setProperty('--cl', pct + '%');
    if (clRead) clRead.textContent = String(Math.round(pct)).padStart(2, '0') + ' · 截拳道';
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// ===== Count-up stats =====
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const countObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    countObserver.unobserve(el);
    if (reduce) return;
    const raw = el.textContent.trim();
    const num = parseInt(raw, 10);
    if (isNaN(num)) return;
    const suffix = raw.replace(/^[0-9]+/, '');
    const dur = 1100, start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(num * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}, { threshold: 0.6 });
document.querySelectorAll('[data-count]').forEach(el => countObserver.observe(el));

// ===== Magnetic buttons =====
if (!reduce && window.matchMedia('(pointer: fine)').matches) {
  document.querySelectorAll('[data-magnetic]').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.18}px, ${y * 0.28}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });
}

// ===== Smooth anchor offset =====
document.querySelectorAll('a[href^="#"]:not([data-scroll-form])').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const t = document.querySelector(id);
      if (t) {
        e.preventDefault();
        const top = t.getBoundingClientRect().top + window.scrollY - 84;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  });
});

// ===== Year =====
document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

// ===== Floating register CTA: SIEMPRE visible (solo se oculta con el menú móvil abierto) =====
const floatCta = document.querySelector('.float-cta');
function updateFloat() {
  if (!floatCta) return;
  floatCta.classList.toggle('show', !document.body.classList.contains('nav-open'));
}
updateFloat();

// ===== Web capture form — rendered from CRM config → JKD Legacy CRM =====
const CRM_ENDPOINT = '/api/public/lead';
const FORM_ENDPOINT = '/api/public/form';
const form = document.querySelector('#contact-form');
const fieldsHost = document.querySelector('#form-fields');

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const curLang = () => {
  const u = new URLSearchParams(location.search).get('lang');
  const l = u || localStorage.getItem('jkd-lang') || (navigator.language || 'en');
  return l.toLowerCase().startsWith('es') ? 'es' : 'en';
};
// Mapea claves conocidas a columnas del lead; el resto va al mensaje
const LEAD_MAP = { name: 'first_name', first: 'first_name', first_name: 'first_name', last: 'last_name', last_name: 'last_name', email: 'email', phone: 'phone', location: 'location', experience: 'experience', message: 'message' };

// ===== Atribución de marketing (origen del lead, para el equipo de pauta) =====
const ATTR_KEY = 'jkd_attr';
const ATTR_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid', 'ttclid', 'gad_source'];
(function captureAttribution() {
  try {
    const p = new URLSearchParams(location.search);
    let store = {};
    try { store = JSON.parse(localStorage.getItem(ATTR_KEY)) || {}; } catch (e) {}
    const touch = () => { const o = { url: location.href, referrer: document.referrer || '', at: new Date().toISOString() }; ATTR_PARAMS.forEach((k) => { const v = p.get(k); if (v) o[k] = v; }); return o; };
    if (!store.first) store.first = touch();                 // first-touch (no se sobrescribe)
    const hasParams = ATTR_PARAMS.some((k) => p.get(k)) || !store.last;
    if (hasParams) store.last = touch();                     // last-touch (se actualiza con cada nuevo origen)
    localStorage.setItem(ATTR_KEY, JSON.stringify(store));
  } catch (e) {}
})();
function deriveChannel(f) {
  const s = (f.utm_source || '').toLowerCase(), m = (f.utm_medium || '').toLowerCase(), r = (f.referrer || '').toLowerCase();
  if (f.gclid || f.gad_source || (s === 'google' && /cpc|ppc|paid/.test(m))) return 'Google Ads';
  if (f.fbclid || /facebook|instagram|meta|\bfb\b|\big\b/.test(s)) return /cpc|paid|ads|social/.test(m) ? 'Meta Ads' : 'Meta / Social';
  if (f.msclkid) return 'Microsoft Ads';
  if (f.ttclid || s === 'tiktok') return 'TikTok';
  if (/email|newsletter|mailchimp/.test(m) || /email/.test(s)) return 'Email';
  if (m) return m.charAt(0).toUpperCase() + m.slice(1);
  if (s) return s.charAt(0).toUpperCase() + s.slice(1);
  if (/google|bing|yahoo|duckduckgo|ecosia/.test(r)) return 'Búsqueda orgánica';
  if (/facebook|instagram|twitter|t\.co|linkedin|youtube|tiktok/.test(r)) return 'Social orgánico';
  if (r) return 'Referido';
  return 'Directo';
}
function buildAttribution(lang) {
  let store = {}; try { store = JSON.parse(localStorage.getItem(ATTR_KEY)) || {}; } catch (e) {}
  const f = store.first || {}, l = store.last || {};
  const ua = navigator.userAgent || '';
  const a = {
    channel: deriveChannel(f.utm_source || f.gclid || f.fbclid ? f : l),
    utm_source: f.utm_source || l.utm_source || '', utm_medium: f.utm_medium || l.utm_medium || '',
    utm_campaign: f.utm_campaign || l.utm_campaign || '', utm_term: f.utm_term || l.utm_term || '',
    utm_content: f.utm_content || l.utm_content || '',
    gclid: f.gclid || l.gclid || '', fbclid: f.fbclid || l.fbclid || '', msclkid: f.msclkid || l.msclkid || '', ttclid: f.ttclid || l.ttclid || '',
    landing_url: f.url || '', referrer: f.referrer || '',
    last_url: l.url || '', submit_url: location.href,
    language: lang, device: /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'Móvil' : 'Escritorio',
    user_agent: ua, first_seen: f.at || '', captured_at: new Date().toISOString(),
  };
  Object.keys(a).forEach((k) => { if (a[k] === '') delete a[k]; });
  return a;
}

// Formulario por defecto si el backend del CRM no está disponible (demo estática / fallback)
const FALLBACK_FORM = {
  fields: [
    { key: 'name', label: 'Full Name', labelEs: 'Nombre completo', type: 'text', placeholder: 'Your name', placeholderEs: 'Tu nombre', required: true },
    { key: 'email', label: 'Email', labelEs: 'Correo electrónico', type: 'email', placeholder: 'you@email.com', placeholderEs: 'tu@correo.com', required: true },
    { key: 'phone', label: 'Phone', labelEs: 'Teléfono', type: 'tel', placeholder: '04xx xxx xxx', placeholderEs: '04xx xxx xxx', required: true },
    { key: 'path', label: 'Which path interests you?', labelEs: '¿Qué camino te interesa?', type: 'select',
      options: ['Foundation', 'Progression', 'Mastery', 'Not sure'], optionsEs: ['Base', 'Progresión', 'Maestría', 'Inseguro'], required: true },
  ],
  text: {
    eyebrow_en: 'Inquire to Train', eyebrow_es: 'Solicita Entrenar',
    heading_en: 'Begin the Conversation.', heading_es: 'Empieza la Conversación.',
    intro_en: 'Submit the form and Sigung Vargas (or the Adelaide head instructor) will reach out personally to schedule a private call.',
    intro_es: 'Envía el formulario y el Sigung Vargas (o el instructor principal de Adelaide) te contactará personalmente para agendar una llamada privada.',
    submit_en: 'Submit Inquiry', submit_es: 'Enviar Solicitud',
    privacy_en: 'Your inquiry is private. We do not share your information.',
    privacy_es: 'Tu solicitud es privada. No compartimos tu información.',
  },
};
// Códigos de país para el teléfono (Australia por defecto)
const PHONE_CODES = [
  ['AU', '+61', 'Australia'], ['NZ', '+64', 'New Zealand'], ['US', '+1', 'USA / Canadá'],
  ['GB', '+44', 'United Kingdom'], ['CO', '+57', 'Colombia'], ['MX', '+52', 'México'],
  ['AR', '+54', 'Argentina'], ['CL', '+56', 'Chile'], ['PE', '+51', 'Perú'], ['EC', '+593', 'Ecuador'],
  ['VE', '+58', 'Venezuela'], ['BR', '+55', 'Brasil'], ['ES', '+34', 'España'], ['PH', '+63', 'Philippines'],
  ['IN', '+91', 'India'], ['CN', '+86', 'China'], ['ID', '+62', 'Indonesia'], ['MY', '+60', 'Malaysia'],
  ['SG', '+65', 'Singapore'], ['VN', '+84', 'Vietnam'], ['TH', '+66', 'Thailand'], ['JP', '+81', 'Japan'],
  ['KR', '+82', 'South Korea'], ['DE', '+49', 'Germany'], ['FR', '+33', 'France'], ['IT', '+39', 'Italy'],
  ['PT', '+351', 'Portugal'], ['ZA', '+27', 'South Africa'], ['AE', '+971', 'UAE'],
];
const phoneCcOptions = () => PHONE_CODES.map(([iso, dial, name]) =>
  `<option value="${dial}"${iso === 'AU' ? ' selected' : ''}>${dial} · ${name}</option>`).join('');

let formFields = [];
async function renderWebForm() {
  if (!fieldsHost) return;
  let cfg = null;
  if (!window.JKD_NO_BACKEND) { try { cfg = await fetch(FORM_ENDPOINT).then((r) => r.json()); } catch (e) {} }
  if (!cfg || !Array.isArray(cfg.fields) || !cfg.fields.length) cfg = FALLBACK_FORM;   // CRM no disponible → form por defecto
  formFields = cfg.fields;
  const lang = curLang();
  // Textos del formulario (encabezado, intro, botón, aviso) desde la config del CRM
  const t = (cfg && cfg.text) || {};
  const pick = (b) => (lang === 'es' && t[b + '_es']) ? t[b + '_es'] : (t[b + '_en'] || '');
  const setT = (id, val) => { const el = document.getElementById(id); if (el && val) el.textContent = val; };
  setT('form-eyebrow', pick('eyebrow')); setT('form-heading', pick('heading')); setT('form-intro', pick('intro'));
  setT('form-submit', pick('submit')); setT('form-privacy', pick('privacy'));
  const ph = lang === 'es' ? 'Selecciona una opción' : 'Select an option';
  fieldsHost.innerHTML = formFields.map((f) => {
    const label = (lang === 'es' && f.labelEs) ? f.labelEs : (f.label || f.key);
    const id = 'wf-' + f.key, req = f.required ? 'required' : '';
    const star = f.required ? ' <span style="color:var(--accent)">*</span>' : '';
    const phv = (lang === 'es' && f.placeholderEs) ? f.placeholderEs : (f.placeholder || '');
    const phAttr = phv ? ` placeholder="${escHtml(phv)}"` : '';
    let ctrl;
    if (f.type === 'textarea') ctrl = `<textarea class="form-control" id="${id}"${phAttr} ${req}></textarea>`;
    else if (f.type === 'select') {
      const opts = (lang === 'es' && f.optionsEs && f.optionsEs.length) ? f.optionsEs : (f.options || []);
      ctrl = `<select class="form-control" id="${id}" ${req}><option value="">${escHtml(phv || ph)}</option>${opts.map((o) => `<option>${escHtml(o)}</option>`).join('')}</select>`;
    } else if (f.type === 'tel') {
      // Teléfono = un solo control: código de país + número (unidos, sin banderas para verse bien en todos los sistemas)
      ctrl = `<div style="display:flex;align-items:stretch">`
        + `<select class="form-control" id="${id}-cc" aria-label="Código de país" style="flex:0 0 auto;width:158px;max-width:48%;border-top-right-radius:0;border-bottom-right-radius:0;border-right:none;padding-left:14px;padding-right:6px">${phoneCcOptions()}</select>`
        + `<input class="form-control" type="tel" id="${id}" inputmode="tel"${phAttr || ' placeholder="412 345 678"'} ${req} style="flex:1 1 auto;min-width:0;border-top-left-radius:0;border-bottom-left-radius:0">`
        + `</div>`;
    } else ctrl = `<input class="form-control" type="${f.type || 'text'}" id="${id}"${phAttr} ${req}>`;
    return `<div class="form-group"><label for="${id}">${escHtml(label)}${star}</label>${ctrl}</div>`;
  }).join('');
}
if (fieldsHost) {
  renderWebForm();
  // Re-render labels/options al cambiar de idioma
  document.querySelectorAll('.lang-toggle button').forEach((b) => b.addEventListener('click', () => setTimeout(renderWebForm, 0)));
}

// ===== Envío de leads (compartido): espera la respuesta del CRM y SOLO redirige si el lead se guardó =====
const SUBMIT_TIMEOUT_MS = 8000;
const ACADEMY_TEL = { href: 'tel:+61459785073', label: '0459 785 073' };
async function postLead(payload) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, SUBMIT_TIMEOUT_MS);
  try {
    const r = await fetch(CRM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) throw new Error('lead not saved');
    return j;
  } finally { clearTimeout(timer); }
}
// Teléfono en E.164 (+61459785073) para las conversiones avanzadas de Google Ads
function toE164(cc, raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s[0] === '+') { const d = s.replace(/\D/g, ''); return d ? '+' + d : ''; }
  if (s.slice(0, 2) === '00') { const d = s.slice(2).replace(/\D/g, ''); return d ? '+' + d : ''; }
  const d = s.replace(/\D/g, '').replace(/^0+/, '');            // quita el 0 troncal
  const c = String(cc || '+61').replace(/\D/g, '');
  return d ? '+' + c + d : '';
}
// Guarda (solo en esta pestaña) correo y teléfono para enviarlos como user_data en /thanks; allí se borran.
function rememberForConversion(email, phoneE164, from) {
  try {
    sessionStorage.setItem('jkd_ud', JSON.stringify({ email: String(email || '').trim().toLowerCase(), phone_number: phoneE164 || '' }));
    if (from) sessionStorage.setItem('jkd_from', from); else sessionStorage.removeItem('jkd_from');
  } catch (e) {}
}
const thanksUrl = (id) => (window.JKD_NO_BACKEND ? 'thanks.html' : '/thanks') + (id ? '?lid=' + encodeURIComponent(id) : '');
function showFormError(formEl, msg) {
  let box = formEl.querySelector('.form-error');
  if (!msg) { if (box) box.hidden = true; return; }
  if (!box) {
    box = document.createElement('div');
    box.className = 'form-error'; box.setAttribute('role', 'alert');
    box.style.cssText = 'margin-top:14px;padding:12px 14px;border-radius:4px;background:rgba(196,64,47,.14);border:1px solid rgba(196,64,47,.5);color:#f3c3bb;font-size:.9rem;line-height:1.5';
    formEl.appendChild(box);
  }
  box.innerHTML = escHtml(msg) + ` <a href="${ACADEMY_TEL.href}" style="color:#fff;text-decoration:underline;font-weight:600;white-space:nowrap">${ACADEMY_TEL.label}</a>.`;
  box.hidden = false;
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const lang = curLang();
    const payload = { source: 'website' };
    const extras = [];
    formFields.forEach((f) => {
      const el = document.getElementById('wf-' + f.key);
      const v = ((el && el.value) || '').trim();
      if (!v) return;
      const col = LEAD_MAP[f.key];
      if (col) payload[col] = payload[col] ? payload[col] + ' ' + v : v;
      else { const label = (lang === 'es' && f.labelEs) ? f.labelEs : (f.label || f.key); extras.push(label + ': ' + v); }
    });
    if (extras.length) payload.message = [payload.message, extras.join('\n')].filter(Boolean).join('\n');
    // Teléfono: anteponer el código de país (salvo que el número ya lo traiga con +)
    const ccEl = document.getElementById('wf-phone-cc');
    if (ccEl && payload.phone && payload.phone.trim()[0] !== '+') {
      const num = payload.phone.trim().replace(/^0+/, '').trim();  // quita el 0 troncal inicial
      payload.phone = ccEl.value + ' ' + num;
    }
    payload.attribution = buildAttribution(lang);
    if (window.JKD_NO_BACKEND) { window.location.href = thanksUrl(); return; }   // demo estática sin CRM
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = lang === 'es' ? 'Enviando…' : 'Sending…'; }
    showFormError(form, '');
    try {
      const saved = await postLead(payload);
      const phoneEl = document.getElementById('wf-phone');
      rememberForConversion(payload.email, toE164(ccEl ? ccEl.value : '+61', phoneEl ? phoneEl.value : payload.phone), 'join');
      window.location.href = thanksUrl(saved.id);
    } catch (err) {
      // No redirigir: el lead NO se guardó. Mostrar el teléfono y reactivar el botón.
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
      showFormError(form, lang === 'es' ? 'No pudimos enviar tu solicitud. Inténtalo de nuevo o llámanos al' : "We couldn't send your request. Please try again or call us on");
    }
  });
}

// ===== Landing de pauta /free-trial =====
const trialForm = document.querySelector('#trial-form');
if (trialForm) {
  const $t = (id) => document.getElementById(id);
  // Código de país: +61 ya viene en el HTML (funciona sin JS); aquí se agrega la lista completa
  const ccSel = $t('ft-phone-cc');
  if (ccSel) ccSel.innerHTML = PHONE_CODES.map(([iso, dial, name]) => `<option value="${dial}"${iso === 'AU' ? ' selected' : ''} title="${escHtml(name)}">${dial} ${iso}</option>`).join('');
  const errBox = trialForm.querySelector('.ft-error');
  const btn = trialForm.querySelector('.ft-submit');
  const btnLabel = btn.innerHTML;

  trialForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!trialForm.reportValidity()) return;
    const name = $t('ft-name').value.trim().replace(/\s+/g, ' ');
    const sp = name.indexOf(' ');
    const cc = ccSel ? ccSel.value : '+61';
    const rawPhone = $t('ft-phone').value.trim();
    const email = $t('ft-email').value.trim();
    const attribution = buildAttribution('en');
    // El lead queda con la landing como origen (para separarlo en el CRM); el primer toque se conserva aparte.
    if (attribution.landing_url && attribution.landing_url.indexOf('/free-trial') === -1) attribution.first_landing_url = attribution.landing_url;
    attribution.landing_url = location.href;
    attribution.form = 'free-trial';
    const payload = {
      source: 'free-trial',
      first_name: sp > 0 ? name.slice(0, sp) : name,
      last_name: sp > 0 ? name.slice(sp + 1) : '',
      email,
      phone: rawPhone[0] === '+' ? rawPhone : cc + ' ' + rawPhone.replace(/^0+/, ''),
      location: $t('ft-loc').value,
      experience: $t('ft-experience').value,
      message: 'Free trial class request (landing /free-trial)',
      attribution,
    };
    if (window.JKD_NO_BACKEND) { window.location.href = thanksUrl(); return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    errBox.hidden = true;
    try {
      const saved = await postLead(payload);
      rememberForConversion(email, toE164(cc, rawPhone), 'free-trial');
      window.location.href = thanksUrl(saved.id);
    } catch (err) {
      btn.disabled = false; btn.innerHTML = btnLabel;
      errBox.innerHTML = `We couldn't send your request. Please try again or call us on <a href="${ACADEMY_TEL.href}">${ACADEMY_TEL.label}</a>.`;
      errBox.hidden = false;
    }
  });

  // Botones "Book free class" → scroll al formulario (y un destello para ubicarlo)
  document.querySelectorAll('[data-scroll-form]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const top = trialForm.getBoundingClientRect().top + window.scrollY - 14;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    trialForm.classList.remove('flash'); void trialForm.offsetWidth; trialForm.classList.add('flash');
  }));

  // Barra fija móvil: visible solo cuando el formulario NO está en pantalla (nunca tapa el form)
  const sticky = document.getElementById('ft-sticky');
  if (sticky && 'IntersectionObserver' in window) {
    let formVisible = true, pastHero = false;
    const sync = () => sticky.classList.toggle('show', !formVisible && pastHero);
    new IntersectionObserver(([en]) => { formVisible = en.isIntersecting; sync(); }, { threshold: 0.15 }).observe(trialForm);
    const onScroll = () => { pastHero = window.scrollY > 140; sync(); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
}

// ===== Imágenes diferidas (img[data-src]): se cargan al acercarse con el scroll. El loading="lazy" nativo
// las bajaba igual en la carga inicial (umbral de ~1.250–2.500 px) y competían con el hero por el ancho de banda.
(function () {
  const imgs = document.querySelectorAll('img[data-src]');
  if (!imgs.length) return;
  const show = (img) => {
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
    img.removeAttribute('data-src'); img.removeAttribute('data-srcset');
  };
  if (!('IntersectionObserver' in window)) { imgs.forEach(show); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); show(e.target); } }), { rootMargin: '500px 0px' });
  imgs.forEach((img) => io.observe(img));
})();

// ===== Mapa diferido: el iframe de Google Maps (~400 KiB de JS) se inserta solo cuando la sección
// está cerca de verse. El loading="lazy" nativo lo precargaba a ~2.500 px en redes lentas y hundía el LCP.
document.querySelectorAll('.ft-map[data-map-src]').forEach((box) => {
  const load = () => {
    if (box.dataset.loaded) return; box.dataset.loaded = '1';
    const f = document.createElement('iframe');
    f.src = box.dataset.mapSrc; f.title = box.getAttribute('aria-label') || 'Map';
    f.referrerPolicy = 'no-referrer-when-downgrade'; f.setAttribute('allowfullscreen', '');
    box.appendChild(f); box.removeAttribute('role');
  };
  if (!('IntersectionObserver' in window)) return load();
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '300px 0px' });
  io.observe(box);
});

// ===== /thanks: copy específico cuando el lead viene de la clase gratuita =====
if (/\/thanks(\.html)?$/.test(location.pathname)) {
  let from = ''; try { from = sessionStorage.getItem('jkd_from') || ''; } catch (e) {}
  if (from === 'free-trial') {
    const set = (sel, html) => { const el = document.querySelector(sel); if (el) { el.removeAttribute('data-i18n'); el.removeAttribute('data-i18n-html'); el.innerHTML = html; } };
    set('.thanks .eyebrow', 'Free class requested');
    set('.thanks h1', 'You’re in.<br><span class="text-accent">We’ll call you soon</span>.');
    set('.thanks p.lead', 'Thanks for booking your free Jeet Kune Do class. We’ll call you within 24 hours to find a class time that suits you.');
    set('.thanks .note', 'Can’t wait? Call us on <a href="tel:+61459785073" style="color:var(--text)">0459 785 073</a>.');
  }
}
