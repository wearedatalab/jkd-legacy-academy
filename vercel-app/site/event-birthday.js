// ===== Landing /bruce-lee-birthday: video del héroe (vela + one-inch punch), cuenta regresiva, calendario y registro.
// Se carga con defer DESPUÉS de script.js: usa sus funciones globales (jkdTrack, trackFormStart, buildAttribution,
// postLead, toE164, rememberForConversion, thanksUrl, ACADEMY_TEL).
(() => {
  const ES = document.documentElement.lang === 'es';
  const L = ES
    ? { blow: 'Apaga la vela', relight: 'Enciéndela otra vez', days: 'Días', today: '¡Es hoy! Puertas abiertas desde las 9:00', over: 'Gracias por celebrar con nosotros',
        sending: 'Reservando…', err: 'Algo salió mal. Llámanos al ', name: 'Escribe tu nombre.', email: 'Revisa tu correo.', phone: 'Revisa tu número de celular.',
        msg: 'Registro al evento del cumpleaños de Bruce Lee (sáb 28 nov)', guests: ' · acompañantes: ' }
    : { blow: 'Blow out the candle', relight: 'Light it again', days: 'Days', today: 'It’s today! Doors open at 9:00 am', over: 'Thank you for celebrating with us',
        sending: 'Reserving…', err: 'Something went wrong. Please call us on ', name: 'Please enter your name.', email: 'Please check your email.', phone: 'Please check your mobile number.',
        msg: 'Bruce Lee birthday event registration (Sat 28 Nov)', guests: ' · guests: ' };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const track = (n, p) => { try { jkdTrack(n, p); } catch (e) {} };

  // ---- Héroe: bucle de la llama; el botón dispara el puñetazo que apaga la vela
  const loop = document.querySelector('.bd-loop');
  const punch = document.querySelector('.bd-punch');
  const btn = document.querySelector('[data-candle]');
  const btnT = document.querySelector('[data-candle-t]');
  const wish = document.querySelector('[data-wish]');
  const arm = (v) => { if (v && !v.getAttribute('src')) { v.src = v.dataset.src; v.load(); } };
  const show = (v, on) => v && v.classList.toggle('on', on);
  if (loop && !reduce && !saveData) {
    arm(loop);
    loop.play().then(() => show(loop, true)).catch(() => {});
  }
  // Precarga el puñetazo cuando el usuario se acerca al botón (sin gastar datos en la carga inicial)
  if (btn && punch && !reduce) ['pointerenter', 'focus', 'touchstart'].forEach((ev) => btn.addEventListener(ev, () => arm(punch), { once: true, passive: true }));
  let out = false;
  const relight = () => {
    out = false;
    btn.classList.remove('out'); btnT.textContent = L.blow; wish.classList.remove('on');
    show(punch, false);
    if (loop && !reduce) { arm(loop); loop.currentTime = 0; loop.play().then(() => show(loop, true)).catch(() => {}); }
  };
  const blowOut = () => {
    out = true;
    btn.classList.add('out'); btnT.textContent = L.relight;
    setTimeout(() => wish.classList.add('on'), reduce ? 0 : 400);
  };
  if (btn) btn.addEventListener('click', () => {
    if (out) { relight(); return; }
    track('cta_click', { cta_id: 'bday_candle' });
    if (reduce || !punch) { blowOut(); return; }
    arm(punch);
    punch.currentTime = 0;
    punch.play().then(() => { show(punch, true); show(loop, false); if (loop) loop.pause(); }).catch(blowOut);
  });
  if (punch) punch.addEventListener('ended', blowOut);

  // ---- Cuenta regresiva hasta el sábado 28-nov 9:30 (hora de Melbourne)
  const START = Date.parse('2026-11-28T09:30:00+11:00');
  const END = Date.parse('2026-11-28T11:30:00+11:00');
  const box = document.querySelector('[data-count]');
  if (box) {
    const q = (s) => box.querySelector(s);
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const now = Date.now();
      if (now >= START) {
        box.innerHTML = `<div class="lbl" style="color:var(--gold)">${now < END ? L.today : L.over}</div>`;
        clearInterval(t);
        return;
      }
      let s = Math.floor((START - now) / 1000);
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      q('[data-d]').textContent = d; q('[data-h]').textContent = pad(h); q('[data-m]').textContent = pad(m); q('[data-s]').textContent = pad(s);
    };
    const t = setInterval(tick, 1000);
    tick();
  }

  // ---- Calendario (.ics)
  const ics = document.querySelector('[data-ics]');
  if (ics) ics.addEventListener('click', () => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Jeet Kune Do Legacy Academy//Events//EN', 'BEGIN:VEVENT',
      'UID:bruce-lee-birthday-2026@jkdlegacy.com.au', 'DTSTAMP:20261102T000000Z', 'DTSTART:20261127T223000Z', 'DTEND:20261128T003000Z',
      'SUMMARY:The Dragon’s Birthday Experience – JKD Legacy',
      'LOCATION:Unit 6/72-80 Hampstead Rd\\, Maidstone VIC 3012',
      'DESCRIPTION:Free 2-hour Bruce Lee birthday celebration. Doors open 9:00 am. https://jkdlegacy.com.au/bruce-lee-birthday',
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:The Dragon’s Birthday Experience', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'bruce-lee-birthday-jkd-legacy.ics';
    document.body.appendChild(a); a.click(); a.remove();
    track('cta_click', { cta_id: 'bday_ics' });
  });

  // ---- Registro
  const form = document.getElementById('bday-form');
  if (!form) return;
  const $f = (id) => document.getElementById(id);
  const errBox = form.querySelector('.bd-err');
  const submit = form.querySelector('.bd-submit');
  const label = submit.innerHTML;
  try { trackFormStart(form, 'bruce_lee_birthday'); } catch (e) {}

  document.querySelectorAll('[data-scroll-reg]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const top = form.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    form.classList.remove('flash'); void form.offsetWidth; form.classList.add('flash');
    setTimeout(() => $f('bd-name').focus({ preventScroll: true }), reduce ? 0 : 600);
  }));

  // Botón flotante de registro: aparece tras el héroe y se esconde cuando el formulario está a la vista.
  // Su etiqueta pequeña muestra los días que faltan (urgencia real, no un contador inventado).
  const sticky = document.getElementById('bd-sticky');
  const left = document.querySelector('[data-fab-left]');
  if (left) {
    const ms = START - Date.now();
    const days = Math.floor(ms / 86400000);   // igual que la cuenta regresiva del héroe
    if (ms < 12 * 3600000) left.textContent = ES ? 'Es hoy' : 'Today';
    else if (days < 1) left.textContent = ES ? 'Es mañana' : 'Tomorrow';
    else if (days === 1) left.textContent = ES ? 'Queda 1 día' : '1 day left';
    else left.textContent = ES ? `Quedan ${days} días` : `${days} days left`;
  }
  if (sticky && 'IntersectionObserver' in window) {
    let formVisible = false, pastHero = false;
    const sync = () => sticky.classList.toggle('show', !formVisible && pastHero);
    new IntersectionObserver(([en]) => { formVisible = en.isIntersecting; sync(); }, { threshold: 0.1 }).observe(form);
    const onScroll = () => { pastHero = window.scrollY > window.innerHeight * 0.7; sync(); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    track('form_submit', { form_id: 'bruce_lee_birthday' });
    errBox.hidden = true;
    const name = $f('bd-name').value.trim().replace(/\s+/g, ' ');
    const email = $f('bd-email').value.trim();
    const cc = $f('bd-cc').value;
    const rawPhone = $f('bd-phone').value.trim();
    const bad = name.length < 2 ? ['bd-name', L.name] : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? ['bd-email', L.email]
      : rawPhone.replace(/\D/g, '').length < 6 ? ['bd-phone', L.phone] : null;
    if (bad) {
      track('form_error', { form_id: 'bruce_lee_birthday', error_type: 'validation', error_field: bad[0].replace('bd-', '') });
      errBox.textContent = bad[1]; errBox.hidden = false; $f(bad[0]).focus();
      return;
    }
    const guests = $f('bd-guests').value;
    const sp = name.indexOf(' ');
    const attribution = buildAttribution(ES ? 'es' : 'en');
    if (attribution.landing_url && attribution.landing_url.indexOf('/bruce-lee-birthday') === -1) attribution.first_landing_url = attribution.landing_url;
    attribution.landing_url = location.href;
    attribution.form = 'bruce-lee-birthday';
    attribution.form_id = 'bruce_lee_birthday';
    const payload = {
      source: 'bruce-lee-birthday',
      first_name: sp > 0 ? name.slice(0, sp) : name,
      last_name: sp > 0 ? name.slice(sp + 1) : '',
      email,
      phone: rawPhone[0] === '+' ? rawPhone : cc + ' ' + rawPhone.replace(/^0+/, ''),
      location: 'Melbourne',
      experience: $f('bd-exp').value,
      message: L.msg + (guests !== '0' ? L.guests + (guests === '3' ? '3+' : guests) : ''),
      attribution,
    };
    if (window.JKD_NO_BACKEND) { window.location.href = thanksUrl(); return; }
    submit.disabled = true; submit.textContent = L.sending;
    try {
      const saved = await postLead(payload);
      rememberForConversion(email, toE164(cc, rawPhone), 'bruce_lee_birthday');
      window.location.href = thanksUrl(saved.id);
    } catch (err) {
      submit.disabled = false; submit.innerHTML = label;
      errBox.innerHTML = L.err + `<a href="${ACADEMY_TEL.href}">${ACADEMY_TEL.label}</a>.`;
      errBox.hidden = false;
      track('form_error', { form_id: 'bruce_lee_birthday', error_type: err && err.kind === 'server' ? 'server' : 'network' });
    }
  });
})();
