// ===== Página no listada /womens-self-defence-workshop: niveles de alerta, calendario, botón flotante y registro.
// Se carga con defer DESPUÉS de script.js y usa sus funciones globales (jkdTrack, buildAttribution, postLead, toE164,
// rememberForConversion, thanksUrl, PHONE_CODES, ACADEMY_TEL). Medición igual que landing-form.js:
// cta_click (cta_text, cta_location), form_start (al tocar un campo), form_submit y form_error, con form_type y form_page.
(() => {
  const ES = document.documentElement.lang === 'es';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const form = document.getElementById('ws-form');
  const formType = form ? form.dataset.formType : 'women_workshop';
  const formPage = form ? form.dataset.formPage : 'womens-self-defence-workshop';
  const track = (n, p) => { try { jkdTrack(n, { form_id: formType, form_type: formType, form_page: formPage, ...(p || {}) }); } catch (e) {} };
  const L = ES
    ? { sending: 'Reservando…', check: 'Revisa estos campos: ', err: 'Algo salió mal. Llámanos al ',
        msg: 'Registro al Women’s Self-Defence Workshop (sáb 12 dic)', places: 'Lugares', today: 'Es hoy', tomorrow: 'Es mañana',
        left: (d) => (d === 1 ? 'Queda 1 día' : `Quedan ${d} días`) }
    : { sending: 'Reserving…', check: 'Please check: ', err: 'Something went wrong. Please call us on ',
        msg: 'Women’s Self-Defence Workshop registration (Sat 12 Dec)', places: 'Places', today: 'Today', tomorrow: 'Tomorrow',
        left: (d) => (d === 1 ? '1 day left' : `${d} days left`) };

  // ---- Niveles de alerta (blanco, amarillo, naranja, rojo): un toque muestra qué significa cada uno
  const out = document.querySelector('[data-lv-out]');
  document.querySelectorAll('.ws-lv').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.ws-lv').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (out) { out.textContent = b.querySelector('.ws-lv-d').textContent; out.style.borderLeftColor = getComputedStyle(b).getPropertyValue('--c'); }
    track('cta_click', { cta_text: (b.querySelector('b') || b).textContent.trim(), cta_location: 'awareness_level' });
  }));

  // ---- Calendario (.ics)
  const ics = document.querySelector('[data-ics]');
  if (ics) ics.addEventListener('click', () => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jeet Kune Do Legacy Academy//Events//EN', 'BEGIN:VEVENT',
      'UID:womens-self-defence-workshop-2026@jkdlegacy.com.au', 'DTSTAMP:20261117T000000Z', 'DTSTART:20261211T233000Z', 'DTEND:20261212T013000Z',
      'SUMMARY:Women’s Real-World Self-Defence Workshop – JKD Legacy',
      'LOCATION:Unit 6/72-80 Hampstead Rd\\, Maidstone VIC 3012',
      'DESCRIPTION:2-hour women’s self-defence workshop. Wear comfortable clothes and bring your handbag. https://jkdlegacy.com.au/womens-self-defence-workshop',
      'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', 'DESCRIPTION:Women’s Self-Defence Workshop', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'womens-self-defence-workshop-jkd-legacy.ics';
    document.body.appendChild(a); a.click(); a.remove();
    track('cta_click', { cta_text: ics.textContent.trim(), cta_location: 'ics' });
  });
  const gcal = document.querySelector('a[data-ws-cta="gcal"]');
  if (gcal) gcal.addEventListener('click', () => track('cta_click', { cta_text: gcal.textContent.trim(), cta_location: 'gcal', link_url: 'google_calendar' }));

  if (!form) return;
  const $f = (id) => document.getElementById(id);
  const errBox = form.querySelector('.bd-err');
  const btn = form.querySelector('.ws-submit');
  const cc = $f('ws-phone-cc');
  if (cc && typeof PHONE_CODES !== 'undefined') {
    cc.innerHTML = PHONE_CODES.map(([iso, dial, name]) => `<option value="${dial}"${iso === 'AU' ? ' selected' : ''} title="${name}">${dial} ${iso}</option>`).join('');
  }

  // ---- Botones que bajan al formulario (cta_click con cta_text y cta_location)
  let autoFocus = false;
  const goToForm = () => {
    const nav = document.querySelector('.nav');
    const top = form.getBoundingClientRect().top + window.scrollY - (nav ? nav.getBoundingClientRect().height : 0) - 14;
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
    form.classList.remove('flash'); void form.offsetWidth; form.classList.add('flash');
    setTimeout(() => { autoFocus = true; $f('ws-name').focus({ preventScroll: true }); autoFocus = false; }, reduce ? 0 : 650);
  };
  document.querySelectorAll('a[data-ws-cta][href="#register"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const t = (a.querySelector('b') || a).textContent.replace(/[→↗]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    track('cta_click', { cta_text: t, cta_location: a.dataset.wsCta, link_url: '#register' });
    goToForm();
    if (location.hash !== '#register') history.replaceState(null, '', '#register');
  }));
  const prog = document.querySelector('a[data-ws-cta="hero_program"]');
  if (prog) prog.addEventListener('click', () => track('cta_click', { cta_text: prog.textContent.trim(), cta_location: 'hero_program', link_url: '#program' }));
  if (location.hash === '#register') setTimeout(goToForm, 300);

  // ---- Botón flotante: aparece tras el héroe y se esconde con el formulario en pantalla. Muestra los días que faltan.
  const START = Date.parse('2026-12-12T10:30:00+11:00');
  const left = document.querySelector('[data-fab-left]');
  if (left) {
    const ms = START - Date.now();
    const days = Math.floor(ms / 86400000);
    if (ms <= 0) left.closest('.ws-fab').remove();
    else left.textContent = ms < 12 * 3600000 ? L.today : days < 1 ? L.tomorrow : L.left(days);
  }
  const sticky = document.getElementById('ws-sticky');
  if (sticky && 'IntersectionObserver' in window) {
    let formVisible = false, pastHero = false;
    const sync = () => sticky.classList.toggle('show', !formVisible && pastHero);
    new IntersectionObserver(([en]) => { formVisible = en.isIntersecting; sync(); }, { threshold: 0.1 }).observe(form);
    const onScroll = () => { pastHero = window.scrollY > window.innerHeight * 0.7; sync(); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  // ---- form_start: al tocar el primer campo (una vez por carga; el foco automático no cuenta)
  let started = false;
  form.addEventListener('focusin', (e) => {
    if (started || autoFocus || !e.target || !e.target.id || e.target.type === 'submit') return;
    started = true;
    track('form_start', { first_field: e.target.id.replace(/^ws-/, '').replace(/-cc$/, '') });
  });

  const fields = () => [...form.querySelectorAll('input:not([type=hidden]), select')];
  const labelOf = (el) => { const lab = form.querySelector(`label[for="${el.id.replace(/-cc$/, '')}"]`); return lab ? lab.textContent.trim() : el.id; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    track('form_submit');
    errBox.hidden = true;
    const bad = fields().filter((el) => !el.checkValidity());
    if (bad.length) {
      track('form_error', { error_type: 'validation', error_field: bad[0].id.replace(/^ws-/, '').replace(/-cc$/, '') });
      errBox.textContent = L.check + bad.map(labelOf).join(', ') + '.';
      errBox.hidden = false; bad[0].focus();
      return;
    }
    const name = $f('ws-name').value.trim().replace(/\s+/g, ' ');
    const sp = name.indexOf(' ');
    const dial = cc ? cc.value : '+61';
    const rawPhone = $f('ws-phone').value.trim();
    const email = $f('ws-email').value.trim();
    const places = $f('ws-places');
    const attribution = buildAttribution(ES ? 'es' : 'en');
    if (attribution.landing_url && attribution.landing_url.indexOf('/' + formPage) === -1) attribution.first_landing_url = attribution.landing_url;
    attribution.landing_url = location.href;
    attribution.form = formPage;
    attribution.form_id = formType;
    attribution.form_type = formType;
    attribution.form_page = formPage;
    const payload = {
      source: formPage,
      first_name: sp > 0 ? name.slice(0, sp) : name,
      last_name: sp > 0 ? name.slice(sp + 1) : '',
      email,
      phone: rawPhone[0] === '+' ? rawPhone : dial + ' ' + rawPhone.replace(/^0+/, ''),
      location: 'Melbourne',
      experience: '',
      message: `${L.msg}\n${L.places}: ${places.value === '4' ? '4+' : places.value} (${places.options[places.selectedIndex].text})`,
      attribution,
    };
    const thanks = (id) => {
      const u = thanksUrl(id);
      return u + (u.indexOf('?') > -1 ? '&' : '?') + 'form_type=' + encodeURIComponent(formType) + (ES ? '&lang=es' : '')
        + (new URLSearchParams(location.search).has('jkd_debug') ? '&jkd_debug=1' : '');
    };
    if (window.JKD_NO_BACKEND) { window.location.href = thanks(); return; }
    const label = btn.innerHTML;
    btn.disabled = true; btn.textContent = L.sending;
    try {
      const saved = await postLead(payload);
      rememberForConversion(email, toE164(dial, rawPhone), formType);
      window.location.href = thanks(saved.id);
    } catch (err) {
      btn.disabled = false; btn.innerHTML = label;
      errBox.innerHTML = L.err + `<a href="${ACADEMY_TEL.href}">${ACADEMY_TEL.label}</a>.`;
      errBox.hidden = false;
      track('form_error', { error_type: err && err.kind === 'server' ? 'server' : 'network' });
    }
  });
})();
