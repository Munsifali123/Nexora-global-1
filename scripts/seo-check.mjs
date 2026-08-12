import { readFile } from 'node:fs/promises';
import { PUBLIC_ROUTES, getSeoData } from '../src/seo.js';
for (const route of PUBLIC_ROUTES) {
  const path = route === '/' ? 'dist/index.html' : `dist${route}/index.html`;
  const html = await readFile(path, 'utf8');
  const seo = getSeoData(route);
  const h1 = seo.h1 || seo.title;
  const meaningfulText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!html.includes(`<h1>${h1}</h1>`) || !html.includes(`href="${seo.canonical}"`) || (html.match(/rel="canonical"/g) || []).length !== 1 || meaningfulText.length < 160 || !html.includes('application/ld+json')) throw new Error(`SEO check failed: ${route}`);
}
console.log(`SEO check passed for ${PUBLIC_ROUTES.length} public routes.`);
