import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PRERENDER_ROUTES, getSeoData } from '../src/seo.js';

const DIST_DIRECTORY = new URL('../dist/', import.meta.url);
const baseHtml = (await readFile(new URL('index.html', DIST_DIRECTORY), 'utf8')).replaceAll('\r\n', '\n');

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function jsonLd(id, value) {
  return `<script id="${id}" type="application/ld+json">${JSON.stringify(value)}</script>`;
}

function renderRoute(route) {
  const seo = getSeoData(route);
  const canonical = seo.canonical ? `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />` : '';
  const schemas = [
    jsonLd('nexora-organization-schema', seo.schemas.organization),
    jsonLd('nexora-website-schema', seo.schemas.website),
    jsonLd('nexora-page-schema', seo.schemas.page),
    seo.schemas.breadcrumbs && jsonLd('nexora-breadcrumb-schema', seo.schemas.breadcrumbs),
  ].filter(Boolean).join('\n    ');
  const snapshot = `<main><h1>${escapeHtml(seo.title)}</h1><p>${escapeHtml(seo.description)}</p></main>`;

  return baseHtml
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(seo.description)}" />`)
    .replace(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${escapeHtml(seo.robots)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, canonical)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(seo.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(seo.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${escapeHtml(seo.canonical || '')}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${escapeHtml(seo.image)}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${escapeHtml(seo.image)}" />`)
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, schemas)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.title)}</title>`)
    .replace('<div id="root"></div>', `<div id="root">${snapshot}</div>`);
}

for (const route of PRERENDER_ROUTES) {
  const destination = route === '/' ? DIST_DIRECTORY : new URL(`.${route}/`, DIST_DIRECTORY);
  await mkdir(destination, { recursive: true });
  await writeFile(new URL('index.html', destination), renderRoute(route));
}
