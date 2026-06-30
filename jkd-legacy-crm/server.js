// ============================================================
//  JKD Legacy Academy — Backoffice / mini-CRM
//  Pure Node (no external deps): node:http + node:sqlite + node:crypto
//  Auth: passwordless magic link · Sessions via httpOnly cookie
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8796;
const PUBLIC_DIR = path.join(__dirname, 'public');                 // CRM frontend (served under /crm)
const SITE_DIR = path.join(__dirname, '..', 'jkd-legacy-redesign'); // public marketing site (served at /)
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'crm.db'));
db.exec('PRAGMA journal_mode = WAL;');

// ---------------- Schema ----------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'comercial',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS magic_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  first_name TEXT, last_name TEXT,
  email TEXT, phone TEXT,
  location TEXT, experience TEXT, message TEXT,
  source TEXT DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'registrado',
  loss_reason TEXT,
  owner_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  from_status TEXT, to_status TEXT,
  loss_reason TEXT,
  note TEXT,
  user_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);
`);

// Migración: columna de atribución (origen / UTMs / URL) en leads
try { db.exec('ALTER TABLE leads ADD COLUMN attribution TEXT'); } catch (e) { /* la columna ya existe */ }
// Impersonación: el admin que "entra como" otro usuario queda registrado aquí para poder volver
try { db.exec('ALTER TABLE sessions ADD COLUMN impersonator_id INTEGER'); } catch (e) { /* la columna ya existe */ }
// Redirecciones 301/302 administrables desde el CRM (SEO: rutas viejas → nuevas)
db.exec(`CREATE TABLE IF NOT EXISTS redirects (
  id INTEGER PRIMARY KEY,
  from_path TEXT NOT NULL UNIQUE,
  to_path TEXT NOT NULL,
  code INTEGER NOT NULL DEFAULT 301,
  active INTEGER NOT NULL DEFAULT 1,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);`);
// Normaliza el origen (pathname, sin query/hash, slash inicial, sin slash final salvo raíz)
function normFrom(s) {
  s = String(s || '').trim();
  if (!s) return '';
  s = s.split('#')[0].split('?')[0];
  if (!s.startsWith('/')) s = '/' + s;
  if (s.length > 1) s = s.replace(/\/+$/, '') || '/';
  return s;
}
// Normaliza el destino (ruta relativa con slash inicial, o URL absoluta tal cual)
function normTo(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.startsWith('/')) s = '/' + s;
  return s;
}
function findRedirect(pathname) {
  const key = pathname.length > 1 ? (pathname.replace(/\/+$/, '') || '/') : pathname;
  return db.prepare('SELECT id, to_path, code FROM redirects WHERE active=1 AND from_path=? LIMIT 1').get(key) || null;
}

// ---------------- Constants ----------------
const STATUSES = ['registrado', 'contactado', 'ganado', 'perdido'];
const LOSS_REASONS = {
  no_responde: 'No responde',
  fuera_zona: 'No vive en la zona de influencia',
  sin_presupuesto: 'No tiene el presupuesto',
  spam: 'Spam',
  buscaba_empleo: 'Buscaba empleo',
};
const ROLES = ['admin', 'comercial'];
const ROLE_LABELS = { admin: 'Administrador', comercial: 'Comercial' };

// ---------------- Helpers ----------------
const nowISO = () => new Date().toISOString();
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const token = (n = 24) => crypto.randomBytes(n).toString('hex');
const clean = (s) => (s == null ? null : String(s).trim() || null);

function send(res, code, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': typeof data === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(body);
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}
function currentUser(req) {
  const sid = parseCookies(req).jkd_sid;
  if (!sid) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
  if (!s || s.expires_at < nowISO()) return null;
  const u = db.prepare('SELECT id,name,email,role,active FROM users WHERE id = ?').get(s.user_id);
  return u && u.active ? u : null;
}
function sessionRow(req) {
  const sid = parseCookies(req).jkd_sid;
  if (!sid) return null;
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid) || null;
}
const sidCookie = (sid, days = 7) => `jkd_sid=${sid}; HttpOnly; Path=/; Max-Age=${days * 86400}; SameSite=Lax`;

// ---------------- Seed ----------------
function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count > 0) return;
  console.log('· Seeding usuarios iniciales (sin leads)…');
  const insU = db.prepare('INSERT INTO users (name,email,role,active,created_at) VALUES (?,?,?,1,?)');
  insU.run('Administrador', 'admin@jkdlegacy.com.au', 'admin', nowISO());
  insU.run('Comercial', 'comercial@jkdlegacy.com.au', 'comercial', nowISO());
  console.log('· Seed completo: 2 usuarios (administrador + comercial), 0 leads.');
}
seed();

// ---------------- Settings (site config / external marketing tags) ----------------
// Formulario de captura por defecto (igual al sitio actual: Nombre, Correo, Teléfono, Camino)
const DEFAULT_FORM = {
  text: {
    eyebrow_en: 'Inquire to Train', eyebrow_es: 'Solicita Entrenar',
    heading_en: 'Begin the Conversation.', heading_es: 'Empieza la Conversación.',
    intro_en: 'Submit the form and Sigung Vargas (or the Adelaide head instructor) will reach out personally to schedule a private call.',
    intro_es: 'Envía el formulario y el Sigung Vargas (o el instructor principal de Adelaide) te contactará personalmente para agendar una llamada privada.',
    submit_en: 'Submit Inquiry', submit_es: 'Enviar Solicitud',
    privacy_en: 'Your inquiry is private. We do not share your information.',
    privacy_es: 'Tu solicitud es privada. No compartimos tu información.',
  },
  fields: [
    { key: 'name', type: 'text', required: true, label: 'Name', labelEs: 'Nombre' },
    { key: 'email', type: 'email', required: true, label: 'Email', labelEs: 'Correo electrónico' },
    { key: 'phone', type: 'tel', required: true, label: 'Phone', labelEs: 'Teléfono' },
    { key: 'path', type: 'select', required: true, label: 'Which path interests you?', labelEs: '¿Qué camino te interesa?',
      options: ['Foundation', 'Progression', 'Mastery', 'Not sure'], optionsEs: ['Base', 'Progresión', 'Maestría', 'Inseguro'] },
  ],
};
// Defaults portados del sitio actual jkdlegacy.com.au (PixelYourSite + Site Kit)
const DEFAULT_SETTINGS = {
  form_config: JSON.stringify(DEFAULT_FORM),
  tracking_enabled: '1',
  ga4_id: 'G-MXNZZXDP2E',          // Google Analytics 4
  google_tag_id: 'GT-M3VXNNZ',     // Google Tag (Site Kit)
  gtm_id: '',                      // Google Tag Manager (contenedor)
  meta_pixel_id: '918178380081272',// Meta (Facebook) Pixel
  google_ads_id: '',               // Google Ads (Conversion ID)
  tiktok_pixel_id: '',             // TikTok Pixel
  google_site_verification: '',    // Google Search Console (content del meta)
  facebook_domain_verification: '',// Meta domain verification (content del meta)
  bing_site_verification: '',      // Bing Webmaster (msvalidate.01)
  custom_head: '',                 // HTML libre inyectado en <head> (admin)
};
const ALLOWED_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
function ensureSettings() {
  const ins = db.prepare("INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v, nowISO());
  // Migración: completa el form_config legacy que aún no tenga la sección de textos
  try {
    const obj = JSON.parse(getAllSettings().form_config);
    if (obj && !obj.text) {
      obj.text = DEFAULT_FORM.text;
      db.prepare("UPDATE settings SET value=?, updated_at=? WHERE key='form_config'").run(JSON.stringify(obj), nowISO());
    }
  } catch (e) { /* noop */ }
}
function getAllSettings() {
  const o = {};
  for (const r of db.prepare('SELECT key,value FROM settings').all()) o[r.key] = r.value;
  return o;
}
function publicSiteConfig() {
  const s = getAllSettings();
  return {
    enabled: s.tracking_enabled === '1',
    ga4_id: s.ga4_id || '', google_tag_id: s.google_tag_id || '', gtm_id: s.gtm_id || '',
    meta_pixel_id: s.meta_pixel_id || '', google_ads_id: s.google_ads_id || '', tiktok_pixel_id: s.tiktok_pixel_id || '',
  };
}
// Verification metas + custom HTML get injected server-side into the marketing <head>
// (verification crawlers don't run JS, so these can't go through analytics.js).
function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ----- SEO local + bilingüe (inyectado en el <head> del sitio público) -----
const SITE_ORIGIN = 'https://jkdlegacy.com.au';
const GEO_META =
  '<meta name="geo.region" content="AU-VIC">' +
  '<meta name="geo.placename" content="Maidstone, Melbourne">' +
  '<meta name="geo.position" content="-37.7774;144.8776">' +
  '<meta name="ICBM" content="-37.7774, 144.8776">';
const SOCIALS = ['https://www.facebook.com/RicardoVargasJeetKuneDo/', 'https://www.instagram.com/jkdaustralia/', 'https://www.youtube.com/@RicardoVargasJKD'];
const ORG_ID = SITE_ORIGIN + '/#academy';
const FOUNDER_ID = SITE_ORIGIN + '/#sigung-ricardo-vargas';
const ADELAIDE_ID = SITE_ORIGIN + '/#adelaide-kwoon';
// Datos estructurados ricos (@graph) — pensados para SEO clásico Y motores de IA (GEO):
// describen qué es, dónde, quién enseña, qué se ofrece y a qué precio, todo "citable".
const JSON_LD = '<script type="application/ld+json">' + JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite', '@id': SITE_ORIGIN + '/#website',
      url: SITE_ORIGIN + '/', name: 'The JKD Legacy Academy',
      inLanguage: ['en-AU', 'es'], publisher: { '@id': ORG_ID },
    },
    {
      '@type': ['SportsActivityLocation', 'SportsClub', 'LocalBusiness'], '@id': ORG_ID,
      name: 'The JKD Legacy Academy', alternateName: 'JKD Legacy',
      description: "Authentic Jeet Kune Do — Bruce Lee's direct lineage — taught in Melbourne (Maidstone, inner-west) and Adelaide under Sigung Ricardo Vargas. A private-membership Kwoon for committed students.",
      url: SITE_ORIGIN + '/', telephone: '+61459785073', email: 'jkdaustralia@gmail.com',
      image: { '@type': 'ImageObject', url: SITE_ORIGIN + '/images/og-image.jpg', width: 1200, height: 630 },
      logo: { '@type': 'ImageObject', url: SITE_ORIGIN + '/images/logo-horizontal.png' },
      priceRange: 'A$175-A$650', currenciesAccepted: 'AUD', sport: 'Jeet Kune Do',
      slogan: 'Under the sky, under the heavens, there is but one family.', foundingDate: '2011',
      knowsAbout: ['Jeet Kune Do', 'Bruce Lee', 'Jun Fan Gung Fu', 'Martial arts', 'Self-defence', 'Trapping', 'Kickboxing'],
      address: { '@type': 'PostalAddress', streetAddress: 'Unit 6 / 72-80 Hampstead Rd', addressLocality: 'Maidstone', addressRegion: 'VIC', postalCode: '3012', addressCountry: 'AU' },
      geo: { '@type': 'GeoCoordinates', latitude: -37.7774, longitude: 144.8776 },
      hasMap: 'https://www.google.com/maps?q=Unit%206%2F72-80%20Hampstead%20Rd%2C%20Maidstone%20VIC%203012',
      areaServed: ['Maidstone', 'Maribyrnong', 'Footscray', 'Yarraville', 'Sunshine', 'West Footscray', 'Melbourne', 'Adelaide'].map((n) => ({ '@type': 'Place', name: n })),
      sameAs: SOCIALS, founder: { '@id': FOUNDER_ID }, subOrganization: { '@id': ADELAIDE_ID },
      employee: [
        { '@id': FOUNDER_ID },
        { '@type': 'Person', name: 'Sifu Peter Pitrakkos', jobTitle: 'Jeet Kune Do Instructor', worksFor: { '@id': ORG_ID } },
        { '@type': 'Person', name: 'Sifu Thomas Pham', jobTitle: 'Jeet Kune Do Instructor', worksFor: { '@id': ORG_ID } },
        { '@type': 'Person', name: 'Sifu Paul Chiaravalle', jobTitle: 'Jeet Kune Do Instructor', worksFor: { '@id': ORG_ID } },
        { '@type': 'Person', name: 'Sifu Mattia Riccardi', jobTitle: 'Jeet Kune Do Instructor', worksFor: { '@id': ORG_ID } },
        { '@type': 'Person', name: 'Sifu Neko Tobías', jobTitle: 'Jeet Kune Do Instructor', worksFor: { '@id': ORG_ID } },
      ],
      makesOffer: [
        { '@type': 'Offer', name: '3-Month Unlimited Membership', price: '650', priceCurrency: 'AUD', category: 'Membership', url: SITE_ORIGIN + '/the-way' },
        { '@type': 'Offer', name: 'Monthly Unlimited Membership', price: '240', priceCurrency: 'AUD', category: 'Membership', url: SITE_ORIGIN + '/the-way' },
        { '@type': 'Offer', name: '12-Session Flexible Pack', price: '350', priceCurrency: 'AUD', category: 'Class pack', url: SITE_ORIGIN + '/the-way' },
        { '@type': 'Offer', name: '5-Session Flexible Pack', price: '175', priceCurrency: 'AUD', category: 'Class pack', url: SITE_ORIGIN + '/the-way' },
      ],
    },
    {
      '@type': 'Person', '@id': FOUNDER_ID, name: 'Sigung Ricardo Vargas',
      jobTitle: 'Head Instructor & Founder', worksFor: { '@id': ORG_ID },
      knowsAbout: ['Jeet Kune Do', 'Bruce Lee', 'Jun Fan Gung Fu'],
      sameAs: ['https://www.facebook.com/RicardoVargasJeetKuneDo/', 'https://www.youtube.com/@RicardoVargasJKD'],
      description: 'Second-generation Jeet Kune Do instructor certified by Sifu Jerry Poteet and Sigung Richard Bustillo, both direct students of Bruce Lee.',
    },
    {
      '@type': ['SportsActivityLocation', 'LocalBusiness'], '@id': ADELAIDE_ID,
      name: 'The JKD Legacy Academy — Adelaide Kwoon', alternateName: 'JKD Legacy Adelaide',
      description: 'The Adelaide Kwoon of The JKD Legacy Academy — the original Australian JKD Legacy school, established 2011 — led by Sifu Peter Pitrakkos.',
      parentOrganization: { '@id': ORG_ID }, url: SITE_ORIGIN + '/join-the-family',
      telephone: '+61411268793', sport: 'Jeet Kune Do', foundingDate: '2011',
      address: { '@type': 'PostalAddress', addressLocality: 'Adelaide', addressRegion: 'SA', addressCountry: 'AU' },
      areaServed: { '@type': 'Place', name: 'Adelaide' },
      employee: { '@type': 'Person', name: 'Sifu Peter Pitrakkos', jobTitle: 'Head Instructor (Adelaide)' },
    },
    {
      '@type': 'Course', '@id': SITE_ORIGIN + '/#course-foundation', name: 'Foundation',
      description: 'A 12-week beginner program in authentic Jeet Kune Do. No experience required; every session includes one-on-one corrections.',
      provider: { '@id': ORG_ID }, inLanguage: 'en', educationalLevel: 'Beginner',
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Onsite', courseWorkload: 'P12W', location: { '@id': ORG_ID } },
    },
    {
      '@type': 'Course', '@id': SITE_ORIGIN + '/#course-progression', name: 'Progression',
      description: 'The intermediate pathway: developing students refine timing, trapping and energy in the Jeet Kune Do method of Bruce Lee.',
      provider: { '@id': ORG_ID }, inLanguage: 'en', educationalLevel: 'Intermediate',
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Onsite', location: { '@id': ORG_ID } },
    },
    {
      '@type': 'Course', '@id': SITE_ORIGIN + '/#course-mastery', name: 'Mastery',
      description: 'The advanced pathway for committed students pursuing mastery and the deeper philosophy of Jeet Kune Do.',
      provider: { '@id': ORG_ID }, inLanguage: 'en', educationalLevel: 'Advanced',
      hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Onsite', location: { '@id': ORG_ID } },
    },
  ],
}) + '</script>';

function injectHead(html, seo) {
  seo = seo || { lang: 'en', path: '/' };
  const isEs = seo.lang === 'es';
  const enUrl = SITE_ORIGIN + (seo.path === '/' ? '/' : seo.path);
  const esUrl = enUrl + (enUrl.indexOf('?') > -1 ? '&' : '?') + 'lang=es';
  const canon = isEs ? esUrl : enUrl;

  let head = '';
  // Permite snippet completo + imagen grande a buscadores y motores de IA (AI Overviews, etc.),
  // solo si la página no define ya su propia política robots (p. ej. 404/thanks son noindex).
  if (!/<meta\s+name=["']robots["']/i.test(html)) {
    head += '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">';
  }
  // hreflang (en primario, es secundario, x-default)
  head += `<link rel="alternate" hreflang="en" href="${enUrl}"><link rel="alternate" hreflang="en-AU" href="${enUrl}"><link rel="alternate" hreflang="es" href="${esUrl}"><link rel="alternate" hreflang="x-default" href="${enUrl}">`;
  // Open Graph locale + url (los demás og:* van por página)
  head += `<meta property="og:url" content="${canon}"><meta property="og:locale" content="${isEs ? 'es_ES' : 'en_AU'}"><meta property="og:locale:alternate" content="${isEs ? 'en_AU' : 'es_ES'}">`;
  // Geo + datos estructurados de negocio local
  head += GEO_META + JSON_LD;
  // BreadcrumbList por página interna (estructura del sitio para buscadores y LLMs)
  const CRUMB_NAMES = { '/legacy': 'Legacy', '/the-way': 'The Way', '/join-the-family': 'Join the Family' };
  if (CRUMB_NAMES[seo.path]) {
    head += '<script type="application/ld+json">' + JSON.stringify({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN + '/' },
        { '@type': 'ListItem', position: 2, name: CRUMB_NAMES[seo.path], item: SITE_ORIGIN + seo.path },
      ],
    }) + '</script>';
  }
  // Ajustes administrables desde el CRM (verificaciones + HTML custom)
  const s = getAllSettings();
  if (s.google_site_verification) head += `<meta name="google-site-verification" content="${escAttr(s.google_site_verification)}">`;
  if (s.facebook_domain_verification) head += `<meta name="facebook-domain-verification" content="${escAttr(s.facebook_domain_verification)}">`;
  if (s.bing_site_verification) head += `<meta name="msvalidate.01" content="${escAttr(s.bing_site_verification)}">`;
  if (s.custom_head) head += '\n' + s.custom_head + '\n';

  let out = html.replace('</head>', head + '</head>');
  // Canonical self-referencing por idioma (reemplaza el estático)
  out = out.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${canon}$2`);
  // <html lang> según el idioma de la URL
  if (isEs) out = out.replace('<html lang="en">', '<html lang="es">');
  // Cache-busting: versiona CSS/JS por mtime → caché larga sin servir assets viejos
  const v = (n) => { try { return Math.floor(fs.statSync(path.join(SITE_DIR, n)).mtimeMs); } catch (e) { return '1'; } };
  out = out.replace('href="styles.css"', 'href="styles.css?v=' + v('styles.css') + '"')
           .replace('src="i18n.js"', 'src="i18n.js?v=' + v('i18n.js') + '"')
           .replace('src="script.js"', 'src="script.js?v=' + v('script.js') + '"')
           .replace('src="/analytics.js"', 'src="/analytics.js?v=' + v('analytics.js') + '"');
  return out;
}
ensureSettings();

// ---------------- Auth ----------------
function requestMagicLink(email) {
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1').get(email);
  if (!u) return { ok: false };
  const t = token(24);
  db.prepare('INSERT INTO magic_tokens (token,user_id,expires_at,used,created_at) VALUES (?,?,?,0,?)')
    .run(t, u.id, addDays(new Date(), 0.0104).toISOString(), nowISO()); // ~15 min
  const link = `http://localhost:${PORT}/crm/auth/verify?token=${t}`;
  console.log(`\n  ✉  Magic link para ${u.email} (${u.name}):\n     ${link}\n`);
  return { ok: true, link, name: u.name };
}
function verifyToken(t) {
  const row = db.prepare('SELECT * FROM magic_tokens WHERE token=?').get(t);
  if (!row || row.used || row.expires_at < nowISO()) return null;
  db.prepare('UPDATE magic_tokens SET used=1 WHERE token=?').run(t);
  const sid = token(24);
  db.prepare('INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)')
    .run(sid, row.user_id, addDays(new Date(), 7).toISOString(), nowISO());
  return sid;
}

// ---------------- Stats ----------------
function buildStats(monthArg) {
  // Meses disponibles (con datos) + el mes actual, para el selector de filtro
  const distinct = db.prepare(`SELECT DISTINCT substr(created_at,1,7) m FROM leads WHERE created_at IS NOT NULL`).all().map((r) => r.m);
  const curMonth = new Date().toISOString().slice(0, 7);
  const availableMonths = Array.from(new Set([...distinct, curMonth])).sort();
  // Solo se acepta un mes que exista en la lista blanca (derivada de la BD) → seguro para interpolar
  const month = monthArg && availableMonths.includes(monthArg) ? monthArg : null;
  const inMonth = month ? ` AND substr(created_at,1,7)='${month}'` : '';
  const inMonthW = month ? ` WHERE substr(created_at,1,7)='${month}'` : '';

  // Embudo + total (scoped al mes si hay filtro)
  const funnel = {};
  STATUSES.forEach((s) => { funnel[s] = db.prepare(`SELECT COUNT(*) c FROM leads WHERE status=?${inMonth}`).get(s).c; });
  const total = db.prepare(`SELECT COUNT(*) c FROM leads${inMonthW}`).get().c;

  // Evolución mensual: siempre los últimos 6 meses (contexto/tendencia, no se filtra)
  const months = [];
  const d0 = new Date();
  for (let i = 5; i >= 0; i--) months.push(new Date(d0.getFullYear(), d0.getMonth() - i, 1).toISOString().slice(0, 7));
  const map = (rows) => Object.fromEntries(rows.map((r) => [r.m, r.c]));
  const cM = map(db.prepare(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM leads GROUP BY m`).all());
  const wM = map(db.prepare(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM lead_events WHERE type='status' AND to_status='ganado' GROUP BY m`).all());
  const lM = map(db.prepare(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM lead_events WHERE type='status' AND to_status='perdido' GROUP BY m`).all());
  const monthly = months.map((m) => {
    const created = cM[m] || 0, won = wM[m] || 0, lost = lM[m] || 0;
    const resolved = won + lost;
    return { month: m, created, won, lost, conversion: resolved ? Math.round((won / resolved) * 100) : 0 };
  });

  // Motivos de pérdida (scoped al mes si hay filtro)
  const lossRows = db.prepare(`SELECT loss_reason r, COUNT(*) c FROM leads WHERE status='perdido' AND loss_reason IS NOT NULL${inMonth} GROUP BY r ORDER BY c DESC`).all();
  const lossBreakdown = lossRows.map((r) => ({ key: r.r, label: LOSS_REASONS[r.r] || r.r, count: r.c }));

  // KPIs: si hay filtro, se calculan sobre el mes elegido (cohorte creada ese mes + eventos de ese mes)
  let won, lost;
  if (month) {
    won = db.prepare(`SELECT COUNT(*) c FROM lead_events WHERE type='status' AND to_status='ganado' AND substr(created_at,1,7)='${month}'`).get().c;
    lost = db.prepare(`SELECT COUNT(*) c FROM lead_events WHERE type='status' AND to_status='perdido' AND substr(created_at,1,7)='${month}'`).get().c;
  } else {
    won = funnel.ganado; lost = funnel.perdido;
  }
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
  const newThisMonth = month ? total : (cM[months[months.length - 1]] || 0);
  const active = funnel.registrado + funnel.contactado;

  return { funnel, total, monthly, lossBreakdown, availableMonths, month, kpi: { total, newThisMonth, winRate, active, won, lost } };
}

// ---------------- Router ----------------
const json = (res, code, data) => send(res, code, data);
function leadRow(r) {
  const owner = r.owner_id ? db.prepare('SELECT name FROM users WHERE id=?').get(r.owner_id) : null;
  return { ...r, owner_name: owner ? owner.name : null };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let p = url.pathname;
  const method = req.method;

  // The CRM lives under /crm — strip the prefix so every route below matches uniformly
  const isCrm = p === '/crm' || p.startsWith('/crm/');
  if (isCrm) p = p.slice(4) || '/';

  // Redirecciones administrables (CRM → Redirecciones): páginas del sitio público, GET/HEAD
  if (!isCrm && (method === 'GET' || method === 'HEAD') && !p.startsWith('/api/')) {
    const ext = path.extname(p);
    if (!ext || ext === '.html') {
      const rd = findRedirect(p);
      if (rd) {
        try { db.prepare('UPDATE redirects SET hits = hits + 1 WHERE id=?').run(rd.id); } catch (e) {}
        const loc = /^https?:\/\//i.test(rd.to_path) ? rd.to_path : rd.to_path + (rd.to_path.indexOf('?') === -1 ? url.search : '');
        res.writeHead(rd.code || 301, { Location: loc, 'Cache-Control': 'no-cache' });
        return res.end();
      }
    }
  }

  // Clean URLs: permanent (301) redirect from /foo.html → /foo  (and /index.html → /)
  if (!isCrm && method === 'GET' && p.endsWith('.html')) {
    let target = p.slice(0, -5);                       // strip ".html"
    if (target.endsWith('/index')) target = target.slice(0, -6) || '/';
    res.writeHead(301, { Location: (target || '/') + url.search });
    return res.end();
  }

  // Public form config (para que el sitio renderice el formulario de captura) — CORS-open
  if (p === '/api/public/form') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache');
    if (method === 'OPTIONS') return send(res, 204, '');
    let cfg;
    try { cfg = JSON.parse(getAllSettings().form_config); } catch (e) { cfg = DEFAULT_FORM; }
    if (!cfg || !Array.isArray(cfg.fields)) cfg = DEFAULT_FORM;
    if (!cfg.text) cfg.text = DEFAULT_FORM.text;
    return json(res, 200, cfg);
  }

  // Public site config (para analytics.js del sitio) — CORS-open, sin auth
  if (p === '/api/public/site-config') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache');
    if (method === 'OPTIONS') return send(res, 204, '');
    return json(res, 200, publicSiteConfig());
  }

  // Public intake — accepts both /api/public/lead (root) and /crm/api/public/lead. CORS-open.
  if (p === '/api/public/lead') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (method === 'OPTIONS') return send(res, 204, '');
    if (method === 'POST') {
      const b = await readBody(req);
      const t = nowISO();
      const attribution = (b.attribution && typeof b.attribution === 'object') ? JSON.stringify(b.attribution) : null;
      const r = db.prepare(`INSERT INTO leads
        (first_name,last_name,email,phone,location,experience,message,source,status,attribution,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?, 'registrado', ?, ?, ?)`)
        .run(clean(b.first_name), clean(b.last_name), clean(b.email), clean(b.phone),
             clean(b.location), clean(b.experience), clean(b.message), clean(b.source) || 'website', attribution, t, t);
      const ch = (b.attribution && b.attribution.channel) ? ` · ${b.attribution.channel}` : '';
      db.prepare(`INSERT INTO lead_events (lead_id,type,to_status,note,created_at) VALUES (?, 'created','registrado',?, ?)`)
        .run(r.lastInsertRowid, 'Recibido desde el sitio web' + ch, t);
      return json(res, 201, { ok: true, id: r.lastInsertRowid });
    }
    return json(res, 405, { error: 'method' });
  }

  // ---- Auth (public) ----
  if (p === '/api/auth/request' && method === 'POST') {
    const b = await readBody(req);
    const r = requestMagicLink(String(b.email || ''));
    // Respuesta neutra: no revela si el correo existe ni a quién pertenece.
    // (devLink solo en demo local sin SMTP; en producción con email real iría null)
    return json(res, 200, { ok: true, devLink: r.ok ? r.link : null });
  }
  if (p === '/auth/verify' && method === 'GET') {
    const sid = verifyToken(url.searchParams.get('token') || '');
    // Sin señales: válido o inválido, ambos terminan en /crm (uno con sesión, otro en el login).
    if (sid) res.setHeader('Set-Cookie', `jkd_sid=${sid}; HttpOnly; Path=/; Max-Age=${7 * 86400}; SameSite=Lax`);
    res.writeHead(302, { Location: '/crm' });
    return res.end();
  }
  if (p === '/api/auth/logout' && method === 'POST') {
    const sid = parseCookies(req).jkd_sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sid);
    res.setHeader('Set-Cookie', 'jkd_sid=; HttpOnly; Path=/; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  // ---- Protected API ----
  if (p.startsWith('/api/')) {
    const user = currentUser(req);
    if (!user) return json(res, 401, { error: 'unauthorized' });

    if (p === '/api/me' && method === 'GET') {
      const sess = sessionRow(req);
      let impersonating = null;
      if (sess && sess.impersonator_id) {
        const adm = db.prepare('SELECT id,name FROM users WHERE id=?').get(sess.impersonator_id);
        if (adm) impersonating = { id: adm.id, name: adm.name };
      }
      return json(res, 200, { ...user, impersonating });
    }
    // El admin sale de la impersonación y vuelve a su propia cuenta
    if (p === '/api/auth/stop-impersonate' && method === 'POST') {
      const sess = sessionRow(req);
      if (!sess || !sess.impersonator_id) return json(res, 400, { error: 'not impersonating' });
      const admin = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(sess.impersonator_id);
      if (!admin) return json(res, 401, { error: 'unauthorized' });
      const sid = token(24);
      db.prepare('INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(sid, admin.id, addDays(new Date(), 7).toISOString(), nowISO());
      db.prepare('DELETE FROM sessions WHERE id=?').run(sess.id);
      res.setHeader('Set-Cookie', sidCookie(sid, 7));
      return json(res, 200, { ok: true });
    }

    // Leads
    if (p === '/api/leads' && method === 'GET') {
      const status = url.searchParams.get('status');
      const q = (url.searchParams.get('q') || '').toLowerCase();
      let rows = db.prepare('SELECT * FROM leads ORDER BY datetime(updated_at) DESC').all();
      if (status && STATUSES.includes(status)) rows = rows.filter((r) => r.status === status);
      if (q) rows = rows.filter((r) => `${r.first_name} ${r.last_name} ${r.email} ${r.phone}`.toLowerCase().includes(q));
      return json(res, 200, rows.map(leadRow));
    }
    if (p === '/api/leads' && method === 'POST') {
      const b = await readBody(req);
      const t = nowISO();
      const r = db.prepare(`INSERT INTO leads
        (first_name,last_name,email,phone,location,experience,message,source,status,owner_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?, 'registrado', ?, ?, ?)`)
        .run(clean(b.first_name), clean(b.last_name), clean(b.email), clean(b.phone),
             clean(b.location), clean(b.experience), clean(b.message), clean(b.source) || 'manual',
             b.owner_id || user.id, t, t);
      db.prepare(`INSERT INTO lead_events (lead_id,type,to_status,user_id,created_at) VALUES (?, 'created','registrado',?,?)`)
        .run(r.lastInsertRowid, user.id, t);
      return json(res, 201, leadRow(db.prepare('SELECT * FROM leads WHERE id=?').get(r.lastInsertRowid)));
    }
    const leadMatch = p.match(/^\/api\/leads\/(\d+)(\/status|\/note)?$/);
    if (leadMatch) {
      const id = Number(leadMatch[1]);
      const sub = leadMatch[2];
      const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(id);
      if (!lead) return json(res, 404, { error: 'not found' });

      if (!sub && method === 'GET') {
        const events = db.prepare(`SELECT e.*, u.name user_name FROM lead_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.lead_id=? ORDER BY datetime(e.created_at) ASC`).all(id);
        return json(res, 200, { ...leadRow(lead), events });
      }
      if (!sub && method === 'PATCH') {
        const b = await readBody(req);
        const fields = ['first_name','last_name','email','phone','location','experience','message','owner_id'];
        const sets = [], vals = [];
        for (const f of fields) if (f in b) { sets.push(`${f}=?`); vals.push(f === 'owner_id' ? (b[f] || null) : clean(b[f])); }
        if (sets.length) {
          vals.push(nowISO(), id);
          db.prepare(`UPDATE leads SET ${sets.join(',')}, updated_at=? WHERE id=?`).run(...vals);
        }
        return json(res, 200, leadRow(db.prepare('SELECT * FROM leads WHERE id=?').get(id)));
      }
      if (sub === '/status' && method === 'PATCH') {
        const b = await readBody(req);
        const status = String(b.status || '');
        if (!STATUSES.includes(status)) return json(res, 400, { error: 'bad status' });
        let loss = null;
        if (status === 'perdido') {
          loss = String(b.loss_reason || '');
          if (!LOSS_REASONS[loss]) return json(res, 400, { error: 'loss_reason required' });
        }
        const t = nowISO();
        db.prepare('UPDATE leads SET status=?, loss_reason=?, updated_at=? WHERE id=?')
          .run(status, loss, t, id);
        db.prepare(`INSERT INTO lead_events (lead_id,type,from_status,to_status,loss_reason,user_id,created_at) VALUES (?, 'status',?,?,?,?,?)`)
          .run(id, lead.status, status, loss, user.id, t);
        return json(res, 200, leadRow(db.prepare('SELECT * FROM leads WHERE id=?').get(id)));
      }
      if (sub === '/note' && method === 'POST') {
        const b = await readBody(req);
        const note = clean(b.note);
        if (!note) return json(res, 400, { error: 'empty' });
        const t = nowISO();
        db.prepare(`INSERT INTO lead_events (lead_id,type,note,user_id,created_at) VALUES (?, 'note',?,?,?)`).run(id, note, user.id, t);
        db.prepare('UPDATE leads SET updated_at=? WHERE id=?').run(t, id);
        return json(res, 201, { ok: true });
      }
      if (!sub && method === 'DELETE') {
        if (user.role !== 'admin') return json(res, 403, { error: 'forbidden' }); // el comercial no puede eliminar leads
        db.prepare('DELETE FROM leads WHERE id=?').run(id);
        db.prepare('DELETE FROM lead_events WHERE lead_id=?').run(id);
        return json(res, 200, { ok: true });
      }
    }

    // Users
    if (p === '/api/users' && method === 'GET') {
      return json(res, 200, db.prepare('SELECT id,name,email,role,active,created_at FROM users ORDER BY id').all());
    }
    if (p === '/api/users' && method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const b = await readBody(req);
      const name = clean(b.name), email = clean(b.email), role = ROLES.includes(b.role) ? b.role : 'comercial';
      if (!name || !email) return json(res, 400, { error: 'name & email required' });
      const exists = db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(email);
      if (exists) return json(res, 409, { error: 'email already exists' });
      const r = db.prepare('INSERT INTO users (name,email,role,active,created_at) VALUES (?,?,?,1,?)').run(name, email, role, nowISO());
      return json(res, 201, db.prepare('SELECT id,name,email,role,active,created_at FROM users WHERE id=?').get(r.lastInsertRowid));
    }
    const userMatch = p.match(/^\/api\/users\/(\d+)$/);
    if (userMatch && method === 'PATCH') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const id = Number(userMatch[1]);
      const b = await readBody(req);
      const sets = [], vals = [];
      if ('name' in b) { sets.push('name=?'); vals.push(clean(b.name)); }
      if ('email' in b) {
        const em = clean(b.email);
        if (em) {
          const dup = db.prepare('SELECT id FROM users WHERE lower(email)=lower(?) AND id<>?').get(em, id);
          if (dup) return json(res, 409, { error: 'email already exists' });
          sets.push('email=?'); vals.push(em);
        }
      }
      if ('role' in b && ROLES.includes(b.role)) { sets.push('role=?'); vals.push(b.role); }
      if ('active' in b) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
      if (sets.length) { vals.push(id); db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals); }
      return json(res, 200, db.prepare('SELECT id,name,email,role,active,created_at FROM users WHERE id=?').get(id));
    }
    // "Entrar como" un usuario (impersonación) — SOLO admin
    const impMatch = p.match(/^\/api\/users\/(\d+)\/impersonate$/);
    if (impMatch && method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const target = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(Number(impMatch[1]));
      if (!target) return json(res, 404, { error: 'not found' });
      if (target.id === user.id) return json(res, 400, { error: 'ya eres tú' });
      // Conserva al admin original aunque ya se esté impersonando a alguien
      const sess = sessionRow(req);
      const adminId = sess && sess.impersonator_id ? sess.impersonator_id : user.id;
      const sid = token(24);
      db.prepare('INSERT INTO sessions (id,user_id,expires_at,created_at,impersonator_id) VALUES (?,?,?,?,?)')
        .run(sid, target.id, addDays(new Date(), 1).toISOString(), nowISO(), adminId);
      res.setHeader('Set-Cookie', sidCookie(sid, 1));
      return json(res, 200, { ok: true, as: { id: target.id, name: target.name, role: target.role } });
    }

    // Stats
    if (p === '/api/stats' && method === 'GET') return json(res, 200, buildStats(url.searchParams.get('month')));
    if (p === '/api/meta' && method === 'GET') return json(res, 200, { statuses: STATUSES, lossReasons: LOSS_REASONS, roles: ROLES });

    // Site settings (external marketing tags)
    if (p === '/api/settings' && method === 'GET') return json(res, 200, getAllSettings());
    if (p === '/api/settings' && method === 'PUT') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const b = await readBody(req);
      const up = db.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at");
      for (const k of ALLOWED_SETTING_KEYS) if (k in b) up.run(k, String(b[k] == null ? '' : b[k]).trim(), nowISO());
      return json(res, 200, getAllSettings());
    }

    // Redirecciones 301/302 administrables (solo admin)
    if (p === '/api/redirects' && method === 'GET') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      return json(res, 200, db.prepare('SELECT * FROM redirects ORDER BY id DESC').all());
    }
    if (p === '/api/redirects' && method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const b = await readBody(req);
      const from = normFrom(b.from_path), to = normTo(b.to_path);
      const code = Number(b.code) === 302 ? 302 : 301;
      if (!from || !to) return json(res, 400, { error: 'from & to required' });
      if (from === '/' || from.startsWith('/crm') || from.startsWith('/api')) return json(res, 400, { error: 'origen no permitido (no uses /, /crm o /api)' });
      if (from === to) return json(res, 400, { error: 'el origen y el destino no pueden ser iguales' });
      if (db.prepare('SELECT id FROM redirects WHERE from_path=?').get(from)) return json(res, 409, { error: 'ya existe una redirección para ese origen' });
      const r = db.prepare('INSERT INTO redirects (from_path,to_path,code,active,hits,created_at) VALUES (?,?,?,1,0,?)').run(from, to, code, nowISO());
      return json(res, 201, db.prepare('SELECT * FROM redirects WHERE id=?').get(r.lastInsertRowid));
    }
    const redirMatch = p.match(/^\/api\/redirects\/(\d+)$/);
    if (redirMatch) {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const id = Number(redirMatch[1]);
      if (method === 'DELETE') {
        db.prepare('DELETE FROM redirects WHERE id=?').run(id);
        return json(res, 200, { ok: true });
      }
      if (method === 'PATCH') {
        const b = await readBody(req);
        const sets = [], vals = [];
        if ('from_path' in b) {
          const from = normFrom(b.from_path);
          if (!from || from === '/' || from.startsWith('/crm') || from.startsWith('/api')) return json(res, 400, { error: 'origen no permitido' });
          if (db.prepare('SELECT id FROM redirects WHERE from_path=? AND id<>?').get(from, id)) return json(res, 409, { error: 'ya existe una redirección para ese origen' });
          sets.push('from_path=?'); vals.push(from);
        }
        if ('to_path' in b) { const to = normTo(b.to_path); if (!to) return json(res, 400, { error: 'destino requerido' }); sets.push('to_path=?'); vals.push(to); }
        if ('code' in b) { sets.push('code=?'); vals.push(Number(b.code) === 302 ? 302 : 301); }
        if ('active' in b) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
        if (sets.length) { vals.push(id); db.prepare(`UPDATE redirects SET ${sets.join(',')} WHERE id=?`).run(...vals); }
        return json(res, 200, db.prepare('SELECT * FROM redirects WHERE id=?').get(id));
      }
    }

    return json(res, 404, { error: 'no route' });
  }

  // ---- Static ----
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (isCrm) return serveStatic(res, p, PUBLIC_DIR, true, gz, false, null);   // CRM SPA: assets no-cache (siempre frescos)
  const lang = url.searchParams.get('lang') === 'es' ? 'es' : 'en';
  return serveStatic(res, p, SITE_DIR, false, gz, true, { lang, path: p });   // marketing: caché larga + SEO bilingüe
}

// Wrap so a single failing request can never crash the whole server
const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('✗ Request error', req.method, req.url, '→', err?.message || err);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  });
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e?.message || e));

function serveStatic(res, p, dir, spa, gz, longCache, seo) {
  let rel = p === '/' ? 'index.html' : decodeURIComponent(p.replace(/^\/+/, '')).replace(/\/$/, '');
  // Clean URLs: /thanks -> thanks.html (when that file exists)
  if (rel && !path.extname(rel)) {
    const cand = path.join(dir, rel + '.html');
    if (cand.startsWith(dir) && fs.existsSync(cand)) rel = rel + '.html';
  }
  const full = path.join(dir, rel || 'index.html');
  if (!full.startsWith(dir)) return send(res, 403, 'forbidden');
  fs.readFile(full, (err, buf) => {
    if (err) {
      if (spa) return fs.readFile(path.join(dir, 'index.html'), (e2, idx) => e2 ? send(res, 404, 'Not found') : sendFile(res, '.html', idx, gz, longCache));
      return serve404(res);
    }
    const ext = path.extname(full).toLowerCase();
    // Inject SEO (hreflang/canonical/og/geo/JSON-LD) + verification metas + custom <head> HTML
    if (dir === SITE_DIR && ext === '.html') buf = Buffer.from(injectHead(buf.toString('utf8'), seo), 'utf8');
    sendFile(res, ext, buf, gz, longCache);
  });
}
function sendFile(res, ext, buf, gz, longCache) {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff',
  };
  const ctype = types[ext] || 'application/octet-stream';
  const cache = /image|font/.test(ctype) ? 'public, max-age=2592000'  // 30 días: imágenes/fuentes
              : ext === '.html' ? 'no-cache'                          // HTML revalida siempre
              : longCache ? 'public, max-age=3600'                    // sitio público: css/js 1 hora
              : 'no-cache';                                           // CRM: css/js revalidan (siempre frescos)
  const textual = /text\/|javascript|json|xml|svg/.test(ctype);
  const headers = { 'Content-Type': ctype, 'Cache-Control': cache, 'Vary': 'Accept-Encoding' };
  if (gz && textual && buf.length > 512) {
    const z = zlib.gzipSync(buf);
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
    return res.end(z);
  }
  res.writeHead(200, headers);
  res.end(buf);
}

// Branded 404 page served with HTTP 404 for unknown marketing URLs
function serve404(res) {
  fs.readFile(path.join(SITE_DIR, '404.html'), (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

server.listen(PORT, () => {
  console.log(`\n  🐉  JKD Legacy CRM corriendo en  http://localhost:${PORT}`);
  console.log(`     Ingresa con:  admin@jkdlegacy.com.au  (rol admin)\n`);
});
