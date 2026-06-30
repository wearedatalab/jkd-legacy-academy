// ============================================================
//  JKD Legacy CRM — frontend (vanilla)
// ============================================================
const $ = (s, r = document) => r.querySelector(s);
const root = $('#root');
const state = { me: null, meta: null, leads: [], users: [], view: 'kanban', filter: 'all', q: '', leadsPage: 1, kLimit: {} };

const STATUS_META = {
  registrado: { label: 'Registrado', color: 'var(--accent)', cls: 'registrado' },
  contactado: { label: 'Contactado', color: 'var(--brass)', cls: 'contactado' },
  ganado:     { label: 'Ganado',     color: 'var(--green)', cls: 'ganado' },
  perdido:    { label: 'Perdido',    color: 'var(--red)',   cls: 'perdido' },
};

// Roles: administrador (acceso total) y comercial (restringido)
const ROLE_LABELS = { admin: 'Administrador', comercial: 'Comercial' };
const roleLabel = (r) => ROLE_LABELS[r] || r;
const isAdmin = () => !!(state.me && state.me.role === 'admin');

const ICON = {
  kanban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="6" height="14" rx="1"/><rect x="9.5" y="3" width="6" height="9" rx="1" transform="translate(5.5 0)"/><rect x="15" y="3" width="6" height="18" rx="1"/></svg>',
  leads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  redirect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>',
  config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

// ---------- utils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => (n || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const fullName = (l) => `${l.first_name || ''} ${l.last_name || ''}`.trim() || '(sin nombre)';
function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtDateTime(iso) { const d = new Date(iso); return d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function fmtMonth(m) { const [y, mo] = m.split('-'); return new Date(y, mo - 1, 1).toLocaleDateString('es', { month: 'short' }).replace('.', ''); }
function fmtMonthLong(m) { const [y, mo] = m.split('-'); const d = new Date(y, mo - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' }); return d.charAt(0).toUpperCase() + d.slice(1); }

const API_BASE = '/crm'; // the CRM is mounted under /crm on the main domain
async function api(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(API_BASE + path, opt);
  if (res.status === 401) { state.me = null; renderLogin(); throw new Error('unauth'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}
let toastT;
function toast(msg, type = 'ok') {
  const t = $('#toast'); t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2600);
}

// ============================================================
//  LOGIN
// ============================================================
function renderLogin() {
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo">
        <span class="mark"><img src="assets/favicon.png" alt=""></span>
        <span><b>JKD Legacy</b><span>Backoffice · CRM</span></span>
      </div>
      <h1>Acceso al panel</h1>
      <p class="sub">Ingresa tu correo y te enviaremos un enlace mágico para entrar — sin contraseñas.</p>
      <form id="login-form">
        <div class="field">
          <label>Correo electrónico</label>
          <input type="email" id="email" placeholder="tu@jkdlegacy.com.au" required autocomplete="email">
        </div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" type="submit">Enviar enlace mágico →</button>
      </form>
      <div id="magic-out"></div>
      <p class="login-note">Demo local · usa <code>admin@jkdlegacy.com.au</code> (administrador) o <code>comercial@jkdlegacy.com.au</code> (comercial).</p>
    </div>
  </div>`;

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const email = $('#email').value.trim();
    btn.disabled = true; btn.textContent = 'Generando…';
    try {
      const r = await api('POST', '/api/auth/request', { email });
      const out = $('#magic-out');
      // Mensaje neutro siempre — no revela si el correo existe ni a quién pertenece.
      let h = '<div class="magic-result"><p>Si el correo está registrado, te enviamos un enlace de acceso. Revisa tu bandeja de entrada.</p>';
      if (r.devLink) h += `<span class="devtag" style="display:block;margin-top:12px">● Modo demo local (sin correo)</span><a class="btn btn-primary btn-sm" href="${r.devLink}" style="margin-top:8px">Entrar al panel →</a>`;
      out.innerHTML = h + '</div>';
    } catch (err) { toast('Error al solicitar el enlace', 'err'); }
    btn.disabled = false; btn.textContent = 'Enviar enlace mágico →';
  });
}

// ============================================================
//  APP SHELL
// ============================================================
function renderApp() {
  // El comercial no ve Usuarios, Redirecciones ni Configuración
  const ADMIN_VIEWS = ['users', 'redirects', 'config'];
  const navItems = [
    ['kanban', 'Pipeline', ICON.kanban],
    ['leads', 'Leads', ICON.leads],
    ['stats', 'Estadísticas', ICON.stats],
    ['users', 'Usuarios', ICON.users],
    ['redirects', 'Redirecciones', ICON.redirect],
    ['config', 'Configuración', ICON.config],
  ].filter(([k]) => isAdmin() || !ADMIN_VIEWS.includes(k));
  // Bloquea el acceso directo del comercial a vistas restringidas
  if (!isAdmin() && ADMIN_VIEWS.includes(state.view)) state.view = 'kanban';
  root.innerHTML = `
  <div class="app">
    <aside class="sidebar" id="sidebar">
      <div class="side-logo">
        <span class="mark"><img src="assets/favicon.png" alt=""></span>
        <span><b>JKD Legacy</b><span>Backoffice CRM</span></span>
      </div>
      <nav id="nav">
        ${navItems.map(([k, label, icon]) => `
          <button class="nav-item ${state.view === k || (state.view === 'leadDetail' && k === 'leads') ? 'active' : ''}" data-view="${k}">
            ${icon}<span>${label}</span>${k === 'leads' ? `<span class="badge" id="badge-leads"></span>` : ''}
          </button>`).join('')}
      </nav>
      <div class="side-foot">
        <div class="side-user">
          <span class="avatar">${initials(state.me.name)}</span>
          <span><span class="nm">${esc(state.me.name)}</span><span class="rl">${roleLabel(state.me.role)}</span></span>
        </div>
        <button class="nav-item" id="logout">${ICON.out}<span>Cerrar sesión</span></button>
      </div>
    </aside>
    <main class="main">
      ${state.me.impersonating ? `<div class="imp-bar">
        <span class="imp-msg">${ICON.eye} Estás viendo el CRM como <b>${esc(state.me.name)}</b> · ${roleLabel(state.me.role)}</span>
        <button class="btn btn-sm imp-back" id="stop-imp">Volver a ${esc(state.me.impersonating.name)} →</button>
      </div>` : ''}
      <div id="view"></div>
    </main>
  </div>
  <div class="modal-bg" id="modal"></div>`;

  $('#nav').addEventListener('click', (e) => {
    const b = e.target.closest('.nav-item'); if (!b) return;
    // La vista queda guardada en el hash → al recargar (F5) se mantiene
    if (location.hash === '#' + b.dataset.view) { state.view = b.dataset.view; renderApp(); }
    else location.hash = b.dataset.view;
  });
  $('#logout').addEventListener('click', async () => { await api('POST', '/api/auth/logout'); location.reload(); });
  $('#stop-imp')?.addEventListener('click', async () => {
    try { await api('POST', '/api/auth/stop-impersonate'); location.reload(); }
    catch (e) { toast('No se pudo volver a tu cuenta', 'err'); }
  });

  $('#badge-leads').textContent = state.leads.length || '';
  const views = { kanban: viewKanban, leads: viewLeads, stats: viewStats, users: viewUsers, redirects: viewRedirects, config: viewSettings, leadDetail: () => viewLeadDetail(state.detailId) };
  (views[state.view] || viewKanban)();
}

// ============================================================
//  KANBAN
// ============================================================
async function viewKanban() {
  const v = $('#view');
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Pipeline de conversión</span><h1>Del registro a la matrícula</h1></div>
      <div class="tools">
        <div class="search">${ICON.search}<input id="k-search" placeholder="Buscar lead…" value="${esc(state.q)}"></div>
        <button class="btn btn-ghost btn-sm" id="new-lead">+ Lead manual</button>
      </div>
    </div>
    <div class="kanban" id="kanban"></div>`;

  $('#new-lead').addEventListener('click', openNewLead);
  $('#k-search').addEventListener('input', (e) => { state.q = e.target.value; paintKanban(); });
  await loadLeads();
  paintKanban();
}

const KANBAN_BLOCK = 10; // los leads se cargan en bloques de 10 por columna

function paintKanban() {
  const board = $('#kanban'); if (!board) return;
  const q = state.q.toLowerCase();
  const leads = state.leads.filter((l) => !q || `${fullName(l)} ${l.email} ${l.phone}`.toLowerCase().includes(q));
  board.innerHTML = Object.keys(STATUS_META).map((st) => {
    const items = leads.filter((l) => l.status === st);
    const m = STATUS_META[st];
    return `
    <div class="col" data-status="${st}">
      <div class="col-head">
        <span class="col-dot" style="background:${m.color}"></span>
        <h3>${m.label}</h3><span class="cnt">${items.length}</span>
      </div>
      <div class="col-body" data-status="${st}">${colBodyHTML(st, items)}</div>
    </div>`;
  }).join('');
  wireDnD();
  board.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => { if (!c.dataset.dragged) openLead(Number(c.dataset.id)); }));
  wireKanbanMore(board, leads);
}

// Renderiza solo los primeros N (bloque) de una columna + botón "ver más"
function colBodyHTML(st, items) {
  if (!items.length) return `<div class="col-empty">—</div>`;
  const limit = state.kLimit[st] || KANBAN_BLOCK;
  const shown = items.slice(0, limit);
  const rest = items.length - shown.length;
  const more = rest > 0
    ? `<button class="col-more" data-status="${st}">↓ Ver ${Math.min(KANBAN_BLOCK, rest)} más · ${rest} restante${rest === 1 ? '' : 's'}</button>`
    : '';
  return shown.map(cardHTML).join('') + more;
}

// Botón "ver 10 más" + carga incremental al llegar al final del scroll de cada columna
function wireKanbanMore(board, leads) {
  const bump = (st) => {
    const total = leads.filter((l) => l.status === st).length;
    const cur = state.kLimit[st] || KANBAN_BLOCK;
    if (cur >= total) return;
    state.kLimit[st] = cur + KANBAN_BLOCK;
    const scrolls = {};
    board.querySelectorAll('.col-body').forEach((b) => (scrolls[b.dataset.status] = b.scrollTop));
    paintKanban();
    const nb = $('#kanban');
    nb && nb.querySelectorAll('.col-body').forEach((b) => { if (scrolls[b.dataset.status] != null) b.scrollTop = scrolls[b.dataset.status]; });
  };
  board.querySelectorAll('.col-more').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.stopPropagation(); bump(btn.dataset.status); }));
  board.querySelectorAll('.col-body').forEach((body) =>
    body.addEventListener('scroll', () => {
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 56) bump(body.dataset.status);
    }));
}

function cardHTML(l) {
  const loss = l.status === 'perdido' && l.loss_reason ? `<span class="chip loss">${esc(state.meta.lossReasons[l.loss_reason] || l.loss_reason)}</span>` : '';
  return `
  <div class="card" draggable="true" data-id="${l.id}">
    <div class="nm">${esc(fullName(l))}</div>
    <div class="meta"><span>${esc(l.location || '—')}</span><span>·</span><span>${fmtDate(l.created_at)}</span></div>
    <div class="foot">
      <span class="own">${l.owner_name ? `<span class="av">${initials(l.owner_name)}</span>${esc(l.owner_name.split(' ')[0])}` : '<span style="color:var(--mute)">Sin asignar</span>'}</span>
      ${loss || `<span class="src">${esc((l.source || '').toUpperCase())}</span>`}
    </div>
  </div>`;
}

function wireDnD() {
  let dragId = null;
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('dragstart', (e) => { dragId = Number(card.dataset.id); card.classList.add('dragging'); card.dataset.dragged = '1'; e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => { card.classList.remove('dragging'); setTimeout(() => delete card.dataset.dragged, 50); });
  });
  document.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const status = col.dataset.status;
      const lead = state.leads.find((l) => l.id === dragId);
      if (!lead || lead.status === status) return;
      if (status === 'perdido') {
        openLossModal(async (reason) => { await changeStatus(dragId, 'perdido', reason); });
      } else {
        await changeStatus(dragId, status);
      }
    });
  });
}

async function changeStatus(id, status, loss_reason) {
  try {
    await api('PATCH', `/api/leads/${id}/status`, { status, loss_reason });
    await loadLeads();
    if (state.view === 'kanban') paintKanban();
    else if (state.view === 'leads') paintLeads();
    else if (state.view === 'leadDetail') viewLeadDetail(id);
    toast(`Lead → ${STATUS_META[status].label}`);
  } catch (e) { toast('No se pudo actualizar', 'err'); }
}

// ============================================================
//  LEADS TABLE
// ============================================================
async function viewLeads() {
  const v = $('#view');
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Base de datos</span><h1>Leads registrados</h1></div>
      <div class="tools">
        <div class="search">${ICON.search}<input id="l-search" placeholder="Buscar nombre, correo…" value="${esc(state.q)}"></div>
        <button class="btn btn-ghost btn-sm" id="new-lead">+ Lead manual</button>
      </div>
    </div>
    <div class="filters" id="filters">
      ${['all', ...Object.keys(STATUS_META)].map((f) => `<button class="fbtn ${state.filter === f ? 'active' : ''}" data-f="${f}">${f === 'all' ? 'Todos' : STATUS_META[f].label}</button>`).join('')}
    </div>
    <div class="panel"><div id="leads-table"></div></div>`;

  $('#new-lead').addEventListener('click', openNewLead);
  $('#filters').addEventListener('click', (e) => { const b = e.target.closest('.fbtn'); if (!b) return; state.filter = b.dataset.f; state.leadsPage = 1; renderApp(); });
  $('#l-search').addEventListener('input', (e) => { state.q = e.target.value; state.leadsPage = 1; paintLeads(); });
  await loadLeads();
  paintLeads();
}

const LEADS_PER_PAGE = 20; // tamaño de página de la tabla de leads

function paintLeads() {
  const wrap = $('#leads-table'); if (!wrap) return;
  const q = state.q.toLowerCase();
  let rows = state.leads.filter((l) => state.filter === 'all' || l.status === state.filter);
  if (q) rows = rows.filter((l) => `${fullName(l)} ${l.email} ${l.phone}`.toLowerCase().includes(q));
  if (!rows.length) { wrap.innerHTML = `<div class="empty"><div class="big">Sin leads</div>No hay registros con este filtro.</div>`; return; }

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / LEADS_PER_PAGE));
  state.leadsPage = Math.min(Math.max(1, state.leadsPage), pages);
  const start = (state.leadsPage - 1) * LEADS_PER_PAGE;
  const pageRows = rows.slice(start, start + LEADS_PER_PAGE);

  wrap.innerHTML = `<table><thead><tr>
    <th>Nombre</th><th>Contacto</th><th>Sede</th><th>Estado</th><th>Responsable</th><th>Registro</th>
    </tr></thead><tbody>
    ${pageRows.map((l) => `<tr data-id="${l.id}">
      <td><span class="lead-nm">${esc(fullName(l))}</span></td>
      <td>${esc(l.email || '—')}<br><span style="color:var(--mute)">${esc(l.phone || '')}</span></td>
      <td>${esc(l.location || '—')}</td>
      <td><span class="status-pill st-${l.status}"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>${STATUS_META[l.status].label}</span>
        ${l.status === 'perdido' && l.loss_reason ? `<br><span style="font-size:.66rem;color:var(--mute)">${esc(state.meta.lossReasons[l.loss_reason] || '')}</span>` : ''}</td>
      <td>${l.owner_name ? esc(l.owner_name) : '<span style="color:var(--mute)">—</span>'}</td>
      <td>${fmtDate(l.created_at)}</td>
    </tr>`).join('')}
  </tbody></table>${leadsPager(state.leadsPage, pages, total, start, pageRows.length)}`;

  wrap.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openLead(Number(tr.dataset.id))));
  wrap.querySelector('.pager')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pg]'); if (!b || b.disabled) return;
    const v = b.dataset.pg;
    state.leadsPage = v === 'prev' ? state.leadsPage - 1 : v === 'next' ? state.leadsPage + 1 : Number(v);
    paintLeads();
  });
}

// Ventana de números de página (con elipsis cuando hay muchas)
function pageWindow(cur, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out = [1];
  let lo = Math.max(2, cur - 1), hi = Math.min(pages - 1, cur + 1);
  if (cur <= 3) { lo = 2; hi = 4; }
  if (cur >= pages - 2) { lo = pages - 3; hi = pages - 1; }
  if (lo > 2) out.push('…');
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

function leadsPager(page, pages, total, start, count) {
  const from = total ? start + 1 : 0, to = start + count;
  const caption = `<span class="pager-count">Mostrando <b>${from}–${to}</b> de <b>${total}</b></span>`;
  if (pages <= 1) return `<div class="pager">${caption}</div>`;
  const nums = pageWindow(page, pages).map((n) => n === '…'
    ? `<span class="pager-gap">…</span>`
    : `<button class="pager-pg${n === page ? ' active' : ''}" data-pg="${n}">${n}</button>`).join('');
  return `<div class="pager">
    ${caption}
    <div class="pager-ctrl">
      <button class="pager-pg" data-pg="prev"${page === 1 ? ' disabled' : ''}>‹</button>
      ${nums}
      <button class="pager-pg" data-pg="next"${page === pages ? ' disabled' : ''}>›</button>
    </div>
  </div>`;
}

// ============================================================
//  LEAD DETAIL — full page view (hash-addressable: #lead-<id>)
// ============================================================
function openLead(id) {
  if (location.hash === `#lead-${id}`) { state.detailId = id; state.view = 'leadDetail'; renderApp(); }
  else location.hash = `lead-${id}`;
}
function backToLeads() {
  if (location.hash === '#leads') { state.view = 'leads'; renderApp(); }
  else location.hash = 'leads';
}

async function viewLeadDetail(id) {
  const v = $('#view');
  v.innerHTML = `<div class="empty">Cargando…</div>`;
  let lead;
  try { lead = await api('GET', `/api/leads/${id}`); }
  catch (e) {
    v.innerHTML = `<div class="empty"><div class="big">Lead no encontrado</div><button class="btn btn-ghost btn-sm" id="back" style="margin-top:14px">← Volver a Leads</button></div>`;
    $('#back')?.addEventListener('click', backToLeads); return;
  }
  const ownerOpts = ['<option value="">Sin asignar</option>', ...state.users.map((u) => `<option value="${u.id}" ${u.id === lead.owner_id ? 'selected' : ''}>${esc(u.name)}</option>`)].join('');
  const tel = (lead.phone || '').replace(/\s+/g, '');
  // WhatsApp needs digits only (no '+', spaces, parens). Normalize AU numbers to 61…
  let wa = (lead.phone || '').replace(/\D/g, '');
  if (wa.startsWith('0')) wa = '61' + wa.slice(1);
  else if (wa && !wa.startsWith('61')) wa = '61' + wa;

  v.innerHTML = `
    <div class="topbar">
      <div>
        <button class="backlink" id="back">← Volver a Leads</button>
        <h1 style="margin-top:6px">${esc(fullName(lead))}</h1>
        <div class="detail-sub">
          <span class="status-pill st-${lead.status}"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>${STATUS_META[lead.status].label}</span>
          <span>·</span><span>${esc((lead.source || '').toUpperCase())}</span>
          <span>·</span><span>Registro ${fmtDate(lead.created_at)}</span>
        </div>
      </div>
      <div class="tools">${isAdmin() ? '<button class="btn btn-ghost btn-sm" id="del">Eliminar</button>' : ''}</div>
    </div>

    <div class="ld-tabs" id="ld-tabs">
      <button data-t="perfil" class="active">Perfil</button>
      <button data-t="origen">Origen</button>
    </div>

    <div class="detail-grid">
      <div class="detail-main">
        <div id="tab-perfil">
        <div class="card-box">
          <div class="section-t">Información de contacto</div>
          <div class="kv">
            <div class="kv-row"><span class="k">Correo</span>${lead.email ? `<a class="v" href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>` : '<span class="v">—</span>'}</div>
            <div class="kv-row"><span class="k">Teléfono</span>${lead.phone ? `<a class="v" href="tel:${esc(tel)}">${esc(lead.phone)}</a>` : '<span class="v">—</span>'}</div>
            <div class="kv-row"><span class="k">Sede preferida</span><span class="v">${esc(lead.location || '—')}</span></div>
            <div class="kv-row"><span class="k">Experiencia</span><span class="v">${esc(lead.experience || '—')}</span></div>
            <div class="kv-row"><span class="k">Origen</span><span class="v">${esc(lead.source || '—')}</span></div>
            <div class="kv-row"><span class="k">Responsable</span><span class="v">${lead.owner_name ? esc(lead.owner_name) : 'Sin asignar'}</span></div>
            <div class="kv-row"><span class="k">Último cambio</span><span class="v">${fmtDateTime(lead.updated_at)}</span></div>
            <div class="kv-row"><span class="k">ID</span><span class="v">#${lead.id}</span></div>
          </div>
          ${lead.message ? `<div style="margin-top:18px"><div class="section-t">Mensaje / motivación</div><p style="font-size:.92rem;color:var(--dim);line-height:1.65">${esc(lead.message)}</p></div>` : ''}
        </div>

        <div class="card-box">
          <div class="section-t">Editar datos</div>
          <div class="form-row">
            <div class="field"><label>Nombre</label><input id="f-first" value="${esc(lead.first_name || '')}"></div>
            <div class="field"><label>Apellido</label><input id="f-last" value="${esc(lead.last_name || '')}"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Correo</label><input id="f-email" value="${esc(lead.email || '')}"></div>
            <div class="field"><label>Teléfono</label><input id="f-phone" value="${esc(lead.phone || '')}"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Sede preferida</label><input id="f-loc" value="${esc(lead.location || '')}"></div>
            <div class="field"><label>Responsable</label><select id="f-owner">${ownerOpts}</select></div>
          </div>
          <div class="field"><label>Experiencia</label><input id="f-exp" value="${esc(lead.experience || '')}"></div>
          <div class="field"><label>Mensaje / motivación</label><textarea id="f-msg">${esc(lead.message || '')}</textarea></div>
          <button class="btn btn-primary btn-sm" id="save">Guardar cambios</button>
        </div>

        <div class="card-box">
          <div class="section-t">Actividad</div>
          <div class="timeline">${(lead.events || []).slice().reverse().map(eventHTML).join('') || '<p style="color:var(--mute);font-size:.8rem">Sin eventos.</p>'}</div>
          <div class="note-add">
            <input id="note" placeholder="Añadir nota…">
            <button class="btn btn-ghost btn-sm" id="note-btn">Añadir</button>
          </div>
        </div>
        </div><!-- /tab-perfil -->

        <div id="tab-origen" hidden>
          <div class="card-box">
            <div class="section-t">Origen del lead — atribución (equipo de pauta)</div>
            ${attrHTML(lead)}
          </div>
        </div>
      </div>

      <aside class="detail-side">
        <div class="card-box">
          <div class="section-t">Estado en el pipeline</div>
          <div class="status-select" id="status-sel">
            ${Object.keys(STATUS_META).map((s) => `<button class="ss ${s} ${lead.status === s ? 'active' : ''}" data-s="${s}">${STATUS_META[s].label}</button>`).join('')}
          </div>
          ${lead.status === 'perdido' && lead.loss_reason ? `<p style="margin-top:12px;font-size:.8rem;color:var(--red)">Motivo de pérdida: <b>${esc(state.meta.lossReasons[lead.loss_reason] || lead.loss_reason)}</b></p>` : ''}
        </div>
        <div class="card-box">
          <div class="section-t">Acciones rápidas</div>
          <div style="display:flex;flex-direction:column;gap:9px">
            ${lead.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(lead.email)}" style="justify-content:center">✉ Enviar correo</a>` : ''}
            ${lead.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(tel)}" style="justify-content:center">☎ Llamar</a>` : ''}
            ${lead.phone ? `<a class="btn btn-ghost btn-sm" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" style="justify-content:center">WhatsApp</a>` : ''}
          </div>
        </div>
      </aside>
    </div>`;

  $('#back').addEventListener('click', backToLeads);
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este lead permanentemente?')) return;
    try { await api('DELETE', `/api/leads/${id}`); await loadLeads(); toast('Lead eliminado'); backToLeads(); }
    catch (e) { toast('No se pudo eliminar', 'err'); }
  });
  $('#status-sel').addEventListener('click', (e) => {
    const b = e.target.closest('.ss'); if (!b) return;
    const s = b.dataset.s; if (s === lead.status) return;
    if (s === 'perdido') openLossModal((reason) => changeStatus(id, 'perdido', reason));
    else changeStatus(id, s);
  });
  $('#save').addEventListener('click', async () => {
    const body = {
      first_name: $('#f-first').value, last_name: $('#f-last').value, email: $('#f-email').value,
      phone: $('#f-phone').value, location: $('#f-loc').value, experience: $('#f-exp').value,
      message: $('#f-msg').value, owner_id: $('#f-owner').value ? Number($('#f-owner').value) : null,
    };
    try { await api('PATCH', `/api/leads/${id}`, body); await loadLeads(); toast('Cambios guardados'); viewLeadDetail(id); }
    catch (e) { toast('Error al guardar', 'err'); }
  });
  const addNote = async () => {
    const note = $('#note').value.trim(); if (!note) return;
    try { await api('POST', `/api/leads/${id}/note`, { note }); toast('Nota añadida'); viewLeadDetail(id); }
    catch (e) { toast('Error', 'err'); }
  };
  $('#note-btn').addEventListener('click', addNote);
  $('#note').addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });

  // Pestañas Perfil / Origen
  $('#ld-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    $('#ld-tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    $('#tab-perfil').hidden = b.dataset.t !== 'perfil';
    $('#tab-origen').hidden = b.dataset.t !== 'origen';
  });
  $('#attr-copy')?.addEventListener('click', () => {
    let a = {}; try { a = JSON.parse(lead.attribution || '{}'); } catch (e) {}
    const lines = Object.entries(a).filter(([k]) => k !== 'user_agent').map(([k, v]) => `${k}: ${v}`);
    navigator.clipboard.writeText(`Lead #${lead.id} — ${fullName(lead)}\n` + lines.join('\n')).then(() => toast('Resumen copiado')).catch(() => toast('No se pudo copiar', 'err'));
  });
}

// Atribución / origen del lead (para el equipo de pauta)
function attrHTML(lead) {
  let a; try { a = JSON.parse(lead.attribution || 'null'); } catch (e) { a = null; }
  if (!a) return '<div class="empty" style="padding:28px 10px"><div class="big">Sin datos de origen</div>Lead manual o registrado antes de activar la captura de atribución.</div>';
  const linkv = (u) => u ? `<a class="v" href="${esc(u)}" target="_blank" rel="noopener" style="word-break:break-all">${esc(u)}</a>` : '<span class="v">—</span>';
  const row = (label, val, isLink) => val ? `<div class="kv-row"><span class="k">${label}</span>${isLink ? linkv(val) : `<span class="v" style="word-break:break-word;text-align:right">${esc(val)}</span>`}</div>` : '';
  const rows = [
    row('Campaña', a.utm_campaign), row('Fuente (source)', a.utm_source), row('Medio (medium)', a.utm_medium),
    row('Término (term)', a.utm_term), row('Contenido (content)', a.utm_content),
    row('Google Click ID', a.gclid), row('Meta Click ID', a.fbclid), row('Microsoft Click ID', a.msclkid), row('TikTok Click ID', a.ttclid),
    row('Referente', a.referrer, true), row('URL de origen (landing)', a.landing_url, true), row('URL de envío', a.submit_url, true),
    row('Dispositivo', a.device), row('Idioma', a.language), row('Primer contacto', a.first_seen ? fmtDateTime(a.first_seen) : ''),
  ].join('');
  return `
    <div class="attr-channel"><span class="attr-channel-lab">Canal de adquisición</span><span class="attr-channel-val">${esc(a.channel || '—')}</span></div>
    <div class="kv">${rows}</div>
    ${a.user_agent ? `<div style="margin-top:16px"><div class="section-t">Navegador (user agent)</div><p style="font-size:.76rem;color:var(--mute);word-break:break-word;line-height:1.5">${esc(a.user_agent)}</p></div>` : ''}
    <button class="btn btn-ghost btn-sm" id="attr-copy" style="margin-top:16px">Copiar resumen</button>`;
}

function eventHTML(ev) {
  let txt = '', cls = ev.type;
  if (ev.type === 'created') txt = `Lead registrado${ev.note ? ` · ${esc(ev.note)}` : ''}`;
  else if (ev.type === 'status') { cls = ev.to_status; txt = `Movido a <b style="color:var(--text)">${STATUS_META[ev.to_status]?.label || ev.to_status}</b>${ev.loss_reason ? ` — ${esc(state.meta.lossReasons[ev.loss_reason] || ev.loss_reason)}` : ''}`; }
  else if (ev.type === 'note') txt = `📝 ${esc(ev.note)}`;
  return `<div class="tl ${cls}"><span class="dot"></span><div class="body"><div class="t">${txt}</div><div class="d">${fmtDateTime(ev.created_at)}${ev.user_name ? ' · ' + esc(ev.user_name) : ''}</div></div></div>`;
}

// ============================================================
//  MODALS — loss reason / new lead / new user
// ============================================================
function modal(html) { const m = $('#modal'); m.innerHTML = `<div class="modal">${html}</div>`; m.classList.add('open'); return m; }
function closeModal() { $('#modal')?.classList.remove('open'); }

function openLossModal(onConfirm) {
  const opts = Object.entries(state.meta.lossReasons).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const m = modal(`
    <h2>Marcar como Perdido</h2>
    <p class="desc">Selecciona el motivo de pérdida para el reporte.</p>
    <div class="field"><label>Motivo</label><select id="loss-r">${opts}</select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="loss-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="loss-ok">Confirmar pérdida</button>
    </div>`);
  $('#loss-cancel').addEventListener('click', () => { closeModal(); if (state.view === 'kanban') paintKanban(); });
  $('#loss-ok').addEventListener('click', () => { const r = $('#loss-r').value; closeModal(); onConfirm(r); });
}

function openNewLead() {
  const ownerOpts = state.users.map((u) => `<option value="${u.id}" ${u.id === state.me.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  modal(`
    <h2>Nuevo lead</h2>
    <p class="desc">Registro manual de un interesado.</p>
    <div class="form-row">
      <div class="field"><label>Nombre</label><input id="n-first"></div>
      <div class="field"><label>Apellido</label><input id="n-last"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Correo</label><input id="n-email" type="email"></div>
      <div class="field"><label>Teléfono</label><input id="n-phone"></div>
    </div>
    <div class="field"><label>Sede preferida</label><input id="n-loc" placeholder="Melbourne · Adelaide…"></div>
    <div class="field"><label>Responsable</label><select id="n-owner">${ownerOpts}</select></div>
    <div class="field"><label>Mensaje</label><textarea id="n-msg"></textarea></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="n-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="n-ok">Crear lead</button>
    </div>`);
  $('#n-cancel').addEventListener('click', closeModal);
  $('#n-ok').addEventListener('click', async () => {
    const body = { first_name: $('#n-first').value, last_name: $('#n-last').value, email: $('#n-email').value, phone: $('#n-phone').value, location: $('#n-loc').value, message: $('#n-msg').value, owner_id: Number($('#n-owner').value), source: 'manual' };
    if (!body.first_name && !body.email) { toast('Falta nombre o correo', 'err'); return; }
    try { await api('POST', '/api/leads', body); closeModal(); await loadLeads(); if (state.view === 'kanban') paintKanban(); else if (state.view === 'leads') paintLeads(); toast('Lead creado'); }
    catch (e) { toast('Error al crear', 'err'); }
  });
}

// ============================================================
//  USERS
// ============================================================
async function viewUsers() {
  const v = $('#view');
  state.users = await api('GET', '/api/users');
  const isAdmin = state.me.role === 'admin';
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Equipo</span><h1>Usuarios del CRM</h1></div>
      <div class="tools">${isAdmin ? '<button class="btn btn-primary btn-sm" id="new-user">+ Crear usuario</button>' : ''}</div>
    </div>
    ${!isAdmin ? '<p style="color:var(--mute);font-size:.82rem;margin-bottom:14px">Solo los administradores pueden crear o editar usuarios.</p>' : ''}
    <div class="panel"><table><thead><tr>
      <th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th>${isAdmin ? '<th></th>' : ''}
    </tr></thead><tbody>
    ${state.users.map((u) => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px"><span class="avatar" style="width:30px;height:30px;font-size:.8rem">${initials(u.name)}</span><span class="lead-nm" style="font-size:.92rem">${esc(u.name)}</span></div></td>
      <td>${esc(u.email)}</td>
      <td><span class="status-pill ${u.role === 'admin' ? 'st-ganado' : 'st-registrado'}">${roleLabel(u.role)}</span></td>
      <td>${u.active ? '<span style="color:var(--green)">● Activo</span>' : '<span style="color:var(--mute)">○ Inactivo</span>'}</td>
      ${isAdmin ? `<td style="text-align:right;white-space:nowrap">
        ${u.id !== state.me.id ? `<button class="btn btn-ghost btn-sm" data-imp="${u.id}">Entrar como</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-edit="${u.id}">Editar</button>
      </td>` : ''}
    </tr>`).join('')}
    </tbody></table></div>`;

  if (isAdmin) {
    $('#new-user')?.addEventListener('click', openNewUser);
    v.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditUser(state.users.find((u) => u.id === Number(b.dataset.edit)))));
    v.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', async () => {
      const u = state.users.find((x) => x.id === Number(b.dataset.imp));
      if (!confirm(`¿Entrar a la plataforma como ${u.name}? Navegarás el CRM con los permisos de ${roleLabel(u.role)}. Podrás volver a tu cuenta cuando quieras.`)) return;
      try { await api('POST', `/api/users/${b.dataset.imp}/impersonate`); location.reload(); }
      catch (e) { toast('No se pudo entrar como usuario', 'err'); }
    }));
  }
}

function openNewUser() {
  modal(`
    <h2>Crear usuario</h2>
    <p class="desc">Podrá acceder con su correo vía enlace mágico.</p>
    <div class="field"><label>Nombre completo</label><input id="u-name"></div>
    <div class="field"><label>Correo</label><input id="u-email" type="email"></div>
    <div class="field"><label>Rol</label><select id="u-role"><option value="comercial">Comercial</option><option value="admin">Administrador</option></select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="u-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="u-ok">Crear</button>
    </div>`);
  $('#u-cancel').addEventListener('click', closeModal);
  $('#u-ok').addEventListener('click', async () => {
    const body = { name: $('#u-name').value, email: $('#u-email').value, role: $('#u-role').value };
    if (!body.name || !body.email) { toast('Nombre y correo requeridos', 'err'); return; }
    try { await api('POST', '/api/users', body); closeModal(); viewUsers(); toast('Usuario creado'); }
    catch (e) { toast(e.message === 'email already exists' ? 'Ese correo ya existe' : 'Error al crear', 'err'); }
  });
}

function openEditUser(u) {
  if (!u) return;
  modal(`
    <h2>Editar usuario</h2>
    <p class="desc">Actualiza los datos y el rol. El comercial no puede eliminar leads ni ver Usuarios/Configuración.</p>
    <div class="field"><label>Nombre completo</label><input id="u-name" value="${esc(u.name)}"></div>
    <div class="field"><label>Correo</label><input id="u-email" type="email" value="${esc(u.email)}"></div>
    <div class="field"><label>Rol</label><select id="u-role">
      <option value="comercial" ${u.role === 'comercial' ? 'selected' : ''}>Comercial</option>
      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
    </select></div>
    <div class="field"><label>Estado</label><select id="u-active">
      <option value="1" ${u.active ? 'selected' : ''}>Activo</option>
      <option value="0" ${!u.active ? 'selected' : ''}>Inactivo</option>
    </select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="u-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="u-ok">Guardar cambios</button>
    </div>`);
  $('#u-cancel').addEventListener('click', closeModal);
  $('#u-ok').addEventListener('click', async () => {
    const body = { name: $('#u-name').value, email: $('#u-email').value, role: $('#u-role').value, active: Number($('#u-active').value) };
    if (!body.name || !body.email) { toast('Nombre y correo requeridos', 'err'); return; }
    try { await api('PATCH', `/api/users/${u.id}`, body); closeModal(); viewUsers(); toast('Usuario actualizado'); }
    catch (e) { toast(e.message === 'email already exists' ? 'Ese correo ya existe' : 'Error al guardar', 'err'); }
  });
}

// ============================================================
//  REDIRECCIONES 301/302 (solo admin)
// ============================================================
async function viewRedirects() {
  const v = $('#view');
  let rows = [];
  try { rows = await api('GET', '/api/redirects'); }
  catch (e) { v.innerHTML = '<div class="empty"><div class="big">Acceso restringido</div>Solo los administradores pueden gestionar redirecciones.</div>'; return; }
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">SEO</span><h1>Redirecciones 301</h1></div>
      <div class="tools"><button class="btn btn-primary btn-sm" id="new-rd">+ Crear redirección</button></div>
    </div>
    <p style="color:var(--mute);font-size:.82rem;margin-bottom:16px;max-width:74ch;line-height:1.6">Envía una ruta antigua a una nueva con un <b>301</b> (permanente) o <b>302</b> (temporal). Ideal al renombrar páginas: conservas el posicionamiento y no rompes enlaces externos. No se permite redirigir <code>/</code>, <code>/crm</code> ni <code>/api</code>.</p>
    <div class="panel"><div id="rd-table"></div></div>`;
  $('#new-rd').addEventListener('click', openNewRedirect);
  paintRedirects(rows);
}

function paintRedirects(rows) {
  const wrap = $('#rd-table'); if (!wrap) return;
  if (!rows.length) { wrap.innerHTML = `<div class="empty"><div class="big">Sin redirecciones</div>Crea la primera con “+ Crear redirección”.</div>`; return; }
  wrap.innerHTML = `<table><thead><tr>
    <th>Origen</th><th>Destino</th><th>Tipo</th><th>Estado</th><th>Hits</th><th></th>
    </tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td><code class="rd-path">${esc(r.from_path)}</code></td>
      <td><span class="rd-arrow">→</span> <code class="rd-path">${esc(r.to_path)}</code></td>
      <td><span class="status-pill ${r.code === 301 ? 'st-ganado' : 'st-contactado'}">${r.code}</span></td>
      <td>${r.active ? '<span style="color:var(--green)">● Activa</span>' : '<span style="color:var(--mute)">○ Inactiva</span>'}</td>
      <td><span style="font-family:var(--mono);color:var(--dim)">${r.hits}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-ghost btn-sm" data-rd-edit="${r.id}">Editar</button>
        <button class="btn btn-ghost btn-sm" data-rd-del="${r.id}">Eliminar</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
  wrap.querySelectorAll('[data-rd-edit]').forEach((b) => b.addEventListener('click', () => openEditRedirect(rows.find((x) => x.id === Number(b.dataset.rdEdit)))));
  wrap.querySelectorAll('[data-rd-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta redirección?')) return;
    try { await api('DELETE', `/api/redirects/${b.dataset.rdDel}`); viewRedirects(); toast('Redirección eliminada'); }
    catch (e) { toast('No se pudo eliminar', 'err'); }
  }));
}

function redirectForm(r) {
  const isEdit = !!r;
  return `
    <h2>${isEdit ? 'Editar redirección' : 'Crear redirección'}</h2>
    <p class="desc">El origen es una ruta del sitio (ej. <code>/pagina-antigua</code>). El destino puede ser una ruta (<code>/the-way</code>) o una URL completa.</p>
    <div class="field"><label>Origen (ruta antigua)</label><input id="rd-from" placeholder="/pagina-antigua" value="${esc(r ? r.from_path : '')}"></div>
    <div class="field"><label>Destino</label><input id="rd-to" placeholder="/pagina-nueva" value="${esc(r ? r.to_path : '')}"></div>
    <div class="field"><label>Tipo</label><select id="rd-code">
      <option value="301" ${!r || r.code === 301 ? 'selected' : ''}>301 — Permanente (recomendado para SEO)</option>
      <option value="302" ${r && r.code === 302 ? 'selected' : ''}>302 — Temporal</option>
    </select></div>
    ${isEdit ? `<div class="field"><label>Estado</label><select id="rd-active">
      <option value="1" ${r.active ? 'selected' : ''}>Activa</option>
      <option value="0" ${!r.active ? 'selected' : ''}>Inactiva</option>
    </select></div>` : ''}
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="rd-cancel">Cancelar</button>
      <button class="btn btn-primary btn-sm" id="rd-ok">${isEdit ? 'Guardar' : 'Crear'}</button>
    </div>`;
}

function redirErr(e) {
  const m = String(e && e.message || '');
  if (m.includes('ya existe')) return 'Ya existe una redirección para ese origen';
  if (m.includes('iguales')) return 'El origen y el destino no pueden ser iguales';
  if (m.includes('no permitido')) return 'Origen no permitido (no uses /, /crm o /api)';
  return 'No se pudo guardar la redirección';
}

function openNewRedirect() {
  modal(redirectForm(null));
  $('#rd-cancel').addEventListener('click', closeModal);
  $('#rd-ok').addEventListener('click', async () => {
    const body = { from_path: $('#rd-from').value, to_path: $('#rd-to').value, code: Number($('#rd-code').value) };
    if (!body.from_path.trim() || !body.to_path.trim()) { toast('Origen y destino requeridos', 'err'); return; }
    try { await api('POST', '/api/redirects', body); closeModal(); viewRedirects(); toast('Redirección creada'); }
    catch (e) { toast(redirErr(e), 'err'); }
  });
}

function openEditRedirect(r) {
  if (!r) return;
  modal(redirectForm(r));
  $('#rd-cancel').addEventListener('click', closeModal);
  $('#rd-ok').addEventListener('click', async () => {
    const body = { from_path: $('#rd-from').value, to_path: $('#rd-to').value, code: Number($('#rd-code').value), active: Number($('#rd-active').value) };
    if (!body.from_path.trim() || !body.to_path.trim()) { toast('Origen y destino requeridos', 'err'); return; }
    try { await api('PATCH', `/api/redirects/${r.id}`, body); closeModal(); viewRedirects(); toast('Redirección actualizada'); }
    catch (e) { toast(redirErr(e), 'err'); }
  });
}

// ============================================================
//  SETTINGS — configuración del sitio (componentes externos)
// ============================================================
const TAG_FIELDS = [
  ['ga4_id', 'Google Analytics 4', 'G-XXXXXXXXXX', 'Measurement ID de GA4.'],
  ['google_tag_id', 'Google Tag (Site Kit)', 'GT-XXXXXXX', 'Etiqueta de Google que envuelve GA4.'],
  ['gtm_id', 'Google Tag Manager', 'GTM-XXXXXXX', 'ID del contenedor GTM (opcional).'],
  ['meta_pixel_id', 'Meta (Facebook) Pixel', '918178380081272', 'ID numérico del píxel de Meta.'],
  ['google_ads_id', 'Google Ads (Conversión)', 'AW-XXXXXXXXX', 'ID de conversión de Google Ads (opcional).'],
  ['tiktok_pixel_id', 'TikTok Pixel', 'CXXXXXXXXXXXXXXXXX', 'ID del píxel de TikTok (opcional).'],
];
const VERIFY_FIELDS = [
  ['google_site_verification', 'Google Search Console', 'código de verificación', 'Solo el valor "content" del meta google-site-verification.'],
  ['facebook_domain_verification', 'Meta / Facebook (dominio)', 'código de verificación', 'Valor de facebook-domain-verification.'],
  ['bing_site_verification', 'Bing Webmaster', 'código msvalidate.01', 'Opcional.'],
];
const TEXT_FIELDS = [['eyebrow', 'Etiqueta', false], ['heading', 'Título', false], ['intro', 'Intro', true], ['submit', 'Texto del botón', false], ['privacy', 'Aviso de privacidad', false]];

async function viewSettings() {
  const v = $('#view');
  v.innerHTML = `<div class="empty">Cargando…</div>`;
  let s; try { s = await api('GET', '/api/settings'); } catch (e) { v.innerHTML = '<div class="empty">Error al cargar.</div>'; return; }
  const isAdmin = state.me.role === 'admin';
  const dis = isAdmin ? '' : 'disabled';
  const on = s.tracking_enabled === '1';
  let _fc = {}; try { _fc = JSON.parse(s.form_config) || {}; } catch (e) {}
  const txt = _fc.text || {};

  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Configuración del sitio</span><h1>Componentes externos</h1></div>
    </div>
    ${!isAdmin ? '<p style="color:var(--mute);font-size:.82rem;margin-bottom:14px">Solo los administradores pueden editar la configuración.</p>' : ''}
    <div class="detail-grid">
      <div class="detail-main">
        <div class="card-box">
          <div class="section-t">Formulario de captura (web)</div>
          <p class="field-help" style="margin:-2px 0 16px">Edita los textos y campos del formulario del sitio (<code class="mono">/join-the-family</code>). Bilingüe EN/ES.</p>
          ${TEXT_FIELDS.map(([k, label, multi]) => `
            <div class="form-row">
              <div class="field"><label>${label} (EN)</label>${multi ? `<textarea id="ft-${k}-en" rows="2" ${dis}>${esc(txt[k + '_en'] || '')}</textarea>` : `<input id="ft-${k}-en" value="${esc(txt[k + '_en'] || '')}" ${dis}>`}</div>
              <div class="field"><label>${label} (ES)</label>${multi ? `<textarea id="ft-${k}-es" rows="2" ${dis}>${esc(txt[k + '_es'] || '')}</textarea>` : `<input id="ft-${k}-es" value="${esc(txt[k + '_es'] || '')}" ${dis}>`}</div>
            </div>`).join('')}
          <div class="fb-bar">
            <div><div class="fb-title">Campos del Formulario</div><div class="fb-sub">Campos que el visitante completa antes de enviar la solicitud</div></div>
            <div class="fb-bar-actions">
              <div class="fb-langs" id="fb-langs"><button type="button" data-fl="en" class="active">EN</button><button type="button" data-fl="es">ES</button></div>
              ${isAdmin ? '<button type="button" class="btn-add" id="fb-add">+ Agregar Campo</button>' : ''}
            </div>
          </div>
          <div id="fb-list"></div>
          ${isAdmin ? '<button class="btn btn-primary btn-sm" id="fb-save" style="margin-top:14px">Guardar formulario</button>' : ''}
        </div>

        <div class="card-box">
          <div class="section-t">Analítica y marketing</div>
          <div class="set-toggle">
            <div><div class="lab">Activar etiquetas en el sitio</div><div style="font-size:.74rem;color:var(--mute)">Si lo apagas, no se carga ninguna herramienta en el sitio público.</div></div>
            <label class="switch"><input type="checkbox" id="set-tracking_enabled" ${on ? 'checked' : ''} ${dis}><span></span></label>
          </div>
          ${TAG_FIELDS.map(([k, label, ph, help]) => `
            <div class="field">
              <label>${label}</label>
              <input id="set-${k}" value="${esc(s[k] || '')}" placeholder="${ph}" autocomplete="off" spellcheck="false" ${dis}>
              <div class="field-help">${help}</div>
            </div>`).join('')}
        </div>

        <div class="card-box">
          <div class="section-t">Verificación de dominio</div>
          ${VERIFY_FIELDS.map(([k, label, ph, help]) => `
            <div class="field">
              <label>${label}</label>
              <input id="set-${k}" value="${esc(s[k] || '')}" placeholder="${ph}" autocomplete="off" spellcheck="false" ${dis}>
              <div class="field-help">${help}</div>
            </div>`).join('')}
        </div>

        <div class="card-box">
          <div class="section-t">HTML personalizado en &lt;head&gt;</div>
          <div class="field">
            <textarea id="set-custom_head" rows="6" placeholder="<!-- Pega aquí etiquetas para el <head>: scripts, metas, verificaciones de otras herramientas… -->" spellcheck="false" ${dis} style="font-family:var(--mono);font-size:.8rem;line-height:1.5">${esc(s.custom_head || '')}</textarea>
            <div class="field-help">Se inyecta tal cual en el &lt;head&gt; de todas las páginas públicas (solo admin) — para cualquier herramienta futura.</div>
          </div>
        </div>

        ${isAdmin ? '<button class="btn btn-primary btn-sm" id="set-save">Guardar configuración</button>' : ''}
      </div>
      <aside class="detail-side">
        <div class="card-box">
          <div class="section-t">Cómo funciona</div>
          <p style="font-size:.86rem;color:var(--dim);line-height:1.6">Estos IDs alimentan el <code class="mono">analytics.js</code> del sitio público vía <code class="mono">/api/public/site-config</code>. Lo que cambies aquí se aplica en el sitio <b>sin tocar código</b>.</p>
          <p style="font-size:.82rem;color:var(--mute);line-height:1.6;margin-top:12px">Las etiquetas no se disparan en <b>localhost</b> (pruebas), solo en el dominio real. Deja un campo vacío para no cargar esa herramienta.</p>
        </div>
        <div class="card-box">
          <div class="section-t">Importado del sitio actual</div>
          <p style="font-size:.82rem;color:var(--dim);line-height:1.6">GA4 <b>G-MXNZZXDP2E</b> · Google Tag <b>GT-M3VXNNZ</b> · Meta Pixel <b>918178380081272</b> (desde jkdlegacy.com.au).</p>
        </div>
      </aside>
    </div>`;

  if (isAdmin) {
    $('#set-save').addEventListener('click', async () => {
      const body = { tracking_enabled: $('#set-tracking_enabled').checked ? '1' : '0' };
      TAG_FIELDS.concat(VERIFY_FIELDS).forEach(([k]) => { body[k] = $('#set-' + k).value.trim(); });
      body.custom_head = $('#set-custom_head').value;
      try { await api('PUT', '/api/settings', body); toast('Configuración guardada'); }
      catch (e) { toast(e.message === 'admin only' ? 'Solo administradores' : 'Error al guardar', 'err'); }
    });
  }

  // ----- Constructor del formulario (compacto · bilingüe · arrastrar) -----
  let formState = (_fc.fields || []).map((f) => Object.assign({}, f));
  let fbLang = 'en';
  const FB_TYPES = [['text', 'Texto'], ['email', 'Email'], ['tel', 'Teléfono'], ['select', 'Selección'], ['textarea', 'Mensaje']];
  const slugKey = (label, i) => (String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'campo') + '_' + (i + 1);
  function fbSync() {
    [...document.querySelectorAll('#fb-list .fbf')].forEach((row) => {
      const f = formState[Number(row.dataset.i)]; if (!f) return;
      const g = (k) => row.querySelector(`[data-k="${k}"]`);
      f.type = g('type').value;
      f.required = g('required').checked;
      const lk = fbLang === 'es' ? 'labelEs' : 'label', pk = fbLang === 'es' ? 'placeholderEs' : 'placeholder';
      if (g(lk)) f[lk] = g(lk).value;
      if (g(pk)) f[pk] = g(pk).value;
      if (f.type === 'select') { const ok = fbLang === 'es' ? 'optionsEs' : 'options', oel = g(ok); if (oel) f[ok] = oel.value.split(',').map((x) => x.trim()).filter(Boolean); }
      if (!f.key) f.key = slugKey(f.label || f.labelEs, formState.indexOf(f));
    });
  }
  function renderFB() {
    const host = $('#fb-list'); if (!host) return;
    const lk = fbLang === 'es' ? 'labelEs' : 'label', pk = fbLang === 'es' ? 'placeholderEs' : 'placeholder', ok = fbLang === 'es' ? 'optionsEs' : 'options';
    host.innerHTML = formState.map((f, i) => `
      <div class="fbf" data-i="${i}" ${isAdmin ? 'draggable="true"' : ''}>
        ${isAdmin ? '<span class="fbf-drag" title="Arrastrar para reordenar">⠿</span>' : ''}
        <input class="fbf-in fbf-label" data-k="${lk}" value="${esc(f[lk] || '')}" placeholder="Etiqueta" ${dis}>
        <select class="fbf-in fbf-type" data-k="type" ${dis}>${FB_TYPES.map(([vv, ll]) => `<option value="${vv}" ${f.type === vv ? 'selected' : ''}>${ll}</option>`).join('')}</select>
        <input class="fbf-in fbf-ph" data-k="${pk}" value="${esc(f[pk] || '')}" placeholder="Placeholder…" ${dis}>
        <label class="fbf-req"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''} ${dis}> Req.</label>
        ${isAdmin ? '<button type="button" class="fbf-del" data-act="del" title="Eliminar">✕</button>' : ''}
        ${f.type === 'select' ? `<div class="fbf-opts"><input class="fbf-in" data-k="${ok}" value="${esc((f[ok] || []).join(', '))}" placeholder="Opciones separadas por coma (${fbLang.toUpperCase()})" ${dis}></div>` : ''}
      </div>`).join('') || '<p class="field-help">Sin campos. Agrega el primero.</p>';
  }
  renderFB();
  if (isAdmin) {
    $('#fb-langs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-fl]'); if (!b || b.dataset.fl === fbLang) return;
      fbSync(); fbLang = b.dataset.fl;
      $('#fb-langs').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x.dataset.fl === fbLang));
      renderFB();
    });
    $('#fb-list').addEventListener('click', (e) => {
      const del = e.target.closest('[data-act="del"]'); if (!del) return;
      fbSync(); formState.splice(Number(del.closest('.fbf').dataset.i), 1); renderFB();
    });
    $('#fb-list').addEventListener('change', (e) => { if (e.target.matches('[data-k="type"]')) { fbSync(); renderFB(); } });
    let dragI = null;
    $('#fb-list').addEventListener('dragstart', (e) => { const row = e.target.closest('.fbf'); if (!row) return; dragI = Number(row.dataset.i); e.dataTransfer.effectAllowed = 'move'; });
    $('#fb-list').addEventListener('dragover', (e) => { e.preventDefault(); const row = e.target.closest('.fbf'); $('#fb-list').querySelectorAll('.fbf').forEach((x) => x.classList.toggle('drag-over', x === row)); });
    $('#fb-list').addEventListener('drop', (e) => {
      e.preventDefault(); const row = e.target.closest('.fbf'); if (!row || dragI === null) return;
      const to = Number(row.dataset.i); if (to !== dragI) { fbSync(); const m = formState.splice(dragI, 1)[0]; formState.splice(to, 0, m); } dragI = null; renderFB();
    });
    $('#fb-list').addEventListener('dragend', () => { $('#fb-list').querySelectorAll('.fbf').forEach((x) => x.classList.remove('drag-over')); });
    $('#fb-add').addEventListener('click', () => { fbSync(); formState.push({ key: 'campo_' + (formState.length + 1), type: 'text', required: false, label: 'Nuevo Campo', labelEs: 'Nuevo Campo' }); renderFB(); });
    $('#fb-save').addEventListener('click', async () => {
      fbSync();
      const text = {}; TEXT_FIELDS.forEach(([k]) => { text[k + '_en'] = ($('#ft-' + k + '-en').value || '').trim(); text[k + '_es'] = ($('#ft-' + k + '-es').value || '').trim(); });
      try { await api('PUT', '/api/settings', { form_config: JSON.stringify({ text, fields: formState }) }); toast('Formulario guardado'); }
      catch (e) { toast(e.message === 'admin only' ? 'Solo administradores' : 'Error al guardar', 'err'); }
    });
  }
}

// ============================================================
//  STATS
// ============================================================
async function viewStats(month) {
  const v = $('#view');
  const s = await api('GET', '/api/stats' + (month ? `?month=${encodeURIComponent(month)}` : ''));
  const maxBar = Math.max(1, ...s.monthly.flatMap((m) => [m.created, m.won, m.lost]));
  const maxLoss = Math.max(1, ...s.lossBreakdown.map((l) => l.count));
  const funnelMax = Math.max(1, ...Object.values(s.funnel));
  const scoped = !!s.month;
  const monthOpts = ['<option value="">Todos los meses</option>',
    ...s.availableMonths.slice().reverse().map((m) => `<option value="${m}" ${m === s.month ? 'selected' : ''}>${fmtMonthLong(m)}</option>`)].join('');
  const kpis = scoped
    ? [['accent', 'Leads del mes', s.kpi.total], ['green', 'Ganados', s.kpi.won], ['red', 'Perdidos', s.kpi.lost], ['brass', 'Tasa de cierre', s.kpi.winRate, '%'], ['', 'En proceso', s.kpi.active]]
    : [['accent', 'Leads totales', s.kpi.total], ['', 'Nuevos este mes', s.kpi.newThisMonth], ['green', 'Ganados', s.kpi.won], ['brass', 'Tasa de cierre', s.kpi.winRate, '%'], ['', 'En proceso', s.kpi.active]];

  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Análisis</span><h1>Conversiones por mes</h1></div>
      <div class="tools"><label class="month-lab">Filtrar por mes</label><select id="stat-month" class="month-sel">${monthOpts}</select></div>
    </div>

    <div class="kpis">
      ${kpis.map(([cls, lab, val, suf]) => `<div class="kpi ${cls}"><div class="lab">${lab}</div><div class="val">${val}${suf ? `<small>${suf}</small>` : ''}</div></div>`).join('')}
    </div>

    <div class="stat-grid">
      <div class="card-box">
        <h3>Evolución mensual</h3>
        <p class="desc">Registrados vs. ganados vs. perdidos — últimos 6 meses.</p>
        <div class="chart">
          ${s.monthly.map((m) => `
            <div class="bar-group">
              <div class="bars">
                <div class="bar created" style="height:${(m.created / maxBar) * 100}%" data-v="${m.created}"></div>
                <div class="bar won" style="height:${(m.won / maxBar) * 100}%" data-v="${m.won}"></div>
                <div class="bar lost" style="height:${(m.lost / maxBar) * 100}%" data-v="${m.lost}"></div>
              </div>
              <span class="bar-x">${fmtMonth(m.month)}</span>
            </div>`).join('')}
        </div>
        <div class="legend">
          <span><i style="background:var(--accent)"></i>Registrados</span>
          <span><i style="background:var(--green)"></i>Ganados</span>
          <span><i style="background:var(--red)"></i>Perdidos</span>
        </div>
      </div>

      <div class="card-box">
        <h3>Tasa de conversión</h3>
        <p class="desc">% de ganados sobre resueltos (ganados + perdidos) por mes.</p>
        ${s.monthly.map((m) => `
          <div class="conv-row">
            <span class="m">${fmtMonth(m.month)}</span>
            <div class="conv-track"><div class="conv-fill" style="width:${m.conversion}%"></div></div>
            <span class="pct">${m.conversion}%</span>
          </div>`).join('')}
      </div>

      <div class="card-box">
        <h3>${scoped ? 'Embudo del mes' : 'Embudo actual'}</h3>
        <p class="desc">${scoped ? `Leads creados en ${fmtMonthLong(s.month)}, por estado.` : 'Distribución de todos los leads por estado.'}</p>
        <div class="funnel">
          ${Object.keys(STATUS_META).map((st) => `
            <div class="fn-row">
              <span class="lab"><span class="col-dot" style="background:${STATUS_META[st].color}"></span>${STATUS_META[st].label}</span>
              <div class="fn-bar" style="width:${Math.max(8, (s.funnel[st] / funnelMax) * 100)}%;background:${STATUS_META[st].color}">${s.funnel[st]}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card-box">
        <h3>Motivos de pérdida</h3>
        <p class="desc">Por qué se pierden los leads.</p>
        ${s.lossBreakdown.length ? s.lossBreakdown.map((l) => `
          <div class="loss-row">
            <span class="lab">${esc(l.label)}</span>
            <div class="loss-track"><div class="loss-fill" style="width:${(l.count / maxLoss) * 100}%"></div></div>
            <span class="n">${l.count}</span>
          </div>`).join('') : '<p style="color:var(--mute);font-size:.82rem">Aún no hay leads perdidos.</p>'}
      </div>
    </div>`;

  $('#stat-month')?.addEventListener('change', (e) => viewStats(e.target.value || undefined));
}

// ---------- data loaders ----------
async function loadLeads() { state.leads = await api('GET', '/api/leads'); const b = $('#badge-leads'); if (b) b.textContent = state.leads.length || ''; }

// ============================================================
//  BOOT
// ============================================================
(async function boot() {
  try {
    state.me = await api('GET', '/api/me');
    state.meta = await api('GET', '/api/meta');
    state.users = await api('GET', '/api/users');
    await loadLeads();
    window.addEventListener('hashchange', syncHash);
    syncHash(); // fija la vista desde el hash (o kanban por defecto) y renderiza
  } catch (e) {
    renderLogin();
  }
})();

// Hash routing: la vista actual vive en el hash (#stats, #users, #lead-<id>…) para
// que el reload conserve la página y el botón Atrás del navegador funcione.
function syncHash() {
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^lead-(\d+)$/);
  if (m) { state.detailId = Number(m[1]); state.view = 'leadDetail'; }
  else if (['kanban', 'leads', 'stats', 'users', 'redirects', 'config'].includes(h)) { state.view = h; }
  else if (state.view === 'leadDetail') { state.view = 'leads'; }
  renderApp();
}
