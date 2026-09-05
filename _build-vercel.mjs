// Ensambla vercel-app/ (lo que Vercel despliega) desde los fuentes:
//   - CRM  (jkd-legacy-crm): api/, lib/, vercel.json, package*.json  y  public/ -> webui/
//   - Sitio (jkd-legacy-redesign) -> site/  (la función le inyecta el SEO)
//   - Assets estáticos del sitio TAMBIÉN en la raíz -> los sirve el CDN de Vercel directo (rápido)
// Uso:  node _build-vercel.mjs   (desde cualquier carpeta; usa rutas absolutas)
// Root Directory en Vercel = vercel-app  (por eso este script en la raíz del repo NO afecta el build de Vercel).
import { rmSync, cpSync, mkdirSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const WEBS = 'C:\\Users\\donju\\Desktop\\Webs';
const CRM = path.join(WEBS, 'jkd-legacy-crm');
const SITE = path.join(WEBS, 'jkd-legacy-redesign');
const REPO = 'C:\\Users\\donju\\Desktop\\jkd-legacy-academy';
const OUT = path.join(REPO, 'vercel-app');

const noHeavy = (src) => {
  const s = src.replace(/\\/g, '/');
  if (/\/(\.git|node_modules)(\/|$)/.test(s)) return false;
  if (/\/data(\/|$)/.test(s)) return false;
  if (/\.(db|sqlite)(-wal|-shm)?$/.test(s)) return false;
  return true;
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Código del CRM (backend serverless + SPA)
for (const f of ['api', 'lib', 'vercel.json', 'package.json', 'package-lock.json']) {
  const src = path.join(CRM, f);
  if (existsSync(src)) cpSync(src, path.join(OUT, f), { recursive: true, filter: noHeavy });
}
// La SPA del CRM va a "webui" (NO "public": Vercel serviría public/ como estáticos en la raíz)
cpSync(path.join(CRM, 'public'), path.join(OUT, 'webui'), { recursive: true, filter: noHeavy });
// Sitio de marketing -> site/  (la función lee el HTML de aquí y le inyecta el SEO)
cpSync(SITE, path.join(OUT, 'site'), { recursive: true, filter: noHeavy });
// Assets estáticos también en la RAÍZ -> los sirve el CDN de Vercel directo (no la función) = mucho más rápido
for (const a of ['images', 'styles.css', 'script.js', 'i18n.js', 'analytics.js', 'robots.txt', 'sitemap.xml', 'page-sitemap.xml', 'sitemap.xsl', 'llms.txt', '_redirects']) {
  const src = path.join(SITE, a);
  if (existsSync(src)) cpSync(src, path.join(OUT, a), { recursive: true, filter: noHeavy });
}

writeFileSync(path.join(OUT, '.gitignore'), 'node_modules\n/data\n*.db\n*.db-wal\n*.db-shm\n');
writeFileSync(path.join(OUT, 'README.md'),
  '# JKD Legacy — App de producción (Vercel)\n\n' +
  'Despliegue serverless del sitio + CRM. **Root Directory en Vercel: `vercel-app`**.\n\n' +
  '## Variables de entorno requeridas\n' +
  '- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — base Turso\n' +
  '- `RESEND_API_KEY`, `MAIL_FROM` — envío de correo (magic link + notificación de leads)\n' +
  '- `ADMIN_EMAIL` — buzón admin donde llega el magic link\n\n' +
  'La BD se inicializa sola en el primer arranque.\n');

const list = readdirSync(OUT);
console.log('vercel-app listo:', OUT);
console.log('contenido:', list.join(', '));
console.log('site/ archivos:', readdirSync(path.join(OUT, 'site')).length);
console.log('webui/ archivos:', readdirSync(path.join(OUT, 'webui')).length);
