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
document.querySelectorAll('a[href^="#"]').forEach(a => {
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
let formFields = [];
async function renderWebForm() {
  if (!fieldsHost) return;
  let cfg = null;
  try { cfg = await fetch(FORM_ENDPOINT).then((r) => r.json()); } catch (e) {}
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
    } else ctrl = `<input class="form-control" type="${f.type || 'text'}" id="${id}"${phAttr} ${req}>`;
    return `<div class="form-group"><label for="${id}">${escHtml(label)}${star}</label>${ctrl}</div>`;
  }).join('');
}
if (fieldsHost) {
  renderWebForm();
  // Re-render labels/options al cambiar de idioma
  document.querySelectorAll('.lang-toggle button').forEach((b) => b.addEventListener('click', () => setTimeout(renderWebForm, 0)));
}

if (form) {
  form.addEventListener('submit', (e) => {
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
    payload.attribution = buildAttribution(lang);
    if (btn) btn.disabled = true;
    fetch(CRM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
    window.location.href = '/thanks';
  });
}
