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

function snapshotForRoute(route, seo) {
  if (route === '/solar-system-size-estimator') return `<main><p>Free Nexora Global tool</p><h1>Solar System Size Estimator</h1><p>Estimate a U.S. home solar system-size and panel-count range using a ZIP-code area, electricity use, and a public solar-production model. This is an educational estimate, not a quote or engineering design.</p><h2>How it works</h2><p>Enter a five-digit ZIP code, average monthly electricity use, desired offset, and panel wattage. We model annual production with PVGIS using an approximate ZIP-code tabulation-area centroid, then show a transparent planning range.</p><h2>What can change the result</h2><p>Roof layout, shading, orientation, equipment, setbacks, code, weather, utility rules, and a final site assessment can change a system design.</p><nav aria-label="Related solar resources"><a href="/how-many-solar-panels-do-i-need">How many solar panels do I need?</a><a href="/solar-installation-process">Solar installation process</a><a href="/is-solar-worth-it">Is solar worth it?</a></nav></main>`;
  const detail = seo.snapshot || seo.description;
  return `<main><h1>${escapeHtml(seo.h1 || seo.title)}</h1><p>${escapeHtml(detail)}</p><nav aria-label="Related solar resources"><a href="/solar-system-size-estimator">Solar System Size Estimator</a><a href="/solar-installation-process">Solar installation process</a><a href="/solar-financing">Solar financing options</a></nav></main>`;
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
  const snapshot = snapshotForRoute(route, seo);

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
