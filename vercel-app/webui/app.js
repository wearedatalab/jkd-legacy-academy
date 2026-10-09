// ============================================================
//  JKD Legacy CRM — frontend (vanilla)
// ============================================================
const $ = (s, r = document) => r.querySelector(s);
const root = $('#root');
const state = { me: null, meta: null, leads: [], users: [], tasks: [], view: 'kanban', filter: 'all', q: '', leadsPage: 1, kLimit: {} };

const STATUS_META = {
  registrado: { label: 'Registered', color: 'var(--accent)', cls: 'registrado' },
  contactado: { label: 'Contacted', color: 'var(--brass)', cls: 'contactado' },
  sesion_free: { label: 'Session Free', color: 'var(--violet)', cls: 'sesion_free' },
  ganado:     { label: 'Won',        color: 'var(--green)', cls: 'ganado' },
  perdido:    { label: 'Lost',       color: 'var(--red)',   cls: 'perdido' },
};

// Roles: administrador (acceso total) y comercial (restringido)
const ROLE_LABELS = { admin: 'Administrator', comercial: 'Sales' };
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
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
};

// ---------- utils ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => (n || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const fullName = (l) => `${l.first_name || ''} ${l.last_name || ''}`.trim() || '(no name)';
function fmtDate(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtDateTime(iso) { const d = new Date(iso); return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function fmtMonth(m) { const [y, mo] = m.split('-'); return new Date(y, mo - 1, 1).toLocaleDateString('en-AU', { month: 'short' }).replace('.', ''); }
function fmtMonthLong(m) { const [y, mo] = m.split('-'); const d = new Date(y, mo - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }); return d.charAt(0).toUpperCase() + d.slice(1); }

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
  const errCode = new URLSearchParams(location.search).get('e') || '';
  const alert = errCode === 'link'
    ? '<div class="login-alert">That sign-in link was invalid, already used, or expired. Links work once and expire 15 minutes after they are sent — request a new one below.</div>'
    : '';
  if (errCode) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {} }
  root.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo">
        <span class="mark"><img src="assets/favicon.png" alt=""></span>
        <span><b>JKD Legacy</b><span>Backoffice · CRM</span></span>
      </div>
      <h1>Panel access</h1>
      <p class="sub">Enter your email and we'll send you a magic link to sign in — no passwords.</p>
      ${alert}
      <form id="login-form">
        <div class="field">
          <label>Email</label>
          <input type="email" id="email" placeholder="tu@jkdlegacy.com.au" required autocomplete="email">
        </div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" type="submit">Send magic link →</button>
      </form>
      <div id="magic-out"></div>
      ${(location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? '<p class="login-note">Local demo · use <code>admin@jkdlegacy.com.au</code> (administrator) or <code>comercial@jkdlegacy.com.au</code> (sales).</p>' : ''}
    </div>
  </div>`;

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const email = $('#email').value.trim();
    btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const r = await api('POST', '/api/auth/request', { email });
      const out = $('#magic-out');
      // Mensaje neutro siempre — no revela si el correo existe ni a quién pertenece.
      let h = '<div class="magic-result"><p>If the email is registered, we have sent you a sign-in link. Check your inbox.</p>';
      if (r.devLink) h += `<span class="devtag" style="display:block;margin-top:12px">● Local demo mode (no email)</span><a class="btn btn-primary btn-sm" href="${r.devLink}" style="margin-top:8px">Enter panel →</a>`;
      out.innerHTML = h + '</div>';
    } catch (err) { toast('Error requesting the link', 'err'); }
    btn.disabled = false; btn.textContent = 'Send magic link →';
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
    ['tasks', 'Tasks', ICON.tasks],
    ['stats', 'Statistics', ICON.stats],
    ['users', 'Users', ICON.users],
    ['redirects', 'Redirects', ICON.redirect],
    ['config', 'Settings', ICON.config],
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
            ${icon}<span>${label}</span>${k === 'leads' ? `<span class="badge" id="badge-leads"></span>` : k === 'tasks' ? `<span class="badge" id="badge-tasks"></span>` : ''}
          </button>`).join('')}
      </nav>
      <div class="side-foot">
        <div class="side-user">
          <span class="avatar">${initials(state.me.name)}</span>
          <span><span class="nm">${esc(state.me.name)}</span><span class="rl">${roleLabel(state.me.role)}</span></span>
        </div>
        <button class="nav-item" id="logout">${ICON.out}<span>Log out</span></button>
      </div>
    </aside>
    <main class="main">
      ${state.me.impersonating ? `<div class="imp-bar">
        <span class="imp-msg">${ICON.eye} You're viewing the CRM as <b>${esc(state.me.name)}</b> · ${roleLabel(state.me.role)}</span>
        <button class="btn btn-sm imp-back" id="stop-imp">Back to ${esc(state.me.impersonating.name)} →</button>
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
    catch (e) { toast('Could not return to your account', 'err'); }
  });

  $('#badge-leads').textContent = state.leads.length || '';
  paintTaskBadge();
  const views = { kanban: viewKanban, leads: viewLeads, tasks: viewTasks, stats: viewStats, users: viewUsers, redirects: viewRedirects, config: viewSettings, leadDetail: () => viewLeadDetail(state.detailId) };
  (views[state.view] || viewKanban)();
}

// ============================================================
//  KANBAN
// ============================================================
async function viewKanban() {
  const v = $('#view');
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Conversion pipeline</span><h1>From sign-up to enrollment</h1></div>
      <div class="tools">
        <div class="search">${ICON.search}<input id="k-search" placeholder="Search lead…" value="${esc(state.q)}"></div>
        <button class="btn btn-ghost btn-sm" id="new-lead">+ Manual lead</button>
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
    ? `<button class="col-more" data-status="${st}">↓ Show ${Math.min(KANBAN_BLOCK, rest)} more · ${rest} left</button>`
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
      <span class="own">${l.owner_name ? `<span class="av">${initials(l.owner_name)}</span>${esc(l.owner_name.split(' ')[0])}` : '<span style="color:var(--mute)">Unassigned</span>'}</span>
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
  } catch (e) { toast('Could not update', 'err'); }
}

// ============================================================
//  LEADS TABLE
// ============================================================
async function viewLeads() {
  const v = $('#view');
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Database</span><h1>Registered leads</h1></div>
      <div class="tools">
        <div class="search">${ICON.search}<input id="l-search" placeholder="Search name, email…" value="${esc(state.q)}"></div>
        <button class="btn btn-ghost btn-sm" id="new-lead">+ Manual lead</button>
      </div>
    </div>
    <div class="filters" id="filters">
      ${['all', ...Object.keys(STATUS_META)].map((f) => `<button class="fbtn ${state.filter === f ? 'active' : ''}" data-f="${f}">${f === 'all' ? 'All' : STATUS_META[f].label}</button>`).join('')}
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
  if (!rows.length) { wrap.innerHTML = `<div class="empty"><div class="big">No leads</div>No records match this filter.</div>`; return; }

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / LEADS_PER_PAGE));
  state.leadsPage = Math.min(Math.max(1, state.leadsPage), pages);
  const start = (state.leadsPage - 1) * LEADS_PER_PAGE;
  const pageRows = rows.slice(start, start + LEADS_PER_PAGE);

  wrap.innerHTML = `<table><thead><tr>
    <th>Name</th><th>Contact</th><th>Location</th><th>Status</th><th>Owner</th><th>Created</th>
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
  const caption = `<span class="pager-count">Showing <b>${from}–${to}</b> of <b>${total}</b></span>`;
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
  v.innerHTML = `<div class="empty">Loading…</div>`;
  let lead;
  try { lead = await api('GET', `/api/leads/${id}`); }
  catch (e) {
    v.innerHTML = `<div class="empty"><div class="big">Lead no encontrado</div><button class="btn btn-ghost btn-sm" id="back" style="margin-top:14px">← Back to Leads</button></div>`;
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
        <button class="backlink" id="back">← Back to Leads</button>
        <h1 style="margin-top:6px">${esc(fullName(lead))}</h1>
        <div class="detail-sub">
          <span class="status-pill st-${lead.status}"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>${STATUS_META[lead.status].label}</span>
          <span>·</span><span>${esc((lead.source || '').toUpperCase())}</span>
          <span>·</span><span>Registered ${fmtDate(lead.created_at)}</span>
        </div>
      </div>
      <div class="tools">${isAdmin() ? '<button class="btn btn-ghost btn-sm" id="del">Delete</button>' : ''}</div>
    </div>

    <div class="ld-tabs" id="ld-tabs">
      <button data-t="perfil" class="active">Profile</button>
      <button data-t="origen">Source</button>
    </div>

    <div class="detail-grid">
      <div class="detail-main">
        <div id="tab-perfil">
        <div class="card-box">
          <div class="section-t">Contact information</div>
          <div class="kv">
            <div class="kv-row"><span class="k">Email</span>${lead.email ? `<a class="v" href="mailto:${esc(lead.email)}">${esc(lead.email)}</a>` : '<span class="v">—</span>'}</div>
            <div class="kv-row"><span class="k">Phone</span>${lead.phone ? `<a class="v" href="tel:${esc(tel)}">${esc(lead.phone)}</a>` : '<span class="v">—</span>'}</div>
            <div class="kv-row"><span class="k">Preferred location</span><span class="v">${esc(lead.location || '—')}</span></div>
            <div class="kv-row"><span class="k">Experience</span><span class="v">${esc(lead.experience || '—')}</span></div>
            <div class="kv-row"><span class="k">Source</span><span class="v">${esc(lead.source || '—')}</span></div>
            <div class="kv-row"><span class="k">Owner</span><span class="v">${lead.owner_name ? esc(lead.owner_name) : 'Unassigned'}</span></div>
            <div class="kv-row"><span class="k">Last change</span><span class="v">${fmtDateTime(lead.updated_at)}</span></div>
            <div class="kv-row"><span class="k">ID</span><span class="v">#${lead.id}</span></div>
          </div>
          ${lead.message ? `<div style="margin-top:18px"><div class="section-t">Message / motivation</div><p style="font-size:.92rem;color:var(--dim);line-height:1.65">${esc(lead.message)}</p></div>` : ''}
        </div>

        <div class="card-box">
          <div class="section-t">Edit details</div>
          <div class="form-row">
            <div class="field"><label>Name</label><input id="f-first" value="${esc(lead.first_name || '')}"></div>
            <div class="field"><label>Last name</label><input id="f-last" value="${esc(lead.last_name || '')}"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Email</label><input id="f-email" value="${esc(lead.email || '')}"></div>
            <div class="field"><label>Phone</label><input id="f-phone" value="${esc(lead.phone || '')}"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Preferred location</label><input id="f-loc" value="${esc(lead.location || '')}"></div>
            <div class="field"><label>Owner</label><select id="f-owner">${ownerOpts}</select></div>
          </div>
          <div class="field"><label>Experience</label><input id="f-exp" value="${esc(lead.experience || '')}"></div>
          <div class="field"><label>Message / motivation</label><textarea id="f-msg">${esc(lead.message || '')}</textarea></div>
          <button class="btn btn-primary btn-sm" id="save">Save changes</button>
        </div>

        <div class="card-box">
          <div class="section-t">Activity</div>
          <div class="timeline">${(lead.events || []).slice().reverse().map(eventHTML).join('') || '<p style="color:var(--mute);font-size:.8rem">No events.</p>'}</div>
          <div class="note-add">
            <input id="note" placeholder="Add note…">
            <button class="btn btn-ghost btn-sm" id="note-btn">Add</button>
          </div>
        </div>
        </div><!-- /tab-perfil -->

        <div id="tab-origen" hidden>
          <div class="card-box">
            <div class="section-t">Lead source — attribution (ads team)</div>
            ${attrHTML(lead)}
          </div>
        </div>
      </div>

      <aside class="detail-side">
        <div class="card-box">
          <div class="section-t">Pipeline status</div>
          <div class="status-select" id="status-sel">
            ${Object.keys(STATUS_META).map((s) => `<button class="ss ${s} ${lead.status === s ? 'active' : ''}" data-s="${s}">${STATUS_META[s].label}</button>`).join('')}
          </div>
          ${lead.status === 'perdido' && lead.loss_reason ? `<p style="margin-top:12px;font-size:.8rem;color:var(--red)">Loss reason: <b>${esc(state.meta.lossReasons[lead.loss_reason] || lead.loss_reason)}</b></p>` : ''}
        </div>
        <div class="card-box">
          <div class="section-t">Quick actions</div>
          <div style="display:flex;flex-direction:column;gap:9px">
            ${lead.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(lead.email)}" style="justify-content:center">✉ Send email</a>` : ''}
            ${lead.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(tel)}" style="justify-content:center">☎ Call</a>` : ''}
            ${lead.phone ? `<a class="btn btn-ghost btn-sm" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" style="justify-content:center">WhatsApp</a>` : ''}
          </div>
        </div>
        <div class="card-box">
          <div class="section-t section-t-row">Tasks / reminders<button class="btn btn-ghost btn-sm" id="ld-task-add">+ Add</button></div>
          <div id="ld-tasks" class="task-list mini">${(lead.tasks || []).length ? lead.tasks.map((t) => taskRowHTML(t, { showLead: false })).join('') : '<p style="color:var(--mute);font-size:.8rem">No tasks. Schedule a reminder (e.g. call in 1 h) and we will email you.</p>'}</div>
        </div>
      </aside>
    </div>`;

  $('#back').addEventListener('click', backToLeads);
  $('#del')?.addEventListener('click', async () => {
    if (!confirm('Delete this lead permanently?')) return;
    try { await api('DELETE', `/api/leads/${id}`); await loadLeads(); toast('Lead deleted'); backToLeads(); }
    catch (e) { toast("Couldn't delete", 'err'); }
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
    try { await api('PATCH', `/api/leads/${id}`, body); await loadLeads(); toast('Changes saved'); viewLeadDetail(id); }
    catch (e) { toast('Error saving', 'err'); }
  });
  const addNote = async () => {
    const note = $('#note').value.trim(); if (!note) return;
    try { await api('POST', `/api/leads/${id}/note`, { note }); toast('Note added'); viewLeadDetail(id); }
    catch (e) { toast('Error', 'err'); }
  };
  $('#note-btn').addEventListener('click', addNote);
  $('#note').addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });

  // Tareas del lead (crear "llamar a…" + marcar/eliminar)
  $('#ld-task-add')?.addEventListener('click', () => openTaskModal({ lead_id: id, lead_name: fullName(lead), title: 'Call ' + fullName(lead), onSaved: () => viewLeadDetail(id) }));
  const ldTasks = $('#ld-tasks'); if (ldTasks) wireTaskList(ldTasks, () => viewLeadDetail(id));

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
    navigator.clipboard.writeText(`Lead #${lead.id} — ${fullName(lead)}\n` + lines.join('\n')).then(() => toast('Summary copied')).catch(() => toast('Could not copy', 'err'));
  });
}

// Atribución / origen del lead (para el equipo de pauta)
function attrHTML(lead) {
  let a; try { a = JSON.parse(lead.attribution || 'null'); } catch (e) { a = null; }
  if (!a) return '<div class="empty" style="padding:28px 10px"><div class="big">No source data</div>Manual lead, or created before attribution capture was enabled.</div>';
  // Solo http(s):// se emite como enlace; cualquier otro esquema (p. ej. javascript:) se muestra como texto (anti-XSS)
  const linkv = (u) => {
    if (!u) return '<span class="v">—</span>';
    const raw = String(u);
    return /^https?:\/\//i.test(raw)
      ? `<a class="v" href="${esc(raw)}" target="_blank" rel="noopener noreferrer" style="word-break:break-all">${esc(raw)}</a>`
      : `<span class="v" style="word-break:break-all">${esc(raw)}</span>`;
  };
  const row = (label, val, isLink) => val ? `<div class="kv-row"><span class="k">${label}</span>${isLink ? linkv(val) : `<span class="v" style="word-break:break-word;text-align:right">${esc(val)}</span>`}</div>` : '';
  const rows = [
    row('Campaign', a.utm_campaign), row('Source', a.utm_source), row('Medium', a.utm_medium),
    row('Term', a.utm_term), row('Content', a.utm_content),
    row('Google Click ID', a.gclid), row('Meta Click ID', a.fbclid), row('Microsoft Click ID', a.msclkid), row('TikTok Click ID', a.ttclid),
    row('Referrer', a.referrer, true), row('Landing URL', a.landing_url, true), row('Submit URL', a.submit_url, true),
    row('Device', a.device), row('Language', a.language), row('First seen', a.first_seen ? fmtDateTime(a.first_seen) : ''),
  ].join('');
  return `
    <div class="attr-channel"><span class="attr-channel-lab">Acquisition channel</span><span class="attr-channel-val">${esc(a.channel || '—')}</span></div>
    <div class="kv">${rows}</div>
    ${a.user_agent ? `<div style="margin-top:16px"><div class="section-t">Browser (user agent)</div><p style="font-size:.76rem;color:var(--mute);word-break:break-word;line-height:1.5">${esc(a.user_agent)}</p></div>` : ''}
    <button class="btn btn-ghost btn-sm" id="attr-copy" style="margin-top:16px">Copy summary</button>`;
}

function eventHTML(ev) {
  let txt = '', cls = ev.type;
  if (ev.type === 'created') txt = `Lead created${ev.note ? ` · ${esc(ev.note)}` : ''}`;
  else if (ev.type === 'status') { cls = ev.to_status; txt = `Moved to <b style="color:var(--text)">${STATUS_META[ev.to_status]?.label || ev.to_status}</b>${ev.loss_reason ? ` — ${esc(state.meta.lossReasons[ev.loss_reason] || ev.loss_reason)}` : ''}`; }
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
    <h2>Mark as Lost</h2>
    <p class="desc">Select the loss reason for the report.</p>
    <div class="field"><label>Reason</label><select id="loss-r">${opts}</select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="loss-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="loss-ok">Confirm loss</button>
    </div>`);
  $('#loss-cancel').addEventListener('click', () => { closeModal(); if (state.view === 'kanban') paintKanban(); });
  $('#loss-ok').addEventListener('click', () => { const r = $('#loss-r').value; closeModal(); onConfirm(r); });
}

function openNewLead() {
  const ownerOpts = state.users.map((u) => `<option value="${u.id}" ${u.id === state.me.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  modal(`
    <h2>New lead</h2>
    <p class="desc">Manually register a prospect.</p>
    <div class="form-row">
      <div class="field"><label>Name</label><input id="n-first"></div>
      <div class="field"><label>Last name</label><input id="n-last"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Email</label><input id="n-email" type="email"></div>
      <div class="field"><label>Phone</label><input id="n-phone"></div>
    </div>
    <div class="field"><label>Preferred location</label><input id="n-loc" placeholder="Melbourne · Adelaide…"></div>
    <div class="field"><label>Owner</label><select id="n-owner">${ownerOpts}</select></div>
    <div class="field"><label>Message</label><textarea id="n-msg"></textarea></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="n-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="n-ok">Create lead</button>
    </div>`);
  $('#n-cancel').addEventListener('click', closeModal);
  $('#n-ok').addEventListener('click', async () => {
    const body = { first_name: $('#n-first').value, last_name: $('#n-last').value, email: $('#n-email').value, phone: $('#n-phone').value, location: $('#n-loc').value, message: $('#n-msg').value, owner_id: Number($('#n-owner').value), source: 'manual' };
    if (!body.first_name && !body.email) { toast('Name or email required', 'err'); return; }
    try { await api('POST', '/api/leads', body); closeModal(); await loadLeads(); if (state.view === 'kanban') paintKanban(); else if (state.view === 'leads') paintLeads(); toast('Lead created'); }
    catch (e) { toast('Error creating', 'err'); }
  });
}

// ============================================================
//  TAREAS / RECORDATORIOS
// ============================================================
const pad2 = (n) => String(n).padStart(2, '0');
function toLocalInput(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function taskDue(due) {
  if (!due) return { txt: 'No date', cls: 'nofecha' };
  const d = new Date(due), now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((dd - day0) / 86400000);
  const hm = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  let txt;
  if (d < now) txt = 'Overdue · ' + fmtDateTime(due);
  else if (diff === 0) txt = 'Today ' + hm;
  else if (diff === 1) txt = 'Tomorrow ' + hm;
  else txt = fmtDateTime(due);
  return { txt, cls: d < now ? 'overdue' : diff === 0 ? 'today' : 'upcoming' };
}
const leadTaskName = (t) => `${t.lead_first || ''} ${t.lead_last || ''}`.trim();
function taskRowHTML(t, opts = {}) {
  const done = t.status === 'hecha';
  const dm = taskDue(t.due_at);
  const leadName = leadTaskName(t);
  return `<div class="task-row ${done ? 'done' : ''}" data-id="${t.id}">
    <button class="task-check ${done ? 'on' : ''}" data-act="toggle" title="${done ? 'Reopen' : 'Mark done'}" aria-label="Mark done">${done ? '✓' : ''}</button>
    <div class="task-body">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">
        ${done ? `<span class="task-due done">Done${t.done_at ? ' · ' + fmtDateTime(t.done_at) : ''}</span>` : `<span class="task-due ${dm.cls}">${esc(dm.txt)}</span>`}
        ${opts.showLead && t.lead_id ? `<a class="task-lead" data-act="lead" href="#lead-${t.lead_id}">${ICON.leads}${esc(leadName || 'Lead #' + t.lead_id)}</a>` : ''}
        ${t.owner_name ? `<span class="task-owner">${esc(t.owner_name)}</span>` : ''}
      </div>
    </div>
    <button class="task-del" data-act="del" title="Delete" aria-label="Delete">✕</button>
  </div>`;
}
async function toggleTask(id, done) { await api('PATCH', `/api/tasks/${id}`, { status: done ? 'hecha' : 'pendiente' }); }
async function loadTasks() { try { state.tasks = await api('GET', '/api/tasks?scope=pendiente'); } catch (e) { state.tasks = []; } paintTaskBadge(); }
function overdueCount() { const now = Date.now(); return (state.tasks || []).filter((t) => t.due_at && new Date(t.due_at).getTime() <= now).length; }
function paintTaskBadge() { const b = $('#badge-tasks'); if (!b) return; b.textContent = (state.tasks || []).length || ''; b.classList.toggle('overdue', overdueCount() > 0); }
function wireTaskList(container, refresh) {
  container.onclick = async (e) => {
    const row = e.target.closest('.task-row'); if (!row) return;
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act || act === 'lead') return;
    const id = Number(row.dataset.id);
    if (act === 'toggle') { try { await toggleTask(id, !row.classList.contains('done')); await loadTasks(); refresh(); } catch (x) { toast('Error', 'err'); } }
    else if (act === 'del') { if (!confirm('Delete this task?')) return; try { await api('DELETE', `/api/tasks/${id}`); await loadTasks(); refresh(); toast('Task deleted'); } catch (x) { toast('Error', 'err'); } }
  };
}
async function viewTasks() {
  const v = $('#view');
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Follow-up</span><h1>Tasks &amp; reminders</h1></div>
      <div class="tools"><button class="btn btn-primary btn-sm" id="new-task">+ New task</button></div>
    </div>
    <div class="filters" id="task-filters">
      <button class="fbtn active" data-f="pendiente">Pending</button>
      <button class="fbtn" data-f="hecha">Done</button>
      <button class="fbtn" data-f="all">All</button>
    </div>
    <div id="task-list" class="task-list"><div class="empty">Loading…</div></div>`;
  $('#new-task').addEventListener('click', () => openTaskModal({ onSaved: () => paintTasks(curTaskScope) }));
  const filters = $('#task-filters');
  filters.addEventListener('click', (e) => { const b = e.target.closest('.fbtn'); if (!b) return; filters.querySelectorAll('.fbtn').forEach((x) => x.classList.toggle('active', x === b)); paintTasks(b.dataset.f); });
  paintTasks('pendiente');
}
let curTaskScope = 'pendiente';
async function paintTasks(scope) {
  curTaskScope = scope;
  const list = $('#task-list'); if (!list) return;
  let rows;
  try { rows = await api('GET', '/api/tasks' + (scope && scope !== 'all' ? '?scope=' + scope : '')); }
  catch (e) { list.innerHTML = '<div class="empty">Error loading</div>'; return; }
  if (!rows.length) { list.innerHTML = `<div class="empty"><div class="big">No ${scope === 'hecha' ? 'completed' : 'pending'} tasks</div>Create a reminder (e.g. “call the lead”) so no follow-up slips.</div>`; return; }
  // Orden: por fecha de vencimiento, de la más reciente a la más vieja (lo entrega ya la API en DESC).
  list.innerHTML = rows.map((t) => taskRowHTML(t, { showLead: true })).join('');
  wireTaskList(list, () => paintTasks(scope));
}
function openTaskModal(prefill = {}) {
  const leadOpts = ['<option value="">— No lead —</option>', ...state.leads.map((l) => `<option value="${l.id}" ${l.id === prefill.lead_id ? 'selected' : ''}>${esc(fullName(l))}</option>`)].join('');
  const ownerOpts = state.users.map((u) => `<option value="${u.id}" ${u.id === state.me.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  modal(`
    <h2>New task</h2>
    <p class="desc">A follow-up reminder. You will get an email when it is due.</p>
    <div class="field"><label>Task</label><input id="t-title" placeholder="e.g. Call the lead" value="${esc(prefill.title || '')}"></div>
    <div class="field"><label>Related lead</label><select id="t-lead">${leadOpts}</select></div>
    <div class="field"><label>Due</label><input id="t-due" type="datetime-local"></div>
    <div class="task-presets" id="t-presets">
      <button class="chip-btn" data-min="60">In 1 h</button>
      <button class="chip-btn" data-min="180">In 3 h</button>
      <button class="chip-btn" data-tom="9">Tomorrow 9:00</button>
      <button class="chip-btn" data-days="3">In 3 days</button>
    </div>
    <div class="field"><label>Owner</label><select id="t-owner">${ownerOpts}</select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="t-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="t-ok">Create task</button>
    </div>`);
  $('#t-presets').addEventListener('click', (e) => {
    const b = e.target.closest('.chip-btn'); if (!b) return; e.preventDefault();
    const d = new Date();
    if (b.dataset.min) d.setMinutes(d.getMinutes() + Number(b.dataset.min));
    else if (b.dataset.tom) { d.setDate(d.getDate() + 1); d.setHours(Number(b.dataset.tom), 0, 0, 0); }
    else if (b.dataset.days) { d.setDate(d.getDate() + Number(b.dataset.days)); d.setHours(9, 0, 0, 0); }
    $('#t-due').value = toLocalInput(d);
    $('#t-presets').querySelectorAll('.chip-btn').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#t-cancel').addEventListener('click', closeModal);
  $('#t-ok').addEventListener('click', async () => {
    const title = $('#t-title').value.trim();
    if (!title) { toast('Enter the task', 'err'); return; }
    const dueVal = $('#t-due').value;
    const body = {
      title,
      lead_id: $('#t-lead').value ? Number($('#t-lead').value) : null,
      owner_id: Number($('#t-owner').value) || null,
      due_at: dueVal ? new Date(dueVal).toISOString() : null,
    };
    try { await api('POST', '/api/tasks', body); closeModal(); await loadTasks(); toast('Task created'); prefill.onSaved && prefill.onSaved(); }
    catch (e) { toast('Error creating the task', 'err'); }
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
      <div><span class="ey">Team</span><h1>CRM users</h1></div>
      <div class="tools">${isAdmin ? '<button class="btn btn-primary btn-sm" id="new-user">+ Create user</button>' : ''}</div>
    </div>
    ${!isAdmin ? '<p style="color:var(--mute);font-size:.82rem;margin-bottom:14px">Only administrators can create or edit users.</p>' : ''}
    <div class="panel"><table><thead><tr>
      <th>User</th><th>Email</th><th>Role</th><th>Status</th>${isAdmin ? '<th></th>' : ''}
    </tr></thead><tbody>
    ${state.users.map((u) => `<tr>
      <td><div style="display:flex;align-items:center;gap:10px"><span class="avatar" style="width:30px;height:30px;font-size:.8rem">${initials(u.name)}</span><span class="lead-nm" style="font-size:.92rem">${esc(u.name)}</span></div></td>
      <td>${esc(u.email)}</td>
      <td><span class="status-pill ${u.role === 'admin' ? 'st-ganado' : 'st-registrado'}">${roleLabel(u.role)}</span></td>
      <td>${u.active ? '<span style="color:var(--green)">● Active</span>' : '<span style="color:var(--mute)">○ Inactive</span>'}</td>
      ${isAdmin ? `<td style="text-align:right;white-space:nowrap">
        ${u.id !== state.me.id ? `<button class="btn btn-ghost btn-sm" data-imp="${u.id}">Log in as</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-edit="${u.id}">Edit</button>
      </td>` : ''}
    </tr>`).join('')}
    </tbody></table></div>`;

  if (isAdmin) {
    $('#new-user')?.addEventListener('click', openNewUser);
    v.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openEditUser(state.users.find((u) => u.id === Number(b.dataset.edit)))));
    v.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', async () => {
      const u = state.users.find((x) => x.id === Number(b.dataset.imp));
      if (!confirm(`Log in as ${u.name}? You will browse the CRM with ${roleLabel(u.role)} permissions. You can return to your account anytime.`)) return;
      try { await api('POST', `/api/users/${b.dataset.imp}/impersonate`); location.reload(); }
      catch (e) { toast('Could not log in as that user', 'err'); }
    }));
  }
}

function openNewUser() {
  modal(`
    <h2>Create user</h2>
    <p class="desc">They will sign in with their email via magic link.</p>
    <div class="field"><label>Full name</label><input id="u-name"></div>
    <div class="field"><label>Email</label><input id="u-email" type="email"></div>
    <div class="field"><label>Role</label><select id="u-role"><option value="comercial">Sales</option><option value="admin">Administrator</option></select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="u-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="u-ok">Create</button>
    </div>`);
  $('#u-cancel').addEventListener('click', closeModal);
  $('#u-ok').addEventListener('click', async () => {
    const body = { name: $('#u-name').value, email: $('#u-email').value, role: $('#u-role').value };
    if (!body.name || !body.email) { toast('Name and email required', 'err'); return; }
    try { await api('POST', '/api/users', body); closeModal(); viewUsers(); toast('User created'); }
    catch (e) { toast(e.message === 'email already exists' ? 'That email already exists' : 'Error creating', 'err'); }
  });
}

function openEditUser(u) {
  if (!u) return;
  modal(`
    <h2>Edit user</h2>
    <p class="desc">Update the details and role. Sales cannot delete leads or see Users/Settings.</p>
    <div class="field"><label>Full name</label><input id="u-name" value="${esc(u.name)}"></div>
    <div class="field"><label>Email</label><input id="u-email" type="email" value="${esc(u.email)}"></div>
    <div class="field"><label>Role</label><select id="u-role">
      <option value="comercial" ${u.role === 'comercial' ? 'selected' : ''}>Sales</option>
      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrator</option>
    </select></div>
    <div class="field"><label>Status</label><select id="u-active">
      <option value="1" ${u.active ? 'selected' : ''}>Active</option>
      <option value="0" ${!u.active ? 'selected' : ''}>Inactive</option>
    </select></div>
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="u-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="u-ok">Save changes</button>
    </div>`);
  $('#u-cancel').addEventListener('click', closeModal);
  $('#u-ok').addEventListener('click', async () => {
    const body = { name: $('#u-name').value, email: $('#u-email').value, role: $('#u-role').value, active: Number($('#u-active').value) };
    if (!body.name || !body.email) { toast('Name and email required', 'err'); return; }
    try { await api('PATCH', `/api/users/${u.id}`, body); closeModal(); viewUsers(); toast('User updated'); }
    catch (e) { toast(e.message === 'email already exists' ? 'That email already exists' : 'Error saving', 'err'); }
  });
}

// ============================================================
//  REDIRECCIONES 301/302 (solo admin)
// ============================================================
async function viewRedirects() {
  const v = $('#view');
  let rows = [];
  try { rows = await api('GET', '/api/redirects'); }
  catch (e) { v.innerHTML = '<div class="empty"><div class="big">Restricted access</div>Only administrators can manage redirects.</div>'; return; }
  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">SEO</span><h1>301 Redirects</h1></div>
      <div class="tools"><button class="btn btn-primary btn-sm" id="new-rd">+ Create redirect</button></div>
    </div>
    <p style="color:var(--mute);font-size:.82rem;margin-bottom:16px;max-width:74ch;line-height:1.6">Send an old path to a new one with a <b>301</b> (permanent) or <b>302</b> (temporary). Ideal when renaming pages: you keep your rankings and don't break external links. You can't redirect <code>/</code>, <code>/crm</code> or <code>/api</code>.</p>
    <div class="panel"><div id="rd-table"></div></div>`;
  $('#new-rd').addEventListener('click', openNewRedirect);
  paintRedirects(rows);
}

function paintRedirects(rows) {
  const wrap = $('#rd-table'); if (!wrap) return;
  if (!rows.length) { wrap.innerHTML = `<div class="empty"><div class="big">No redirects</div>Create the first one with “+ Create redirect”.</div>`; return; }
  wrap.innerHTML = `<table><thead><tr>
    <th>Source</th><th>Target</th><th>Type</th><th>Status</th><th>Hits</th><th></th>
    </tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td><code class="rd-path">${esc(r.from_path)}</code></td>
      <td><span class="rd-arrow">→</span> <code class="rd-path">${esc(r.to_path)}</code></td>
      <td><span class="status-pill ${r.code === 301 ? 'st-ganado' : 'st-contactado'}">${r.code}</span></td>
      <td>${r.active ? '<span style="color:var(--green)">● Active</span>' : '<span style="color:var(--mute)">○ Inactive</span>'}</td>
      <td><span style="font-family:var(--mono);color:var(--dim)">${r.hits}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-ghost btn-sm" data-rd-edit="${r.id}">Edit</button>
        <button class="btn btn-ghost btn-sm" data-rd-del="${r.id}">Delete</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
  wrap.querySelectorAll('[data-rd-edit]').forEach((b) => b.addEventListener('click', () => openEditRedirect(rows.find((x) => x.id === Number(b.dataset.rdEdit)))));
  wrap.querySelectorAll('[data-rd-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this redirect?')) return;
    try { await api('DELETE', `/api/redirects/${b.dataset.rdDel}`); viewRedirects(); toast('Redirect deleted'); }
    catch (e) { toast("Couldn't delete", 'err'); }
  }));
}

function redirectForm(r) {
  const isEdit = !!r;
  return `
    <h2>${isEdit ? 'Edit redirect' : 'Create redirect'}</h2>
    <p class="desc">The source is a site path (e.g. <code>/old-page</code>). The target can be a path (<code>/the-way</code>) or a full URL.</p>
    <div class="field"><label>Source (old path)</label><input id="rd-from" placeholder="/old-page" value="${esc(r ? r.from_path : '')}"></div>
    <div class="field"><label>Target</label><input id="rd-to" placeholder="/new-page" value="${esc(r ? r.to_path : '')}"></div>
    <div class="field"><label>Type</label><select id="rd-code">
      <option value="301" ${!r || r.code === 301 ? 'selected' : ''}>301 — Permanent (recommended for SEO)</option>
      <option value="302" ${r && r.code === 302 ? 'selected' : ''}>302 — Temporary</option>
    </select></div>
    ${isEdit ? `<div class="field"><label>Status</label><select id="rd-active">
      <option value="1" ${r.active ? 'selected' : ''}>Active</option>
      <option value="0" ${!r.active ? 'selected' : ''}>Inactive</option>
    </select></div>` : ''}
    <div class="modal-foot">
      <button class="btn btn-ghost btn-sm" id="rd-cancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="rd-ok">${isEdit ? 'Save' : 'Create'}</button>
    </div>`;
}

function redirErr(e) {
  const m = String(e && e.message || '');
  if (m.includes('already exists')) return 'A redirect already exists for that source';
  if (m.includes('cannot be the same')) return 'Source and target cannot be the same';
  if (m.includes('not allowed')) return 'Source not allowed (do not use /, /crm or /api)';
  return 'Could not save the redirect';
}

function openNewRedirect() {
  modal(redirectForm(null));
  $('#rd-cancel').addEventListener('click', closeModal);
  $('#rd-ok').addEventListener('click', async () => {
    const body = { from_path: $('#rd-from').value, to_path: $('#rd-to').value, code: Number($('#rd-code').value) };
    if (!body.from_path.trim() || !body.to_path.trim()) { toast('Source and target required', 'err'); return; }
    try { await api('POST', '/api/redirects', body); closeModal(); viewRedirects(); toast('Redirect created'); }
    catch (e) { toast(redirErr(e), 'err'); }
  });
}

function openEditRedirect(r) {
  if (!r) return;
  modal(redirectForm(r));
  $('#rd-cancel').addEventListener('click', closeModal);
  $('#rd-ok').addEventListener('click', async () => {
    const body = { from_path: $('#rd-from').value, to_path: $('#rd-to').value, code: Number($('#rd-code').value), active: Number($('#rd-active').value) };
    if (!body.from_path.trim() || !body.to_path.trim()) { toast('Source and target required', 'err'); return; }
    try { await api('PATCH', `/api/redirects/${r.id}`, body); closeModal(); viewRedirects(); toast('Redirect updated'); }
    catch (e) { toast(redirErr(e), 'err'); }
  });
}

// ============================================================
//  SETTINGS — configuración del sitio (componentes externos)
// ============================================================
const TAG_FIELDS = [
  ['ga4_id', 'Google Analytics 4', 'G-XXXXXXXXXX', 'GA4 Measurement ID.'],
  ['google_tag_id', 'Google Tag (Site Kit)', 'GT-XXXXXXX', 'Google tag that wraps GA4.'],
  ['gtm_id', 'Google Tag Manager', 'GTM-XXXXXXX', 'GTM container ID (optional).'],
  ['meta_pixel_id', 'Meta (Facebook) Pixel', '918178380081272', 'Meta pixel numeric ID.'],
  ['google_ads_id', 'Google Ads (Conversion)', 'AW-XXXXXXXXX', 'Google Ads conversion ID (optional).'],
  ['tiktok_pixel_id', 'TikTok Pixel', 'CXXXXXXXXXXXXXXXXX', 'TikTok pixel ID (optional).'],
];
const VERIFY_FIELDS = [
  ['google_site_verification', 'Google Search Console', 'verification code', 'Only the "content" value of the google-site-verification meta.'],
  ['facebook_domain_verification', 'Meta / Facebook (domain)', 'verification code', 'facebook-domain-verification value.'],
  ['bing_site_verification', 'Bing Webmaster', 'msvalidate.01 code', 'Optional.'],
];
const TEXT_FIELDS = [['eyebrow', 'Eyebrow', false], ['heading', 'Heading', false], ['intro', 'Intro', true], ['submit', 'Button text', false], ['privacy', 'Privacy notice', false]];

async function viewSettings() {
  const v = $('#view');
  v.innerHTML = `<div class="empty">Loading…</div>`;
  let s; try { s = await api('GET', '/api/settings'); } catch (e) { v.innerHTML = '<div class="empty">Error loading.</div>'; return; }
  const isAdmin = state.me.role === 'admin';
  const dis = isAdmin ? '' : 'disabled';
  const on = s.tracking_enabled === '1';
  let _fc = {}; try { _fc = JSON.parse(s.form_config) || {}; } catch (e) {}
  const txt = _fc.text || {};

  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Site settings</span><h1>External components</h1></div>
    </div>
    ${!isAdmin ? '<p style="color:var(--mute);font-size:.82rem;margin-bottom:14px">Only administrators can edit settings.</p>' : ''}
    <div class="detail-grid">
      <div class="detail-main">
        <div class="card-box">
          <div class="section-t">Capture form (web)</div>
          <p class="field-help" style="margin:-2px 0 16px">Edit the text and fields of the site form (<code class="mono">/join-the-family</code>). Bilingual EN/ES.</p>
          ${TEXT_FIELDS.map(([k, label, multi]) => `
            <div class="form-row">
              <div class="field"><label>${label} (EN)</label>${multi ? `<textarea id="ft-${k}-en" rows="2" ${dis}>${esc(txt[k + '_en'] || '')}</textarea>` : `<input id="ft-${k}-en" value="${esc(txt[k + '_en'] || '')}" ${dis}>`}</div>
              <div class="field"><label>${label} (ES)</label>${multi ? `<textarea id="ft-${k}-es" rows="2" ${dis}>${esc(txt[k + '_es'] || '')}</textarea>` : `<input id="ft-${k}-es" value="${esc(txt[k + '_es'] || '')}" ${dis}>`}</div>
            </div>`).join('')}
          <div class="fb-bar">
            <div><div class="fb-title">Form Fields</div><div class="fb-sub">Fields the visitor fills in before submitting</div></div>
            <div class="fb-bar-actions">
              <div class="fb-langs" id="fb-langs"><button type="button" data-fl="en" class="active">EN</button><button type="button" data-fl="es">ES</button></div>
              ${isAdmin ? '<button type="button" class="btn-add" id="fb-add">+ Add Field</button>' : ''}
            </div>
          </div>
          <div id="fb-list"></div>
          ${isAdmin ? '<button class="btn btn-primary btn-sm" id="fb-save" style="margin-top:14px">Save form</button>' : ''}
        </div>

        <div class="card-box">
          <div class="section-t">Analytics &amp; marketing</div>
          <div class="set-toggle">
            <div><div class="lab">Enable tags on the site</div><div style="font-size:.74rem;color:var(--mute)">If off, no tool loads on the public site.</div></div>
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
          <div class="section-t">Domain verification</div>
          ${VERIFY_FIELDS.map(([k, label, ph, help]) => `
            <div class="field">
              <label>${label}</label>
              <input id="set-${k}" value="${esc(s[k] || '')}" placeholder="${ph}" autocomplete="off" spellcheck="false" ${dis}>
              <div class="field-help">${help}</div>
            </div>`).join('')}
        </div>

        <div class="card-box">
          <div class="section-t">Custom HTML in &lt;head&gt;</div>
          <div class="field">
            <textarea id="set-custom_head" rows="6" placeholder="<!-- Paste tags for the <head> here: scripts, metas, verifications for other tools… -->" spellcheck="false" ${dis} style="font-family:var(--mono);font-size:.8rem;line-height:1.5">${esc(s.custom_head || '')}</textarea>
            <div class="field-help">Injected as-is into the &lt;head&gt; of all public pages (admin only) — for any future tool.</div>
          </div>
        </div>

        ${isAdmin ? '<button class="btn btn-primary btn-sm" id="set-save">Save settings</button>' : ''}
      </div>
      <aside class="detail-side">
        <div class="card-box">
          <div class="section-t">How it works</div>
          <p style="font-size:.86rem;color:var(--dim);line-height:1.6">These IDs feed the public site's <code class="mono">analytics.js</code> via <code class="mono">/api/public/site-config</code>. Changes here apply to the site <b>without touching code</b>.</p>
          <p style="font-size:.82rem;color:var(--mute);line-height:1.6;margin-top:12px">Tags don't fire on <b>localhost</b> (testing), only on the real domain. Leave a field empty to skip that tool.</p>
        </div>
        <div class="card-box">
          <div class="section-t">Imported from the current site</div>
          <p style="font-size:.82rem;color:var(--dim);line-height:1.6">GA4 <b>G-MXNZZXDP2E</b> · Google Tag <b>GT-M3VXNNZ</b> · Meta Pixel <b>918178380081272</b> (from jkdlegacy.com.au).</p>
        </div>
      </aside>
    </div>`;

  if (isAdmin) {
    $('#set-save').addEventListener('click', async () => {
      const body = { tracking_enabled: $('#set-tracking_enabled').checked ? '1' : '0' };
      TAG_FIELDS.concat(VERIFY_FIELDS).forEach(([k]) => { body[k] = $('#set-' + k).value.trim(); });
      body.custom_head = $('#set-custom_head').value;
      try { await api('PUT', '/api/settings', body); toast('Settings saved'); }
      catch (e) { toast(e.message === 'admin only' ? 'Administrators only' : 'Error saving', 'err'); }
    });
  }

  // ----- Constructor del formulario (compacto · bilingüe · arrastrar) -----
  let formState = (_fc.fields || []).map((f) => Object.assign({}, f));
  let fbLang = 'en';
  const FB_TYPES = [['text', 'Text'], ['email', 'Email'], ['tel', 'Phone'], ['select', 'Selection'], ['textarea', 'Message']];
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
        ${isAdmin ? '<span class="fbf-drag" title="Drag to reorder">⠿</span>' : ''}
        <input class="fbf-in fbf-label" data-k="${lk}" value="${esc(f[lk] || '')}" placeholder="Label" ${dis}>
        <select class="fbf-in fbf-type" data-k="type" ${dis}>${FB_TYPES.map(([vv, ll]) => `<option value="${vv}" ${f.type === vv ? 'selected' : ''}>${ll}</option>`).join('')}</select>
        <input class="fbf-in fbf-ph" data-k="${pk}" value="${esc(f[pk] || '')}" placeholder="Placeholder…" ${dis}>
        <label class="fbf-req"><input type="checkbox" data-k="required" ${f.required ? 'checked' : ''} ${dis}> Req.</label>
        ${isAdmin ? '<button type="button" class="fbf-del" data-act="del" title="Delete">✕</button>' : ''}
        ${f.type === 'select' ? `<div class="fbf-opts"><input class="fbf-in" data-k="${ok}" value="${esc((f[ok] || []).join(', '))}" placeholder="Comma-separated options (${fbLang.toUpperCase()})" ${dis}></div>` : ''}
      </div>`).join('') || '<p class="field-help">No fields. Add the first one.</p>';
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
    $('#fb-add').addEventListener('click', () => { fbSync(); formState.push({ key: 'campo_' + (formState.length + 1), type: 'text', required: false, label: 'New Field', labelEs: 'Nuevo Campo' }); renderFB(); });
    $('#fb-save').addEventListener('click', async () => {
      fbSync();
      const text = {}; TEXT_FIELDS.forEach(([k]) => { text[k + '_en'] = ($('#ft-' + k + '-en').value || '').trim(); text[k + '_es'] = ($('#ft-' + k + '-es').value || '').trim(); });
      try { await api('PUT', '/api/settings', { form_config: JSON.stringify({ text, fields: formState }) }); toast('Form saved'); }
      catch (e) { toast(e.message === 'admin only' ? 'Administrators only' : 'Error saving', 'err'); }
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
  const monthOpts = ['<option value="">All months</option>',
    ...s.availableMonths.slice().reverse().map((m) => `<option value="${m}" ${m === s.month ? 'selected' : ''}>${fmtMonthLong(m)}</option>`)].join('');
  const kpis = scoped
    ? [['accent', 'Leads this month', s.kpi.total], ['green', 'Won', s.kpi.won], ['red', 'Lost', s.kpi.lost], ['brass', 'Close rate', s.kpi.winRate, '%'], ['', 'In progress', s.kpi.active]]
    : [['accent', 'Total leads', s.kpi.total], ['', 'New this month', s.kpi.newThisMonth], ['green', 'Won', s.kpi.won], ['brass', 'Close rate', s.kpi.winRate, '%'], ['', 'In progress', s.kpi.active]];

  v.innerHTML = `
    <div class="topbar">
      <div><span class="ey">Analysis</span><h1>Conversions by month</h1></div>
      <div class="tools"><label class="month-lab">Filter by month</label><select id="stat-month" class="month-sel">${monthOpts}</select></div>
    </div>

    <div class="kpis">
      ${kpis.map(([cls, lab, val, suf]) => `<div class="kpi ${cls}"><div class="lab">${lab}</div><div class="val">${val}${suf ? `<small>${suf}</small>` : ''}</div></div>`).join('')}
    </div>

    <div class="stat-grid">
      <div class="card-box">
        <h3>Monthly evolution</h3>
        <p class="desc">Registered vs. won vs. lost — last 6 months.</p>
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
          <span><i style="background:var(--accent)"></i>Registered</span>
          <span><i style="background:var(--green)"></i>Won</span>
          <span><i style="background:var(--red)"></i>Lost</span>
        </div>
      </div>

      <div class="card-box">
        <h3>Conversion rate</h3>
        <p class="desc">% won of resolved (won + lost) per month.</p>
        ${s.monthly.map((m) => `
          <div class="conv-row">
            <span class="m">${fmtMonth(m.month)}</span>
            <div class="conv-track"><div class="conv-fill" style="width:${m.conversion}%"></div></div>
            <span class="pct">${m.conversion}%</span>
          </div>`).join('')}
      </div>

      <div class="card-box">
        <h3>${scoped ? 'Funnel for the month' : 'Current funnel'}</h3>
        <p class="desc">${scoped ? `Leads created in ${fmtMonthLong(s.month)}, by status.` : 'All leads by status.'}</p>
        <div class="funnel">
          ${Object.keys(STATUS_META).map((st) => `
            <div class="fn-row">
              <span class="lab"><span class="col-dot" style="background:${STATUS_META[st].color}"></span>${STATUS_META[st].label}</span>
              <div class="fn-bar" style="width:${Math.max(8, (s.funnel[st] / funnelMax) * 100)}%;background:${STATUS_META[st].color}">${s.funnel[st]}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card-box">
        <h3>Loss reasons</h3>
        <p class="desc">Why leads are lost.</p>
        ${s.lossBreakdown.length ? s.lossBreakdown.map((l) => `
          <div class="loss-row">
            <span class="lab">${esc(l.label)}</span>
            <div class="loss-track"><div class="loss-fill" style="width:${(l.count / maxLoss) * 100}%"></div></div>
            <span class="n">${l.count}</span>
          </div>`).join('') : '<p style="color:var(--mute);font-size:.82rem">No lost leads yet.</p>'}
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
    await loadTasks();
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
  else if (['kanban', 'leads', 'tasks', 'stats', 'users', 'redirects', 'config'].includes(h)) { state.view = h; }
  else if (state.view === 'leadDetail') { state.view = 'leads'; }
  renderApp();
}
