# JKD Legacy Academy — Website Redesign

A modern, bilingual (EN/ES) redesign of [jkdlegacy.com.au](https://jkdlegacy.com.au/) — Australia's authentic home for Bruce Lee's Jeet Kune Do under Sigung Ricardo Vargas.

## Pages

- **`index.html`** — Home: cinematic hero, instructor profile, training pathways, lineage preview
- **`legacy.html`** — The lineage from Bruce Lee through his direct disciples to the academy
- **`the-way.html`** — Three-stage training curriculum (Foundation → Progression → Mastery)
- **`join-the-family.html`** — Locations, admission process, inquiry form

## Stack

Pure static site — no build step.

- HTML5 + CSS3 + vanilla JS
- Design concept: **"The Intercepting Line"** — editorial monograph alternating ink + bone sections, with a centerline scroll system referencing JKD's centerline theory
- Google Fonts: Fraunces (editorial serif) + Inter (UI) + Space Mono (technical labels)
- IntersectionObserver scroll-reveal, animated centerline progress, count-up stats, magnetic buttons
- localStorage-backed bilingual toggle (`i18n.js`) — EN/ES

## Local development

Serve the directory with any static server, e.g.:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Credits

Original assets (logos, photographs of Bruce Lee and the JKD lineage) © The JKD Legacy Academy.
