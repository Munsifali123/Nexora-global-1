import { readFile } from 'node:fs/promises';
import { PUBLIC_ROUTES, SITEMAP_ROUTES, getSeoData } from '../src/seo.js';
const sitemap = await readFile('public/sitemap.xml', 'utf8');
const seenTitles = new Set();
const seenDescriptions = new Set();
for (const route of PUBLIC_ROUTES) {
  const path = route === '/' ? 'dist/index.html' : `dist${route}/index.html`;
  const html = await readFile(path, 'utf8');
  const seo = getSeoData(route);
  const h1 = seo.h1 || seo.title;
  const meaningfulText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (seenTitles.has(seo.title) || seenDescriptions.has(seo.description)) throw new Error(`Duplicate title or description: ${route}`);
  seenTitles.add(seo.title); seenDescriptions.add(seo.description);
  if (!html.includes(`<h1>${h1}</h1>`) || !html.includes(`href="${seo.canonical}"`) || (html.match(/rel="canonical"/g) || []).length !== 1 || meaningfulText.length < 160 || !html.includes('application/ld+json') || !html.includes('https://www.nexoraglobal.agency')) throw new Error(`SEO check failed: ${route}`);
  const inSitemap = sitemap.includes(`<loc>${seo.canonical}</loc>`);
  if (SITEMAP_ROUTES.includes(route) && !inSitemap) throw new Error(`Sitemap missing canonical route: ${route}`);
  if (!SITEMAP_ROUTES.includes(route) && inSitemap) throw new Error(`Excluded route appears in sitemap: ${route}`);
  if (seo.excludeFromSitemap && !html.includes('name="robots" content="noindex,follow"')) throw new Error(`Excluded route must be noindex: ${route}`);
}
console.log(`SEO check passed for ${PUBLIC_ROUTES.length} public routes.`);