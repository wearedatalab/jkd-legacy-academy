// ============================================================
//  JKD Legacy Academy — App handler (async, portable)
//  DB async (Turso libSQL en prod / node:sqlite en local) vía ./db.js
//  Sirve el sitio de marketing en "/" y el CRM en "/crm" (un solo origen).
//  Fixes de seguridad integrados (ver README-SECURITY / auditoría).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';
import { sendMagicLink } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');                      // …/jkd-legacy-crm (o raíz en Vercel)
// CRM SPA (bajo /crm). En Vercel la carpeta se llama "webui" (no "public", que Vercel sirve como estáticos en "/")
const PUBLIC_CANDIDATES = [path.join(ROOT, 'webui'), path.join(ROOT, 'public')];
const PUBLIC_DIR = PUBLIC_CANDIDATES.find((d) => { try { return fs.existsSync(d); } catch { return false; } }) || PUBLIC_CANDIDATES[PUBLIC_CANDIDATES.length - 1];
// El sitio de marketing puede estar como ./site (deploy Vercel) o ../jkd-legacy-redesign (local)
const SITE_CANDIDATES = [process.env.SITE_DIR, path.join(ROOT, 'site'), path.join(ROOT, '..', 'jkd-legacy-redesign')].filter(Boolean);
const SITE_DIR = SITE_CANDIDATES.find((d) => { try { return fs.existsSync(d); } catch { return false; } }) || SITE_CANDIDATES[SITE_CANDIDATES.length - 1];
const IS_PROD = !!(process.env.VERCEL || process.env.NODE_ENV === 'production');

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
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---------------- Helpers ----------------
const nowISO = () => new Date().toISOString();
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const addMinutes = (n) => new Date(Date.now() + n * 60000);
const token = (n = 24) => crypto.randomBytes(n).toString('hex');
const clean = (s) => (s == null ? null : String(s).trim() || null);
const cap = (s, n) => { const v = clean(s); return v == null ? null : v.slice(0, n); };

function send(res, code, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': typeof data === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(body);
}
const json = (res, code, data) => send(res, code, data);

function setSecurityHeaders(res, isCrm) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', isCrm ? 'DENY' : 'SAMEORIGIN');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function baseUrl(req) {
  if (process.env.APP_URL) return String(process.env.APP_URL).replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0] || (IS_PROD ? 'https' : 'http');
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
  return `${proto}://${host}`;
}
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || '0.0.0.0';
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
  // Vercel (y otros frameworks) pre-parsean el body → úsalo si ya viene resuelto
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') { try { return Promise.resolve(req.body ? JSON.parse(req.body) : {}); } catch { return Promise.resolve({}); } }
    if (typeof req.body === 'object') return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let b = '';
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { finish(b ? JSON.parse(b) : {}); } catch { finish({}); } });
    req.on('error', () => finish({}));
    // Salvaguarda: si el stream ya fue consumido y no re-emite, no cuelgues
    setTimeout(() => finish(b ? (() => { try { return JSON.parse(b); } catch { return {}; } })() : {}), 5000);
  });
}
const sidCookie = (sid, days = 7) => `jkd_sid=${sid}; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}Path=/; Max-Age=${days * 86400}; SameSite=Lax`;
const clearCookie = () => `jkd_sid=; HttpOnly; ${IS_PROD ? 'Secure; ' : ''}Path=/; Max-Age=0; SameSite=Lax`;

// Rate limit fijo por ventana, respaldado en BD (funciona entre invocaciones serverless)
async function rateOk(bucket, max, windowSec) {
  const now = Date.now();
  const row = await db.get('SELECT count, window_start FROM rate_hits WHERE bucket=?', [bucket]);
  if (!row) { await db.run('INSERT INTO rate_hits (bucket,count,window_start) VALUES (?,1,?)', [bucket, String(now)]); return true; }
  if (now - Number(row.window_start) > windowSec * 1000) {
    await db.run('UPDATE rate_hits SET count=1, window_start=? WHERE bucket=?', [String(now), bucket]);
    return true;
  }
  if (Number(row.count) < max) { await db.run('UPDATE rate_hits SET count=count+1 WHERE bucket=?', [bucket]); return true; }
  return false;
}

async function currentUser(req) {
  const sid = parseCookies(req).jkd_sid;
  if (!sid) return null;
  const s = await db.get('SELECT * FROM sessions WHERE id = ?', [sid]);
  if (!s || s.expires_at < nowISO()) return null;
  const u = await db.get('SELECT id,name,email,role,active FROM users WHERE id = ?', [s.user_id]);
  return u && u.active ? u : null;
}
async function sessionRow(req) {
  const sid = parseCookies(req).jkd_sid;
  if (!sid) return null;
  return (await db.get('SELECT * FROM sessions WHERE id = ?', [sid])) || null;
}

// ---------------- Schema + seed + settings ----------------
let _initP = null;
export function ensureInit() { return _initP || (_initP = doInit()); }
async function doInit() {
  await db.ready();
  await ensureSchema();
  await seed();
  await ensureSettings();
}
async function ensureSchema() {
  await db.execMany([
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'comercial', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS magic_tokens (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, impersonator_id INTEGER)`,
    `CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, location TEXT, experience TEXT, message TEXT, source TEXT DEFAULT 'website', status TEXT NOT NULL DEFAULT 'registrado', loss_reason TEXT, owner_id INTEGER, attribution TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS lead_events (id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL, type TEXT NOT NULL, from_status TEXT, to_status TEXT, loss_reason TEXT, note TEXT, user_id INTEGER, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS redirects (id INTEGER PRIMARY KEY, from_path TEXT NOT NULL UNIQUE, to_path TEXT NOT NULL, code INTEGER NOT NULL DEFAULT 301, active INTEGER NOT NULL DEFAULT 1, hits INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS rate_hits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_leads_updated ON leads(updated_at)`,
    `CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`,
    `CREATE INDEX IF NOT EXISTS idx_events_lead ON lead_events(lead_id)`,
  ]);
  // Migraciones idempotentes para BDs preexistentes (columnas ya incluidas arriba en BDs nuevas)
  for (const stmt of ['ALTER TABLE leads ADD COLUMN attribution TEXT', 'ALTER TABLE sessions ADD COLUMN impersonator_id INTEGER']) {
    try { await db.run(stmt); } catch (e) { /* la columna ya existe */ }
  }
}
async function seed() {
  const c = await db.get('SELECT COUNT(*) c FROM users');
  if (Number(c.c) > 0) return;
  const t = nowISO();
  // El correo admin es configurable por env (debe ser un buzón real: ahí llega el magic link)
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@jkdlegacy.com.au').trim().toLowerCase();
  await db.run('INSERT INTO users (name,email,role,active,created_at) VALUES (?,?,?,1,?)', ['Administrador', adminEmail, 'admin', t]);
  await db.run('INSERT INTO users (name,email,role,active,created_at) VALUES (?,?,?,1,?)', ['Comercial', 'comercial@jkdlegacy.com.au', 'comercial', t]);
  console.log('· Seed: admin (' + adminEmail + ') + comercial, 0 leads.');
}

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
const DEFAULT_SETTINGS = {
  form_config: JSON.stringify(DEFAULT_FORM),
  tracking_enabled: '1',
  ga4_id: 'G-MXNZZXDP2E', google_tag_id: 'GT-M3VXNNZ', gtm_id: '',
  meta_pixel_id: '918178380081272', google_ads_id: '', tiktok_pixel_id: '',
  google_site_verification: '', facebook_domain_verification: '', bing_site_verification: '', custom_head: '',
};
const ALLOWED_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
async function ensureSettings() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.run('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)', [k, v, nowISO()]);
  }
  try {
    const all = await getAllSettings();
    const obj = JSON.parse(all.form_config);
    if (obj && !obj.text) {
      obj.text = DEFAULT_FORM.text;
      await db.run("UPDATE settings SET value=?, updated_at=? WHERE key='form_config'", [JSON.stringify(obj), nowISO()]);
    }
  } catch (e) { /* noop */ }
}
async function getAllSettings() {
  const o = {};
  for (const r of await db.all('SELECT key,value FROM settings')) o[r.key] = r.value;
  return o;
}
function publicSiteConfig(s) {
  return {
    enabled: s.tracking_enabled === '1',
    ga4_id: s.ga4_id || '', google_tag_id: s.google_tag_id || '', gtm_id: s.gtm_id || '',
    meta_pixel_id: s.meta_pixel_id || '', google_ads_id: s.google_ads_id || '', tiktok_pixel_id: s.tiktok_pixel_id || '',
  };
}
function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---------------- Redirects ----------------
function normFrom(s) {
  s = String(s || '').trim();
  if (!s) return '';
  s = s.split('#')[0].split('?')[0];
  if (!s.startsWith('/')) s = '/' + s;
  if (s.length > 1) s = s.replace(/\/+$/, '') || '/';
  return s;
}
function normTo(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.startsWith('/')) s = '/' + s;
  return s;
}
async function findRedirect(pathname) {
  const key = pathname.length > 1 ? (pathname.replace(/\/+$/, '') || '/') : pathname;
  return (await db.get('SELECT id, to_path, code FROM redirects WHERE active=1 AND from_path=? LIMIT 1', [key])) || null;
}

// ---------------- SEO head injection (marketing) ----------------
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
const JSON_LD = '<script type="application/ld+json">' + JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': SITE_ORIGIN + '/#website', url: SITE_ORIGIN + '/', name: 'The JKD Legacy Academy', inLanguage: ['en-AU', 'es'], publisher: { '@id': ORG_ID } },
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
    { '@type': 'Course', '@id': SITE_ORIGIN + '/#course-foundation', name: 'Foundation', description: 'A 12-week beginner program in authentic Jeet Kune Do. No experience required; every session includes one-on-one corrections.', provider: { '@id': ORG_ID }, inLanguage: 'en', educationalLevel: 'Beginner', hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Onsite', courseWorkload: 'P12W', location: { '@id': ORG_ID } } },
    { '@type': 'Course', '@id': SITE_ORIGIN + '/#course-progression', name: 'Progression', description: 'The intermediate pathway: developing students refine timing, trapping and energy in the Jeet Kune Do method of Bruce Lee.', provider: { '@id': ORG_ID }, inLanguage: 'en', educationalLevel: 'Intermediate', hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Onsite', location: { '@id': ORG_ID } } },
    { '@type': 'Course', '@id': SITE_ORIGIN + '/#course-mastery', name: 'Mastery', description: 'The advanced pathway for committed students pursuing mastery and the deeper philosophy of Jeet Kune Do.', provider: { '@id': ORG_ID }, inLanguage: 'en', educationalLevel: 'Advanced', hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Onsite', location: { '@id': ORG_ID } } },
  ],
}) + '</script>';

async function injectHead(html, seo) {
  seo = seo || { lang: 'en', path: '/' };
  const isEs = seo.lang === 'es';
  const enUrl = SITE_ORIGIN + (seo.path === '/' ? '/' : seo.path);
  const esUrl = enUrl + (enUrl.indexOf('?') > -1 ? '&' : '?') + 'lang=es';
  const canon = isEs ? esUrl : enUrl;

  let head = '';
  if (!/<meta\s+name=["']robots["']/i.test(html)) {
    head += '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">';
  }
  head += `<link rel="alternate" hreflang="en" href="${enUrl}"><link rel="alternate" hreflang="en-AU" href="${enUrl}"><link rel="alternate" hreflang="es" href="${esUrl}"><link rel="alternate" hreflang="x-default" href="${enUrl}">`;
  head += `<meta property="og:url" content="${canon}"><meta property="og:locale" content="${isEs ? 'es_ES' : 'en_AU'}"><meta property="og:locale:alternate" content="${isEs ? 'en_AU' : 'es_ES'}">`;
  head += GEO_META + JSON_LD;
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
  const s = await getAllSettings();
  if (s.google_site_verification) head += `<meta name="google-site-verification" content="${escAttr(s.google_site_verification)}">`;
  if (s.facebook_domain_verification) head += `<meta name="facebook-domain-verification" content="${escAttr(s.facebook_domain_verification)}">`;
  if (s.bing_site_verification) head += `<meta name="msvalidate.01" content="${escAttr(s.bing_site_verification)}">`;
  if (s.custom_head) head += '\n' + s.custom_head + '\n';

  let out = html.replace('</head>', head + '</head>');
  out = out.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${canon}$2`);
  if (isEs) out = out.replace('<html lang="en">', '<html lang="es">');
  const v = (n) => { try { return Math.floor(fs.statSync(path.join(SITE_DIR, n)).mtimeMs); } catch (e) { return '1'; } };
  out = out.replace('href="styles.css"', 'href="styles.css?v=' + v('styles.css') + '"')
    .replace('src="i18n.js"', 'src="i18n.js?v=' + v('i18n.js') + '"')
    .replace('src="script.js"', 'src="script.js?v=' + v('script.js') + '"')
    .replace('src="/analytics.js"', 'src="/analytics.js?v=' + v('analytics.js') + '"');
  return out;
}

// ---------------- Auth ----------------
async function requestMagicLink(email, base) {
  // Limpieza oportunista de expirados/usados (evita crecimiento sin límite)
  try { await db.run('DELETE FROM magic_tokens WHERE used=1 OR expires_at < ?', [nowISO()]); } catch (e) {}
  try { await db.run('DELETE FROM sessions WHERE expires_at < ?', [nowISO()]); } catch (e) {}
  const u = await db.get('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1', [email]);
  if (!u) return { ok: false };
  try { await db.run('UPDATE magic_tokens SET used=1 WHERE user_id=? AND used=0', [u.id]); } catch (e) {}
  const t = token(24);
  await db.run('INSERT INTO magic_tokens (token,user_id,expires_at,used,created_at) VALUES (?,?,?,0,?)', [t, u.id, addMinutes(15).toISOString(), nowISO()]);
  const link = `${base}/crm/auth/verify?token=${t}`;
  if (process.env.RESEND_API_KEY) await sendMagicLink({ to: u.email, name: u.name, link });
  if (!IS_PROD) console.log(`\n  ✉  Magic link para ${u.email} (${u.name}):\n     ${link}\n`);
  return { ok: true, link, name: u.name };
}
async function verifyToken(t) {
  const row = await db.get('SELECT * FROM magic_tokens WHERE token=?', [t]);
  if (!row || row.used || row.expires_at < nowISO()) return null;
  await db.run('UPDATE magic_tokens SET used=1 WHERE token=?', [t]);
  const sid = token(24);
  await db.run('INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)', [sid, row.user_id, addDays(new Date(), 7).toISOString(), nowISO()]);
  return sid;
}

// ---------------- Stats ----------------
async function buildStats(monthArg) {
  const distinct = (await db.all(`SELECT DISTINCT substr(created_at,1,7) m FROM leads WHERE created_at IS NOT NULL`)).map((r) => r.m);
  const curMonth = new Date().toISOString().slice(0, 7);
  const availableMonths = Array.from(new Set([...distinct, curMonth])).sort();
  const month = monthArg && availableMonths.includes(monthArg) ? monthArg : null;
  const inMonth = month ? ` AND substr(created_at,1,7)='${month}'` : '';
  const inMonthW = month ? ` WHERE substr(created_at,1,7)='${month}'` : '';

  const funnel = {};
  for (const s of STATUSES) funnel[s] = Number((await db.get(`SELECT COUNT(*) c FROM leads WHERE status=?${inMonth}`, [s])).c);
  const total = Number((await db.get(`SELECT COUNT(*) c FROM leads${inMonthW}`)).c);

  const months = [];
  const d0 = new Date();
  for (let i = 5; i >= 0; i--) months.push(new Date(d0.getFullYear(), d0.getMonth() - i, 1).toISOString().slice(0, 7));
  const map = (rows) => Object.fromEntries(rows.map((r) => [r.m, Number(r.c)]));
  const cM = map(await db.all(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM leads GROUP BY m`));
  const wM = map(await db.all(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM lead_events WHERE type='status' AND to_status='ganado' GROUP BY m`));
  const lM = map(await db.all(`SELECT substr(created_at,1,7) m, COUNT(*) c FROM lead_events WHERE type='status' AND to_status='perdido' GROUP BY m`));
  const monthly = months.map((m) => {
    const created = cM[m] || 0, won = wM[m] || 0, lost = lM[m] || 0;
    const resolved = won + lost;
    return { month: m, created, won, lost, conversion: resolved ? Math.round((won / resolved) * 100) : 0 };
  });

  const lossRows = await db.all(`SELECT loss_reason r, COUNT(*) c FROM leads WHERE status='perdido' AND loss_reason IS NOT NULL${inMonth} GROUP BY r ORDER BY c DESC`);
  const lossBreakdown = lossRows.map((r) => ({ key: r.r, label: LOSS_REASONS[r.r] || r.r, count: Number(r.c) }));

  let won, lost;
  if (month) {
    won = Number((await db.get(`SELECT COUNT(*) c FROM lead_events WHERE type='status' AND to_status='ganado' AND substr(created_at,1,7)='${month}'`)).c);
    lost = Number((await db.get(`SELECT COUNT(*) c FROM lead_events WHERE type='status' AND to_status='perdido' AND substr(created_at,1,7)='${month}'`)).c);
  } else { won = funnel.ganado; lost = funnel.perdido; }
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
  const newThisMonth = month ? total : (cM[months[months.length - 1]] || 0);
  const active = funnel.registrado + funnel.contactado;
  return { funnel, total, monthly, lossBreakdown, availableMonths, month, kpi: { total, newThisMonth, winRate, active, won, lost } };
}

async function leadRow(r) {
  const owner = r.owner_id ? await db.get('SELECT name FROM users WHERE id=?', [r.owner_id]) : null;
  return { ...r, owner_name: owner ? owner.name : null };
}

// ---------------- Router ----------------
export async function handle(req, res) {
  await ensureInit();
  const url = new URL(req.url, baseUrl(req));
  let p = url.pathname;
  const method = req.method;

  const isCrm = p === '/crm' || p.startsWith('/crm/');
  if (isCrm) p = p.slice(4) || '/';
  setSecurityHeaders(res, isCrm);

  // Redirecciones administrables (CRM → Redirecciones): páginas del sitio público, GET/HEAD
  if (!isCrm && (method === 'GET' || method === 'HEAD') && !p.startsWith('/api/')) {
    const ext = path.extname(p);
    if (!ext || ext === '.html') {
      const rd = await findRedirect(p);
      if (rd) {
        try { await db.run('UPDATE redirects SET hits = hits + 1 WHERE id=?', [rd.id]); } catch (e) {}
        const loc = /^https?:\/\//i.test(rd.to_path) ? rd.to_path : rd.to_path + (rd.to_path.indexOf('?') === -1 ? url.search : '');
        res.writeHead(rd.code || 301, { Location: loc, 'Cache-Control': 'no-cache' });
        return res.end();
      }
    }
  }

  // Clean URLs: 301 de /foo.html → /foo
  if (!isCrm && method === 'GET' && p.endsWith('.html')) {
    let target = p.slice(0, -5);
    if (target.endsWith('/index')) target = target.slice(0, -6) || '/';
    res.writeHead(301, { Location: (target || '/') + url.search });
    return res.end();
  }

  // Public form config
  if (p === '/api/public/form') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache');
    if (method === 'OPTIONS') return send(res, 204, '');
    let cfg;
    try { cfg = JSON.parse((await getAllSettings()).form_config); } catch (e) { cfg = DEFAULT_FORM; }
    if (!cfg || !Array.isArray(cfg.fields)) cfg = DEFAULT_FORM;
    if (!cfg.text) cfg.text = DEFAULT_FORM.text;
    return json(res, 200, cfg);
  }

  // Public site config
  if (p === '/api/public/site-config') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache');
    if (method === 'OPTIONS') return send(res, 204, '');
    return json(res, 200, publicSiteConfig(await getAllSettings()));
  }

  // Public intake — rate-limited + validado + honeypot
  if (p === '/api/public/lead') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (method === 'OPTIONS') return send(res, 204, '');
    if (method === 'POST') {
      if (!(await rateOk(`lead:${clientIp(req)}`, 20, 3600))) return json(res, 429, { error: 'Demasiadas solicitudes. Inténtalo más tarde.' });
      const b = await readBody(req);
      // Honeypot: campos ocultos que solo un bot rellenaría → fingir éxito y descartar
      if (clean(b.company) || clean(b.website) || clean(b.fax)) return json(res, 201, { ok: true });
      const email = cap(b.email, 160);
      if (email && !EMAIL_RE.test(email)) return json(res, 400, { error: 'Correo inválido' });
      const t = nowISO();
      let attribution = null;
      if (b.attribution && typeof b.attribution === 'object') { const j = JSON.stringify(b.attribution); attribution = j.length > 2000 ? j.slice(0, 2000) : j; }
      const r = await db.run(`INSERT INTO leads
        (first_name,last_name,email,phone,location,experience,message,source,status,attribution,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?, 'registrado', ?, ?, ?)`,
        [cap(b.first_name, 120), cap(b.last_name, 120), email, cap(b.phone, 60), cap(b.location, 120), cap(b.experience, 80), cap(b.message, 2000), cap(b.source, 60) || 'website', attribution, t, t]);
      const ch = (b.attribution && typeof b.attribution === 'object' && b.attribution.channel) ? ` · ${String(b.attribution.channel).slice(0, 60)}` : '';
      await db.run(`INSERT INTO lead_events (lead_id,type,to_status,note,created_at) VALUES (?, 'created','registrado',?, ?)`, [r.lastInsertRowid, 'Recibido desde el sitio web' + ch, t]);
      return json(res, 201, { ok: true, id: r.lastInsertRowid });
    }
    return json(res, 405, { error: 'method' });
  }

  // Auth (public) — rate-limited, respuesta neutra (sin enumeración, sin token en prod)
  if (p === '/api/auth/request' && method === 'POST') {
    if (!(await rateOk(`auth:${clientIp(req)}`, 6, 900))) return json(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    const b = await readBody(req);
    const r = await requestMagicLink(String(b.email || ''), baseUrl(req));
    return json(res, 200, { ok: true, ...(!IS_PROD && r.ok ? { devLink: r.link } : {}) });
  }
  if (p === '/auth/verify' && method === 'GET') {
    const sid = await verifyToken(url.searchParams.get('token') || '');
    if (sid) res.setHeader('Set-Cookie', sidCookie(sid, 7));
    res.writeHead(302, { Location: '/crm' });
    return res.end();
  }
  if (p === '/api/auth/logout' && method === 'POST') {
    const sid = parseCookies(req).jkd_sid;
    if (sid) await db.run('DELETE FROM sessions WHERE id=?', [sid]);
    res.setHeader('Set-Cookie', clearCookie());
    return json(res, 200, { ok: true });
  }

  // ---- Protected API ----
  if (p.startsWith('/api/')) {
    const user = await currentUser(req);
    if (!user) return json(res, 401, { error: 'unauthorized' });

    if (p === '/api/me' && method === 'GET') {
      const sess = await sessionRow(req);
      let impersonating = null;
      if (sess && sess.impersonator_id) {
        const adm = await db.get('SELECT id,name FROM users WHERE id=?', [sess.impersonator_id]);
        if (adm) impersonating = { id: adm.id, name: adm.name };
      }
      return json(res, 200, { ...user, impersonating });
    }
    if (p === '/api/auth/stop-impersonate' && method === 'POST') {
      const sess = await sessionRow(req);
      if (!sess || !sess.impersonator_id) return json(res, 400, { error: 'not impersonating' });
      const admin = await db.get('SELECT * FROM users WHERE id=? AND active=1', [sess.impersonator_id]);
      if (!admin) return json(res, 401, { error: 'unauthorized' });
      const sid = token(24);
      await db.run('INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)', [sid, admin.id, addDays(new Date(), 7).toISOString(), nowISO()]);
      await db.run('DELETE FROM sessions WHERE id=?', [sess.id]);
      res.setHeader('Set-Cookie', sidCookie(sid, 7));
      return json(res, 200, { ok: true });
    }

    // Leads (lista): filtrado + paginado en SQL, owner por JOIN (sin N+1), tope 1000
    if (p === '/api/leads' && method === 'GET') {
      const status = url.searchParams.get('status');
      const qraw = (url.searchParams.get('q') || '').toLowerCase().slice(0, 80);
      const clauses = []; const args = [];
      if (status && STATUSES.includes(status)) { clauses.push('l.status=?'); args.push(status); }
      if (qraw) {
        const like = '%' + qraw.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
        clauses.push("(lower(coalesce(l.first_name,'')||' '||coalesce(l.last_name,'')||' '||coalesce(l.email,'')||' '||coalesce(l.phone,'')) LIKE ? ESCAPE '\\')");
        args.push(like);
      }
      const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
      const rows = await db.all(`SELECT l.*, u.name owner_name FROM leads l LEFT JOIN users u ON u.id=l.owner_id ${where} ORDER BY datetime(l.updated_at) DESC LIMIT 1000`, args);
      return json(res, 200, rows);
    }
    if (p === '/api/leads' && method === 'POST') {
      const b = await readBody(req);
      const t = nowISO();
      const r = await db.run(`INSERT INTO leads
        (first_name,last_name,email,phone,location,experience,message,source,status,owner_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?, 'registrado', ?, ?, ?)`,
        [cap(b.first_name, 120), cap(b.last_name, 120), cap(b.email, 160), cap(b.phone, 60), cap(b.location, 120), cap(b.experience, 80), cap(b.message, 2000), cap(b.source, 60) || 'manual', b.owner_id || user.id, t, t]);
      await db.run(`INSERT INTO lead_events (lead_id,type,to_status,user_id,created_at) VALUES (?, 'created','registrado',?,?)`, [r.lastInsertRowid, user.id, t]);
      return json(res, 201, await leadRow(await db.get('SELECT * FROM leads WHERE id=?', [r.lastInsertRowid])));
    }
    const leadMatch = p.match(/^\/api\/leads\/(\d+)(\/status|\/note)?$/);
    if (leadMatch) {
      const id = Number(leadMatch[1]);
      const sub = leadMatch[2];
      const lead = await db.get('SELECT * FROM leads WHERE id=?', [id]);
      if (!lead) return json(res, 404, { error: 'not found' });

      if (!sub && method === 'GET') {
        const events = await db.all(`SELECT e.*, u.name user_name FROM lead_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.lead_id=? ORDER BY datetime(e.created_at) ASC`, [id]);
        return json(res, 200, { ...(await leadRow(lead)), events });
      }
      if (!sub && method === 'PATCH') {
        const b = await readBody(req);
        const fields = ['first_name', 'last_name', 'email', 'phone', 'location', 'experience', 'message', 'owner_id'];
        const sets = [], vals = [];
        for (const f of fields) if (f in b) { sets.push(`${f}=?`); vals.push(f === 'owner_id' ? (b[f] || null) : cap(b[f], f === 'message' ? 2000 : 160)); }
        if (sets.length) { vals.push(nowISO(), id); await db.run(`UPDATE leads SET ${sets.join(',')}, updated_at=? WHERE id=?`, vals); }
        return json(res, 200, await leadRow(await db.get('SELECT * FROM leads WHERE id=?', [id])));
      }
      if (sub === '/status' && method === 'PATCH') {
        const b = await readBody(req);
        const status = String(b.status || '');
        if (!STATUSES.includes(status)) return json(res, 400, { error: 'bad status' });
        let loss = null;
        if (status === 'perdido') { loss = String(b.loss_reason || ''); if (!LOSS_REASONS[loss]) return json(res, 400, { error: 'loss_reason required' }); }
        const t = nowISO();
        await db.run('UPDATE leads SET status=?, loss_reason=?, updated_at=? WHERE id=?', [status, loss, t, id]);
        await db.run(`INSERT INTO lead_events (lead_id,type,from_status,to_status,loss_reason,user_id,created_at) VALUES (?, 'status',?,?,?,?,?)`, [id, lead.status, status, loss, user.id, t]);
        return json(res, 200, await leadRow(await db.get('SELECT * FROM leads WHERE id=?', [id])));
      }
      if (sub === '/note' && method === 'POST') {
        const b = await readBody(req);
        const note = cap(b.note, 2000);
        if (!note) return json(res, 400, { error: 'empty' });
        const t = nowISO();
        await db.run(`INSERT INTO lead_events (lead_id,type,note,user_id,created_at) VALUES (?, 'note',?,?,?)`, [id, note, user.id, t]);
        await db.run('UPDATE leads SET updated_at=? WHERE id=?', [t, id]);
        return json(res, 201, { ok: true });
      }
      if (!sub && method === 'DELETE') {
        if (user.role !== 'admin') return json(res, 403, { error: 'forbidden' });
        await db.run('DELETE FROM leads WHERE id=?', [id]);
        await db.run('DELETE FROM lead_events WHERE lead_id=?', [id]);
        return json(res, 200, { ok: true });
      }
    }

    // Users — proyección mínima para no-admin (no filtra correos/roles)
    if (p === '/api/users' && method === 'GET') {
      const cols = user.role === 'admin' ? 'id,name,email,role,active,created_at' : 'id,name';
      return json(res, 200, await db.all(`SELECT ${cols} FROM users ORDER BY id`));
    }
    if (p === '/api/users' && method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const b = await readBody(req);
      const name = cap(b.name, 120), email = cap(b.email, 160), role = ROLES.includes(b.role) ? b.role : 'comercial';
      if (!name || !email) return json(res, 400, { error: 'name & email required' });
      if (!EMAIL_RE.test(email)) return json(res, 400, { error: 'invalid email' });
      const exists = await db.get('SELECT 1 FROM users WHERE lower(email)=lower(?)', [email]);
      if (exists) return json(res, 409, { error: 'email already exists' });
      const r = await db.run('INSERT INTO users (name,email,role,active,created_at) VALUES (?,?,?,1,?)', [name, email, role, nowISO()]);
      return json(res, 201, await db.get('SELECT id,name,email,role,active,created_at FROM users WHERE id=?', [r.lastInsertRowid]));
    }
    const userMatch = p.match(/^\/api\/users\/(\d+)$/);
    if (userMatch && method === 'PATCH') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const id = Number(userMatch[1]);
      const b = await readBody(req);
      const sets = [], vals = [];
      if ('name' in b) { sets.push('name=?'); vals.push(cap(b.name, 120)); }
      if ('email' in b) {
        const em = cap(b.email, 160);
        if (em) {
          if (!EMAIL_RE.test(em)) return json(res, 400, { error: 'invalid email' });
          const dup = await db.get('SELECT id FROM users WHERE lower(email)=lower(?) AND id<>?', [em, id]);
          if (dup) return json(res, 409, { error: 'email already exists' });
          sets.push('email=?'); vals.push(em);
        }
      }
      if ('role' in b && ROLES.includes(b.role)) { sets.push('role=?'); vals.push(b.role); }
      if ('active' in b) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
      if (sets.length) { vals.push(id); await db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals); }
      return json(res, 200, await db.get('SELECT id,name,email,role,active,created_at FROM users WHERE id=?', [id]));
    }
    const impMatch = p.match(/^\/api\/users\/(\d+)\/impersonate$/);
    if (impMatch && method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const target = await db.get('SELECT * FROM users WHERE id=? AND active=1', [Number(impMatch[1])]);
      if (!target) return json(res, 404, { error: 'not found' });
      if (target.id === user.id) return json(res, 400, { error: 'ya eres tú' });
      const sess = await sessionRow(req);
      const adminId = sess && sess.impersonator_id ? sess.impersonator_id : user.id;
      const sid = token(24);
      await db.run('INSERT INTO sessions (id,user_id,expires_at,created_at,impersonator_id) VALUES (?,?,?,?,?)', [sid, target.id, addDays(new Date(), 1).toISOString(), nowISO(), adminId]);
      res.setHeader('Set-Cookie', sidCookie(sid, 1));
      return json(res, 200, { ok: true, as: { id: target.id, name: target.name, role: target.role } });
    }

    if (p === '/api/stats' && method === 'GET') return json(res, 200, await buildStats(url.searchParams.get('month')));
    if (p === '/api/meta' && method === 'GET') return json(res, 200, { statuses: STATUSES, lossReasons: LOSS_REASONS, roles: ROLES });

    if (p === '/api/settings' && method === 'GET') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      return json(res, 200, await getAllSettings());
    }
    if (p === '/api/settings' && method === 'PUT') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const b = await readBody(req);
      for (const k of ALLOWED_SETTING_KEYS) if (k in b) {
        await db.run('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', [k, String(b[k] == null ? '' : b[k]).trim(), nowISO()]);
      }
      return json(res, 200, await getAllSettings());
    }

    // Redirecciones 301/302 (solo admin)
    if (p === '/api/redirects' && method === 'GET') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      return json(res, 200, await db.all('SELECT * FROM redirects ORDER BY id DESC'));
    }
    if (p === '/api/redirects' && method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const b = await readBody(req);
      const from = normFrom(b.from_path), to = normTo(b.to_path);
      const code = Number(b.code) === 302 ? 302 : 301;
      if (!from || !to) return json(res, 400, { error: 'from & to required' });
      if (from === '/' || from.startsWith('/crm') || from.startsWith('/api')) return json(res, 400, { error: 'origen no permitido (no uses /, /crm o /api)' });
      if (from === to) return json(res, 400, { error: 'el origen y el destino no pueden ser iguales' });
      if (await db.get('SELECT id FROM redirects WHERE from_path=?', [from])) return json(res, 409, { error: 'ya existe una redirección para ese origen' });
      const r = await db.run('INSERT INTO redirects (from_path,to_path,code,active,hits,created_at) VALUES (?,?,?,1,0,?)', [from, to, code, nowISO()]);
      return json(res, 201, await db.get('SELECT * FROM redirects WHERE id=?', [r.lastInsertRowid]));
    }
    const redirMatch = p.match(/^\/api\/redirects\/(\d+)$/);
    if (redirMatch) {
      if (user.role !== 'admin') return json(res, 403, { error: 'admin only' });
      const id = Number(redirMatch[1]);
      if (method === 'DELETE') { await db.run('DELETE FROM redirects WHERE id=?', [id]); return json(res, 200, { ok: true }); }
      if (method === 'PATCH') {
        const b = await readBody(req);
        const sets = [], vals = [];
        if ('from_path' in b) {
          const from = normFrom(b.from_path);
          if (!from || from === '/' || from.startsWith('/crm') || from.startsWith('/api')) return json(res, 400, { error: 'origen no permitido' });
          if (await db.get('SELECT id FROM redirects WHERE from_path=? AND id<>?', [from, id])) return json(res, 409, { error: 'ya existe una redirección para ese origen' });
          sets.push('from_path=?'); vals.push(from);
        }
        if ('to_path' in b) { const to = normTo(b.to_path); if (!to) return json(res, 400, { error: 'destino requerido' }); sets.push('to_path=?'); vals.push(to); }
        if ('code' in b) { sets.push('code=?'); vals.push(Number(b.code) === 302 ? 302 : 301); }
        if ('active' in b) { sets.push('active=?'); vals.push(b.active ? 1 : 0); }
        if (sets.length) { vals.push(id); await db.run(`UPDATE redirects SET ${sets.join(',')} WHERE id=?`, vals); }
        return json(res, 200, await db.get('SELECT * FROM redirects WHERE id=?', [id]));
      }
    }

    return json(res, 404, { error: 'no route' });
  }

  // ---- Static ----
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (isCrm) return serveStatic(res, p, PUBLIC_DIR, true, gz, false, null);
  const lang = url.searchParams.get('lang') === 'es' ? 'es' : 'en';
  return serveStatic(res, p, SITE_DIR, false, gz, true, { lang, path: p });
}

async function serveStatic(res, p, dir, spa, gz, longCache, seo) {
  let rel = p === '/' ? 'index.html' : decodeURIComponent(p.replace(/^\/+/, '')).replace(/\/$/, '');
  if (rel && !path.extname(rel)) {
    const cand = path.join(dir, rel + '.html');
    if (cand.startsWith(dir) && fs.existsSync(cand)) rel = rel + '.html';
  }
  const full = path.join(dir, rel || 'index.html');
  if (!full.startsWith(dir)) return send(res, 403, 'forbidden');
  let buf;
  try { buf = await fs.promises.readFile(full); }
  catch (e) {
    if (spa) { try { const idx = await fs.promises.readFile(path.join(dir, 'index.html')); return sendFile(res, '.html', idx, gz, longCache); } catch { return send(res, 404, 'Not found'); } }
    return serve404(res);
  }
  const ext = path.extname(full).toLowerCase();
  if (dir === SITE_DIR && ext === '.html') buf = Buffer.from(await injectHead(buf.toString('utf8'), seo), 'utf8');
  return sendFile(res, ext, buf, gz, longCache);
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
  const cache = /image|font/.test(ctype) ? 'public, max-age=2592000'
    : ext === '.html' ? 'no-cache'
      : longCache ? 'public, max-age=3600'
        : 'no-cache';
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
async function serve404(res) {
  try {
    const buf = await fs.promises.readFile(path.join(SITE_DIR, '404.html'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(buf);
  } catch (e) { send(res, 404, 'Not found'); }
}
