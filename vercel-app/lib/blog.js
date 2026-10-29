// ============================================================
//  Blog administrable (EN/ES) — artículos en la BD (tabla posts), páginas renderizadas aquí.
//  El «chrome» (nav, footer, CSS del head) sale de site/blog.html y blog.es.html, que genera
//  _seo/build.py; así el menú y el pie son idénticos al resto del sitio sin duplicar plantillas.
//  Los 8 artículos iniciales se siembran desde lib/blog-seed.json si la tabla está vacía.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://jkdlegacy.com.au';
const ORG_ID = ORIGIN + '/#academy';
const BRAND = 'Jeet Kune Do Legacy Academy';
export const CATEGORIES = { 'Jeet Kune Do': 'Jeet Kune Do', Beginners: 'Principiantes', 'Styles compared': 'Estilos comparados', 'Self-defence': 'Defensa personal', Melbourne: 'Melbourne' };
const LANG_FIELDS = ['title', 'metaDescription', 'h1', 'dek', 'quickAnswer', 'bodyHtml', 'primaryKeyword', 'secondaryKeywords', 'faqs', 'imageAlt'];

const nowISO = () => new Date().toISOString();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const wordCount = (html) => (stripTags(html).match(/\S+/g) || []).length;

// ---------------- Esquema + semilla ----------------
let _ready = null;
export function ensureBlog() { return _ready || (_ready = initBlog()); }
async function initBlog() {
  await db.execMany([
    `CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'draft', category TEXT, image TEXT, related TEXT, en TEXT, es TEXT, date_published TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)`,
  ]);
  try { await db.run("ALTER TABLE posts ADD COLUMN author TEXT DEFAULT 'academy'"); } catch (e) { /* ya existe */ }
  const c = await db.get('SELECT COUNT(*) c FROM posts');
  if (Number(c?.c || 0) > 0) return;
  let seedRows = [];
  try { seedRows = JSON.parse(fs.readFileSync(path.join(__dirname, 'blog-seed.json'), 'utf8')); } catch (e) { return; }
  const now = nowISO();
  for (const s of seedRows) {
    await db.run('INSERT OR IGNORE INTO posts (slug,status,category,image,related,en,es,date_published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [s.slug, 'published', s.category || 'Jeet Kune Do', s.image || '', JSON.stringify(s.related || []), JSON.stringify(s.en || {}), JSON.stringify(s.es || {}), s.date_published || now.slice(0, 10), now, now]);
  }
}

function rowToPost(r) {
  if (!r) return null;
  const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  return { id: r.id, slug: r.slug, status: r.status, author: r.author === 'vargas' ? 'vargas' : 'academy', category: r.category || 'Jeet Kune Do', image: r.image || '', related: parse(r.related, []),
    en: parse(r.en, {}), es: parse(r.es, {}), date_published: r.date_published || '', created_at: r.created_at, updated_at: r.updated_at };
}
export async function listPosts(onlyPublished) {
  await ensureBlog();
  const rows = await db.all(`SELECT * FROM posts ${onlyPublished ? "WHERE status='published'" : ''} ORDER BY date_published DESC, id DESC`);
  return rows.map(rowToPost);
}
export async function getPostBy(field, val) {
  await ensureBlog();
  return rowToPost(await db.get(`SELECT * FROM posts WHERE ${field === 'id' ? 'id' : 'slug'}=?`, [val]));
}

// ---------------- Validación / saneado (el cuerpo lo escribe un admin, pero no se confía en él) ----------------
export function sanitizeHtml(h) {
  return String(h || '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|base|frame|frameset)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|base|frame|frameset)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*(javascript|data|vbscript):[^"']*\2/gi, '$1="#"');
}
function cleanLang(o) {
  const out = {};
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  out.title = s(o.title, 120); out.metaDescription = s(o.metaDescription, 320); out.h1 = s(o.h1, 200);
  out.dek = s(o.dek, 600); out.quickAnswer = s(o.quickAnswer, 1200); out.primaryKeyword = s(o.primaryKeyword, 120);
  out.imageAlt = s(o.imageAlt, 200);
  out.secondaryKeywords = (Array.isArray(o.secondaryKeywords) ? o.secondaryKeywords : String(o.secondaryKeywords || '').split(','))
    .map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  out.bodyHtml = sanitizeHtml(o.bodyHtml).slice(0, 200000);
  out.faqs = (Array.isArray(o.faqs) ? o.faqs : []).map((f) => ({ q: s(f && f.q, 300), a: s(f && f.a, 1500) })).filter((f) => f.q && f.a).slice(0, 12);
  out.readingMinutes = Math.max(1, Math.round(wordCount(out.bodyHtml) / 220));
  return out;
}
export function validatePost(b) {
  const slug = String(b.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 90) return { error: 'Slug must be lowercase words separated by hyphens (a-z, 0-9).' };
  const status = b.status === 'published' ? 'published' : 'draft';
  const en = cleanLang(b.en || {});
  const es = cleanLang(b.es || {});
  if (!en.title || !en.h1) return { error: 'English title and H1 are required.' };
  if (status === 'published' && (!en.bodyHtml || !en.metaDescription)) return { error: 'To publish, the English body and meta description are required.' };
  const image = /^\/images\/[\w.-]+\.(webp|jpe?g|png)$/i.test(String(b.image || '')) ? b.image : '/images/training-3.webp';
  const category = CATEGORIES[b.category] !== undefined ? b.category : 'Jeet Kune Do';
  const related = (Array.isArray(b.related) ? b.related : []).map(String).filter((x) => /^[a-z0-9-]+$/.test(x) && x !== slug).slice(0, 4);
  const date_published = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date_published || '')) ? b.date_published : nowISO().slice(0, 10);
  const author = b.author === 'vargas' ? 'vargas' : 'academy';
  return { slug, status, en, es, image, category, related, date_published, author };
}
export async function savePost(id, v) {
  const now = nowISO();
  const dup = await db.get('SELECT id FROM posts WHERE slug=? AND id<>?', [v.slug, id || 0]);
  if (dup) return { error: 'Another post already uses that slug.' };
  const vals = [v.slug, v.status, v.category, v.image, JSON.stringify(v.related), JSON.stringify(v.en), JSON.stringify(v.es), v.date_published, v.author];
  if (id) {
    await db.run('UPDATE posts SET slug=?,status=?,category=?,image=?,related=?,en=?,es=?,date_published=?,author=?,updated_at=? WHERE id=?', [...vals, now, id]);
    return { post: await getPostBy('id', id) };
  }
  const r = await db.run('INSERT INTO posts (slug,status,category,image,related,en,es,date_published,author,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...vals, now, now]);
  return { post: await getPostBy('id', r.lastInsertRowid) };
}
export async function deletePost(id) { await db.run('DELETE FROM posts WHERE id=?', [id]); }

// ---------------- Render público ----------------
const UI = {
  en: {
    home: 'Home', blog: 'Blog', quick: 'Quick answer', updated: 'Updated', minread: 'min read', tryH: 'Try a free class',
    tryP: 'Jeet Kune Do and self-defence in Maidstone, Melbourne. Tue &amp; Thu 7 pm, Sat 9:30 am.', tryBtn: 'Book free class',
    keep: 'Keep reading', classes: 'Classes', faqT: 'Frequently asked questions', ctaEy: 'Your first class is free',
    ctaH: 'Train with us in Melbourne.', ctaP: 'Your first class is free. Sigung Ricardo Vargas calls you within 24 hours to book a time that suits you.',
    ctaBtn: 'Book your free class', float: 'Book Your Free Class', read: 'Read →', bc: 'Breadcrumb', by: 'By',
    bio: 'Head instructor and founder of Jeet Kune Do Legacy Academy. Second-generation Jeet Kune Do instructor, trained and certified by Sifu Jerry Poteet and Sigung Richard Bustillo, both direct students of Bruce Lee. 30+ years of practice.',
    bioLink: 'Read the lineage →',
    idxEy: 'The JKD Legacy blog', idxH: 'Jeet Kune Do &amp; <span class="text-accent">self-defence</span> guides.',
    idxLead: "Straight answers about Bruce Lee's martial art, self-defence and starting to train — from Jeet Kune Do Legacy Academy in Melbourne.",
    idxCtaH: 'Ready to try it for real?', idxCtaP: 'Your first class in Maidstone is free. Tue &amp; Thu 7 pm and Sat 9:30 am.',
    idxTitle: 'Jeet Kune Do & Self-Defence Blog | JKD Legacy Academy',
    idxDesc: "Guides on Jeet Kune Do, self-defence, women's safety and starting martial arts as an adult, from Jeet Kune Do Legacy Academy in Melbourne.",
    idxName: 'Jeet Kune Do & self-defence guides', empty: 'New guides are on the way.',
    links: [['/self-defence-classes-melbourne', 'Self-defence classes Melbourne'], ['/jeet-kune-do-melbourne', 'Jeet Kune Do Melbourne'], ['/womens-self-defence-melbourne', "Women's self-defence"], ['/jeet-kune-do-adelaide', 'Jeet Kune Do Adelaide']],
  },
  es: {
    home: 'Inicio', blog: 'Blog', quick: 'Respuesta rápida', updated: 'Actualizado', minread: 'min de lectura', tryH: 'Prueba una clase gratis',
    tryP: 'Jeet Kune Do y defensa personal en Maidstone, Melbourne. Mar. y jue. 7:00 p. m., sáb. 9:30 a. m.', tryBtn: 'Reserva tu clase gratis',
    keep: 'Sigue leyendo', classes: 'Clases', faqT: 'Preguntas frecuentes', ctaEy: 'Tu primera clase es gratis',
    ctaH: 'Entrena con nosotros en Melbourne.', ctaP: 'Tu primera clase es gratis. Sigung Ricardo Vargas te llama en menos de 24 horas para agendar el horario que te sirva.',
    ctaBtn: 'Reserva tu clase gratis', float: 'Reserva tu clase gratis', read: 'Leer →', bc: 'Ruta de navegación', by: 'Por',
    bio: 'Instructor principal y fundador de Jeet Kune Do Legacy Academy. Instructor de Jeet Kune Do de segunda generación, formado y certificado por Sifu Jerry Poteet y Sigung Richard Bustillo, ambos alumnos directos de Bruce Lee. Más de 30 años de práctica.',
    bioLink: 'Conoce el linaje →',
    idxEy: 'El blog de JKD Legacy', idxH: 'Guías de Jeet Kune Do y <span class="text-accent">defensa personal</span>.',
    idxLead: 'Respuestas claras sobre el arte marcial de Bruce Lee, la defensa personal y cómo empezar a entrenar, desde Jeet Kune Do Legacy Academy en Melbourne.',
    idxCtaH: '¿Listo para probarlo de verdad?', idxCtaP: 'Tu primera clase en Maidstone es gratis. Mar. y jue. 7:00 p. m. y sáb. 9:30 a. m.',
    idxTitle: 'Blog de Jeet Kune Do y defensa personal | JKD Legacy',
    idxDesc: 'Guías sobre Jeet Kune Do, defensa personal, seguridad para mujeres y cómo empezar artes marciales de adulto, desde Jeet Kune Do Legacy Academy en Melbourne.',
    idxName: 'Guías de Jeet Kune Do y defensa personal', empty: 'Pronto publicaremos nuevas guías.',
    links: [['/self-defence-classes-melbourne', 'Clases de defensa personal en Melbourne'], ['/jeet-kune-do-melbourne', 'Jeet Kune Do en Melbourne'], ['/womens-self-defence-melbourne', 'Defensa personal para mujeres'], ['/jeet-kune-do-adelaide', 'Jeet Kune Do en Adelaide']],
  },
};
const NO_ES = ['/free-trial', '/privacy', '/crm', '/api'];
export function esHref(h) {
  if (!h || !h.startsWith('/') || h.startsWith('//')) return h;
  const [pathq, frag] = h.split('#');
  const [base, query = ''] = pathq.split('?');
  if (/\.[a-z0-9]{2,5}$/i.test(base) || NO_ES.some((x) => base.startsWith(x)) || /(^|&)lang=/.test(query)) return h;
  return base + '?' + (query ? query + '&' : '') + 'lang=es' + (frag !== undefined ? '#' + frag : '');
}
const localize = (html, lang) => (lang === 'es' ? html.replace(/href="([^"]+)"/g, (m, h) => `href="${esHref(h)}"`) : html);
const ld = (o) => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>';
const pick = (p, lang) => {
  // Español incompleto → se muestra el inglés (nunca una página vacía)
  const es = p.es || {};
  return lang === 'es' && es.title && es.bodyHtml ? { ...p.en, ...es, _lang: 'es' } : { ...p.en, _lang: 'en' };
};

const shellCache = {};
function shell(siteDir, lang) {
  const f = path.join(siteDir, lang === 'es' ? 'blog.es.html' : 'blog.html');
  let st; try { st = fs.statSync(f); } catch (e) { return null; }
  const c = shellCache[lang];
  if (c && c.mtime === st.mtimeMs) return c;
  const html = fs.readFileSync(f, 'utf8');
  const headEnd = html.indexOf('</head>'), mainStart = html.indexOf('<main>'), mainEnd = html.indexOf('</main>');
  if (headEnd < 0 || mainStart < 0 || mainEnd < 0) return null;
  const head = html.slice(0, headEnd).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const top = html.slice(html.indexOf('<body>', headEnd), mainStart);
  const bottom = html.slice(mainEnd);
  return (shellCache[lang] = { mtime: st.mtimeMs, head, top, bottom });
}

function page(siteDir, lang, { path: p, title, desc, hero, ogType, schema, content }) {
  const sh = shell(siteDir, lang);
  if (!sh) return null;
  const canon = ORIGIN + p + (lang === 'es' ? '?lang=es' : '');
  // El chrome ES pasa por BeautifulSoup y puede cambiar el orden de atributos: se busca cada etiqueta por su marca
  const setAttr = (html, mark, attr, value) => html.replace(/<(meta|link)\b[^>]*>/g, (tag) => (tag.includes(mark) ? tag.replace(new RegExp(`(\\s${attr}=")[^"]*"`), `$1${value}"`) : tag));
  let head = sh.head.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  head = setAttr(head, 'name="description"', 'content', esc(desc));
  head = setAttr(head, 'property="og:title"', 'content', esc(title));
  head = setAttr(head, 'property="og:description"', 'content', esc(desc));
  head = setAttr(head, 'property="og:type"', 'content', ogType || 'website');
  head = setAttr(head, 'rel="canonical"', 'href', canon);
  head = setAttr(head, 'rel="preload"', 'href', esc(hero || '/images/bruce-home.webp'));
  // El selector EN/ES del chrome apunta a /blog: se reescribe a la URL de esta página
  const top = sh.top.replace(/<li\b[^>]*class="lang-switch"[^>]*>[\s\S]*?<\/li>/, (seg) => seg
    .replace(/href="\/blog\?lang=es"/, `href="${p}?lang=es"`)
    .replace(/href="\/blog"/, `href="${p}"`));
  const t = UI[lang];
  const float = `<a href="/free-trial" class="float-cta" id="floatCta" data-cta="float"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>${t.float}</span><span class="btn-arrow" aria-hidden="true">→</span></a>`;
  return head + schema.map(ld).join('') + '\n</head>\n' + top + '<main>\n' + localize(content, lang) + '\n' + float + '\n' + sh.bottom;
}

function crumbs(items, lang) {
  const lis = items.map(([n, h]) => (h ? `<li><a href="${h}">${esc(n)}</a></li>` : `<li aria-current="page">${esc(n)}</li>`)).join('');
  return `<nav class="crumbs reveal" aria-label="${UI[lang].bc}"><ol>${lis}</ol></nav>`;
}
const crumbsLd = (items, p) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([n, h], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: ORIGIN + (h || p) })) });
const faqLd = (faqs) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
const kicker = (cat, lang) => (lang === 'es' ? CATEGORIES[cat] || cat : cat);
function ctaBand(lang, h, p) {
  const t = UI[lang];
  return `<section class="cta-band"><div class="container"><span class="eyebrow reveal">${t.ctaEy}</span><h2 class="reveal delay-1">${h}</h2><p class="reveal delay-2">${p}</p><a href="/free-trial" class="btn btn-primary reveal delay-3" data-cta="home_band">${t.ctaBtn} <span class="btn-arrow">→</span></a></div></section>`;
}
function faqHtml(faqs, lang) {
  if (!faqs.length) return '';
  const items = faqs.map((f, i) => `<details class="faq-item reveal"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><div class="faq-a"><p>${esc(f.a)}</p></div></details>`).join('');
  return `<section class="section paper" id="faq"><div class="container"><div class="section-head reveal"><span class="eyebrow">FAQ</span><h2>${UI[lang].faqT}</h2></div><div class="faq-list">${items}</div></div></section>`;
}
function card(p, lang, h = 'h2') {
  const c = pick(p, lang);
  return `<a class="post-card reveal" href="/blog/${p.slug}"><img loading="lazy" decoding="async" src="${esc(p.image)}" alt="${esc(c.imageAlt || '')}" width="800" height="500"><div class="post-card-body"><span class="post-card-kicker">${esc(kicker(p.category, lang))}</span><${h}>${esc(c.h1)}</${h}><p>${esc(c.metaDescription)}</p><span class="more">${UI[lang].read}</span></div></a>`;
}

export async function renderPost(siteDir, slug, lang, preview) {
  const p = await getPostBy('slug', slug);
  if (!p || (p.status !== 'published' && !preview)) return null;
  const all = await listPosts(true);
  const c = pick(p, lang);
  const t = UI[lang];
  const pth = '/blog/' + p.slug;
  const items = [[t.home, '/'], [t.blog, '/blog'], [c.h1, null]];
  const rel = p.related.map((s) => all.find((x) => x.slug === s)).filter(Boolean).slice(0, 3);
  const faqs = c.faqs || [];
  const updated = (p.updated_at || p.date_published || '').slice(0, 10);
  // Firma de autor (E-E-A-T): solo cuando el artículo está revisado y firmado por Sigung Vargas (CRM → Author)
  const byVargas = p.author === 'vargas';
  const content = `<section class="page-header seo compact">
  <div class="page-header-bg"><img src="${esc(p.image)}" alt="${esc(c.imageAlt || c.h1)}" fetchpriority="high" decoding="async" width="1600" height="1000"></div>
  <div class="container page-header-content">
    ${crumbs(items, lang)}
    <span class="eyebrow reveal">${esc(kicker(p.category, lang))}</span>
    <h1 class="reveal delay-1">${esc(c.h1)}</h1>
    <p class="lead reveal delay-2">${esc(c.dek)}</p>
    <div class="post-meta reveal delay-2"><span>${byVargas ? t.by + ' Sigung Ricardo Vargas' : BRAND}</span><span>${t.updated} ${updated}</span><span>${c.readingMinutes || 5} ${t.minread}</span></div>
  </div>
</section>
<section class="section">
  <div class="container article-grid">
    <article class="prose">
      ${c.quickAnswer ? `<div class="quick-answer"><strong class="qa-label">${t.quick}</strong><p>${esc(c.quickAnswer)}</p></div>` : ''}
      ${c.bodyHtml || ''}
      ${byVargas ? `<div class="author-box"><img src="/images/vargas-bridge-400.webp" alt="Sigung Ricardo Vargas" width="88" height="88" loading="lazy"><div><strong>Sigung Ricardo Vargas</strong><p>${t.bio}</p><a href="/legacy">${t.bioLink}</a></div></div>` : ''}
    </article>
    <aside class="article-aside">
      <div class="aside-card"><h2>${t.tryH}</h2><p>${t.tryP}</p><a href="/free-trial" class="btn btn-primary" data-cta="hero">${t.tryBtn} <span class="btn-arrow">→</span></a></div>
      ${rel.length ? `<div class="aside-card"><h3>${t.keep}</h3><ul>${rel.map((r) => `<li><a href="/blog/${r.slug}">${esc(pick(r, lang).h1)}</a></li>`).join('')}</ul></div>` : ''}
      <div class="aside-card"><h3>${t.classes}</h3><ul>${t.links.map(([h, n]) => `<li><a href="${h}">${esc(n)}</a></li>`).join('')}</ul></div>
    </aside>
  </div>
</section>
${faqHtml(faqs, lang)}
${ctaBand(lang, t.ctaH, t.ctaP)}`;
  const schema = [{
    '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': ORIGIN + pth + '#article', headline: String(c.h1).slice(0, 110),
    description: c.metaDescription, image: ORIGIN + p.image, datePublished: p.date_published, dateModified: updated || p.date_published,
    author: byVargas ? { '@type': 'Person', '@id': ORIGIN + '/#sigung-ricardo-vargas', name: 'Sigung Ricardo Vargas', url: ORIGIN + '/legacy', jobTitle: 'Head Instructor & Founder' }
      : { '@type': 'Organization', '@id': ORG_ID, name: BRAND, url: ORIGIN + '/' }, publisher: { '@id': ORG_ID },
    mainEntityOfPage: ORIGIN + pth + (lang === 'es' ? '?lang=es' : ''), inLanguage: c._lang === 'es' ? 'es' : 'en-AU',
    keywords: [c.primaryKeyword, ...(c.secondaryKeywords || [])].filter(Boolean).join(', '), articleSection: kicker(p.category, lang),
    wordCount: wordCount(c.bodyHtml), speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.quick-answer'] },
  }, crumbsLd(items, pth)];
  if (faqs.length) schema.push(faqLd(faqs));
  const html = page(siteDir, lang, { path: pth, title: c.title || c.h1, desc: c.metaDescription || c.dek, hero: p.image, ogType: 'article', schema, content });
  return preview && p.status !== 'published' ? html && html.replace('<head>', '<head><meta name="robots" content="noindex">') : html;
}

export async function renderIndex(siteDir, lang) {
  const all = await listPosts(true);
  const t = UI[lang];
  const items = [[t.home, '/'], [t.blog, null]];
  const content = `<section class="page-header seo">
  <div class="page-header-bg"><img src="/images/bruce-home.webp" alt="Bruce Lee" fetchpriority="high" decoding="async" width="1600" height="1000"></div>
  <div class="container page-header-content">
    ${crumbs(items, lang)}
    <span class="eyebrow reveal">${t.idxEy}</span>
    <h1 class="reveal delay-1">${t.idxH}</h1>
    <p class="lead reveal delay-2">${t.idxLead}</p>
  </div>
</section>
<section class="section"><div class="container">${all.length ? `<div class="post-grid">${all.map((p) => card(p, lang)).join('')}</div>` : `<p>${t.empty}</p>`}</div></section>
${ctaBand(lang, t.idxCtaH, t.idxCtaP)}`;
  const schema = [{
    '@context': 'https://schema.org', '@type': 'Blog', '@id': ORIGIN + '/blog#blog', url: ORIGIN + '/blog', name: t.idxName, publisher: { '@id': ORG_ID },
    inLanguage: lang === 'es' ? 'es' : 'en-AU', blogPost: all.map((p) => ({ '@type': 'BlogPosting', headline: pick(p, lang).h1, url: ORIGIN + '/blog/' + p.slug, datePublished: p.date_published })),
  }, crumbsLd(items, '/blog')];
  return page(siteDir, lang, { path: '/blog', title: t.idxTitle, desc: t.idxDesc, hero: '/images/bruce-home.webp', schema, content });
}

export async function postSitemap() {
  const all = await listPosts(true);
  const alt = (u) => `\n    <xhtml:link rel="alternate" hreflang="en" href="${u}"/>\n    <xhtml:link rel="alternate" hreflang="es" href="${u}?lang=es"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${u}"/>`;
  const last = all.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), '2026-10-25');
  const urls = all.map((p) => `\n  <url>\n    <loc>${ORIGIN}/blog/${p.slug}</loc>${alt(ORIGIN + '/blog/' + p.slug)}\n    <lastmod>${(p.updated_at || p.date_published).slice(0, 10)}</lastmod>\n    <image:image><image:loc>${ORIGIN}${esc(p.image)}</image:loc></image:image>\n  </url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n<!-- Artículos del blog (desde el CRM). -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n  <url>\n    <loc>${ORIGIN}/blog</loc>${alt(ORIGIN + '/blog')}\n    <lastmod>${last.slice(0, 10)}</lastmod>\n  </url>${urls}\n</urlset>\n`;
}

// llms.txt: la sección «## Guides» se arma con los artículos publicados
export async function llmsGuides(staticTxt) {
  const all = await listPosts(true);
  const lines = all.map((p) => `- [${p.en.h1}](${ORIGIN}/blog/${p.slug}): ${p.en.quickAnswer || p.en.metaDescription || ''}`).join('\n');
  const i = staticTxt.indexOf('## Guides');
  return (i >= 0 ? staticTxt.slice(0, i) : staticTxt + '\n') + '## Guides\n\n' + lines + '\n';
}

export function siteImages(siteDir) {
  try {
    return fs.readdirSync(path.join(siteDir, 'images'))
      .filter((f) => /\.webp$/i.test(f) && !/-(400|640|720|760|200|48)\.webp$/i.test(f) && !/^(logo|favicon|ins-)/.test(f))
      .sort().map((f) => '/images/' + f);
  } catch (e) { return []; }
}
export { LANG_FIELDS };
