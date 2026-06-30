# The JKD Legacy Academy

Sitio web bilingüe (EN/ES) + mini-CRM para **The JKD Legacy Academy** — Jeet Kune Do auténtico en el linaje directo de Bruce Lee (Melbourne · Adelaide), bajo Sigung Ricardo Vargas.

## 🔗 Demo navegable
Versión estática del sitio publicada con **GitHub Pages** (carpeta `/docs`).
La demo es solo para navegar el diseño y el contenido; el formulario no envía leads a un CRM real.

## Estructura
- **`jkd-legacy-redesign/`** — sitio web (HTML/CSS/JS sin dependencias). Concepto editorial "The Intercepting Line".
- **`jkd-legacy-crm/`** — backoffice/CRM (Node puro con `node:http` + `node:sqlite`, sin dependencias externas; requiere Node 22+). Sirve el sitio en `/` y el CRM en `/crm` en un mismo origen, con URLs limpias, SEO/GEO inyectado, formulario administrable, redirecciones 301, roles, estadísticas y más. *(La base de datos no se incluye.)*
- **`docs/`** — export estático del sitio para GitHub Pages.

## Correr el proyecto completo (sitio + CRM) en local
```bash
cd jkd-legacy-crm
node --disable-warning=ExperimentalWarning server.js
# Sitio:  http://localhost:8796/
# CRM:    http://localhost:8796/crm
```
