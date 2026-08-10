import { readFile } from 'node:fs/promises';
import { PUBLIC_ROUTES, getSeoData } from '../src/seo.js';
for (const route of PUBLIC_ROUTES) { const path = route === '/' ? 'dist/index.html' : `dist${route}/index.html`; const html = await readFile(path, 'utf8'); const seo = getSeoData(route); if (!html.includes(`<h1>${seo.title}</h1>`) || !html.includes(`href="${seo.canonical}"`) || (html.match(/rel="canonical"/g) || []).length !== 1) throw new Error(`SEO check failed: ${route}`); }
console.log(`SEO check passed for ${PUBLIC_ROUTES.length} public routes.`);
