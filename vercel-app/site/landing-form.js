// ===== Formulario propio de las landings especializadas (form#book, generado por _seo/lead_form.py) =====
// Mismo comportamiento que /free-trial: envío al CRM, validaciones, captura de origen (gclid, UTM, referrer, URL de
// llegada y de envío, dispositivo, idioma) y redirección a /thanks con el id del lead. Se carga con defer DESPUÉS de
// script.js y usa sus funciones globales (jkdTrack, buildAttribution, postLead, toE164, rememberForConversion,
// thanksUrl, PHONE_CODES, ACADEMY_TEL, updateFloat). Los eventos GA4 salen por la cola de jkdTrack.
(() => {
  const form = document.getElementById('book');
  if (!form) return;
  const ES = document.documentElement.lang === 'es';
  const formType = form.dataset.formType;
  const formPage = form.dataset.formPage;
  const base = { form_id: formType, form_type: formType, form_page: formPage };
  const track = (name, p) => { try { jkdTrack(name, { ...base, ...(p || {}) }); } catch (e) {} };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $f = (id) => document.getElementById(id);
  const L = ES
    ? { sending: 'Enviando…', check: 'Revisa estos campos: ', err: 'Algo salió mal. Llámanos al ',
        f: { name: 'nombre', phone: 'teléfono', email: 'correo', loc: 'ubicación', experience: 'experiencia' } }
    : { sending: 'Sending…', check: 'Please check: ', err: 'Something went wrong. Please call us on ',
        f: { name: 'name', phone: 'phone', email: 'email', loc: 'location', experience: 'experience' } };

  // Código de país: +61 ya viene en el HTML (funciona sin JS); aquí se agrega la lista completa
  const cc = $f('lf-phone-cc');
  if (cc && typeof PHONE_CODES !== 'undefined') {
    cc.innerHTML = PHONE_CODES.map(([iso, dial, name]) => `<option value="${dial}"${iso === 'AU' ? ' selected' : ''} title="${name}">${dial} ${iso}</option>`).join('');
  }

  // ---- Botones que bajan al formulario (cta_click con cta_name y cta_location)
  let autoFocus = false;   // true mientras el script pone el foco en «Nombre» tras un clic en un botón
  const navH = () => { const n = document.querySelector('.nav'); return n ? n.getBoundingClientRect().height : 0; };
  const goToForm = () => {
    const top = form.getBoundingClientRect().top + window.scrollY - navH() - 14;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
    form.classList.remove('flash'); void form.offsetWidth; form.classList.add('flash');
    const first = $f('lf-name');
    // Foco automático: NO cuenta como form_start (eso es cuando la persona toca un campo)
    setTimeout(() => { if (!first) return; autoFocus = true; first.focus({ preventScroll: true }); autoFocus = false; }, reduce ? 0 : 650);
  };
  document.querySelectorAll('a[data-book-cta]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    track('cta_click', { cta_name: (a.textContent || '').replace(/[→↗]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80), cta_location: a.dataset.bookCta, link_url: '#book' });
    // Con el menú móvil abierto, cerrarlo antes de bajar
    const nav = document.querySelector('.nav.open');
    if (nav) { const t = document.querySelector('.nav-toggle'); if (t) t.click(); }
    goToForm();
    if (location.hash !== '#book') history.replaceState(null, '', '#book');
  }));
  if (location.hash === '#book') setTimeout(goToForm, 300);   // llegada directa a …/página#book

  // El botón flotante sobra mientras el formulario está en pantalla (mismo criterio que /join-the-family)
  if ('IntersectionObserver' in window && typeof updateFloat === 'function') {
    new IntersectionObserver(([en]) => { formOnScreen = en.isIntersecting; updateFloat(); }, { threshold: 0.15 }).observe(form);
  }

  // ---- form_start: al tocar el primer campo (una vez por carga)
  let started = false;
  form.addEventListener('focusin', (e) => {
    if (started || autoFocus || !e.target || !e.target.id || e.target.type === 'submit') return;
    started = true;
    track('form_start', { first_field: e.target.id.replace(/^lf-(x-)?/, '').replace(/-cc$/, '') });
  });

  // ---- Errores accesibles: marca el campo y los nombra en el aviso
  const errBox = form.querySelector('.lf-error');
  const btn = form.querySelector('.lf-submit');
  const btnLabel = btn.innerHTML;
  const fieldsOf = () => [...form.querySelectorAll('input:not([type=hidden]), select')];
  fieldsOf().forEach((el) => el.addEventListener('input', () => { if (el.checkValidity()) el.removeAttribute('aria-invalid'); }));
  // Nombre del campo tal como se ve en pantalla (ya traducido en ?lang=es), sin «(optional)»
  const labelOf = (el) => {
    const lab = form.querySelector(`label[for="${el.id}"]`) || form.querySelector(`label[for="${el.id.replace(/-cc$/, '')}"]`);
    const t = lab ? lab.textContent.replace(/\((optional|opcional)\)/i, '').trim() : '';
    return t || L.f[el.id.replace(/^lf-(x-)?/, '').replace(/-cc$/, '')] || el.id;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    track('form_submit');
    errBox.hidden = true;
    const bad = fieldsOf().filter((el) => !el.checkValidity());
    fieldsOf().forEach((el) => (bad.includes(el) ? el.setAttribute('aria-invalid', 'true') : el.removeAttribute('aria-invalid')));
    if (bad.length) {
      // Clave fija del campo (name, phone, email, goal…): en GA4 no se parte en dos por el idioma
      track('form_error', { error_type: 'validation', error_field: bad[0].id.replace(/^lf-(x-)?/, '').replace(/-cc$/, '') });
      errBox.textContent = L.check + bad.map(labelOf).join(', ') + '.';
      errBox.hidden = false;
      bad[0].focus();
      if (bad[0].reportValidity) bad[0].reportValidity();
      return;
    }
    const name = $f('lf-name').value.trim().replace(/\s+/g, ' ');
    const sp = name.indexOf(' ');
    const dial = cc ? cc.value : '+61';
    const rawPhone = $f('lf-phone').value.trim();
    const email = $f('lf-email').value.trim();
    const attribution = buildAttribution(ES ? 'es' : 'en');
    // El lead queda con esta landing como URL de llegada; el primer toque se conserva aparte (igual que /free-trial)
    if (attribution.landing_url && attribution.landing_url.indexOf('/' + formPage) === -1) attribution.first_landing_url = attribution.landing_url;
    attribution.landing_url = location.href;
    attribution.form = formPage;
    attribution.form_id = formType;          // el CRM lo muestra como «Form»
    attribution.form_type = formType;
    attribution.form_page = formPage;
    const extras = [...form.querySelectorAll('[data-extra]')].map((el) => (el.value.trim() ? `${el.dataset.extra}: ${el.value.trim()}` : '')).filter(Boolean);
    const payload = {
      source: formPage,
      first_name: sp > 0 ? name.slice(0, sp) : name,
      last_name: sp > 0 ? name.slice(sp + 1) : '',
      email,
      phone: rawPhone[0] === '+' ? rawPhone : dial + ' ' + rawPhone.replace(/^0+/, ''),
      location: $f('lf-loc').value,
      experience: $f('lf-experience').value,
      message: [`${form.dataset.message} (landing /${formPage})`, ...extras].join('\n'),
      attribution,
    };
    const thanks = (id) => {
      const u = thanksUrl(id);
      // jkd_debug pasa a /thanks: en modo prueba la conversión se revisa allí sin enviar nada a GA4/Ads/Meta
      return u + (u.indexOf('?') > -1 ? '&' : '?') + 'form_type=' + encodeURIComponent(formType) + (ES ? '&lang=es' : '')
        + (new URLSearchParams(location.search).has('jkd_debug') ? '&jkd_debug=1' : '');
    };
    if (window.JKD_NO_BACKEND) { window.location.href = thanks(); return; }
    btn.disabled = true; btn.textContent = L.sending;
    try {
      const saved = await postLead(payload);
      // free_trial conserva el mismo origen que /free-trial (mismo mensaje en /thanks y form_id en generate_lead)
      rememberForConversion(email, toE164(dial, rawPhone), formType === 'free_trial' ? 'free-trial' : formType);
      window.location.href = thanks(saved.id);
    } catch (err) {
      btn.disabled = false; btn.innerHTML = btnLabel;
      errBox.innerHTML = L.err + `<a href="${ACADEMY_TEL.href}">${ACADEMY_TEL.label}</a>.`;
      errBox.hidden = false;
      track('form_error', { error_type: err && err.kind === 'server' ? 'server' : 'network' });
    }
  });
})();
