export const SITE_URL = 'https://www.nexoraglobal.agency';
export const SITE_NAME = 'Nexora Global';
export const CONTACT_EMAIL = 'support@nexoraglobal.agency';
export const PHONE_DISPLAY = '+1 (917) 962-0181';
export const PHONE_HREF = '+19179620181';
export const SOCIAL_IMAGE_URL = `${SITE_URL}/solar-preview.svg`;

export const PAGE_META = {
  '/': {
    title: 'Nexora Global | Solar Options for US Property Owners',
    description: 'Nexora Global helps US property owners explore solar options, submit an inquiry, and, when appropriate, connect with a participating independent solar provider.',
    eyebrow: 'Solar options for US properties',
    breadcrumb: 'Home',
    schemaType: 'WebPage',
    robots: 'index,follow,max-image-preview:large',
  },
  '/about': {
    title: 'About Nexora Global | Solar Matching Service',
    description: 'Learn how Nexora Global helps US property owners submit and verify solar inquiries before matching eligible requests with independent solar providers.',
    breadcrumb: 'About',
    schemaType: 'AboutPage',
    robots: 'index,follow,max-image-preview:large',
  },
  '/how-it-works': {
    title: 'How Solar Matching Works | Nexora Global',
    description: 'See how Nexora Global reviews property and energy information, verifies interest, and connects eligible US property owners with independent solar providers.',
    breadcrumb: 'How it works',
    schemaType: 'WebPage',
    robots: 'index,follow,max-image-preview:large',
  },
  '/contact': {
    title: 'Contact Nexora Global | Solar Inquiry Support',
    description: 'Contact Nexora Global for help with a solar property inquiry, the matching process, privacy requests, or communication preferences.',
    breadcrumb: 'Contact',
    schemaType: 'ContactPage',
    robots: 'index,follow,max-image-preview:large',
  },
  '/privacy-policy': {
    title: 'Privacy Policy | Nexora Global',
    description: 'Read how Nexora Global collects, uses, protects, and shares personal information submitted through its solar inquiry service.',
    breadcrumb: 'Privacy Policy',
    schemaType: 'WebPage',
    robots: 'index,follow,max-image-preview:large',
  },
  '/terms': {
    title: 'Terms of Use | Nexora Global',
    description: 'Review the terms that apply when using the Nexora Global website and solar inquiry matching service.',
    breadcrumb: 'Terms of Use',
    schemaType: 'WebPage',
    robots: 'index,follow,max-image-preview:large',
  },
  ...Object.fromEntries(Object.entries({
    '/solar-installation-process': ['Solar Installation Process: What to Expect | Nexora Global', 'Learn the practical home solar steps, from assessment and permits through installation, inspection, and utility activation.', 'Solar installation process'],
    '/how-many-solar-panels-do-i-need': ['How Many Solar Panels Do I Need? | Nexora Global', 'Learn the electricity-use, roof, sunlight, shading, and panel-output factors that determine a home solar system size.', 'Solar panel sizing'],
    '/solar-financing': ['Solar Financing Options Explained | Nexora Global', 'Compare cash purchases, loans, leases, and PPAs before deciding how to finance a solar project.', 'Solar financing'],
    '/solar-lease-vs-loan': ['Solar Lease vs. Loan: Key Differences | Nexora Global', 'Compare ownership, payments, contract obligations, maintenance, incentives, and home-sale considerations.', 'Solar lease vs. loan'],
    '/is-solar-worth-it': ['Is Solar Worth It for Your Home? | Nexora Global', 'Understand the property, cost, sunlight, financing, and ownership factors that affect whether solar is worth exploring.', 'Is solar worth it'],
  }).map(([route, [title, description, breadcrumb]]) => [route, { title, description, breadcrumb, schemaType: 'Article', robots: 'index,follow,max-image-preview:large' }])),  '/solar/texas': {
    title: 'Solar in Texas: A Homeowner Decision Guide | Nexora Global', h1: 'Solar in Texas: A Homeowner Decision Guide',
    description: 'Explore Texas home-solar questions, from roof and electricity-use review to utility interconnection, provider comparisons, and system-size planning.',
    breadcrumb: 'Solar in Texas', schemaType: 'Article', robots: 'index,follow,max-image-preview:large',
    snapshot: 'Texas homeowners should evaluate electricity use, usable roof space, shade, financing terms, and the requirements of the retail electric provider or utility serving the property. This guide explains a careful research process and links to a planning estimator; it is not an installation offer, savings promise, or engineering design.',
  },
  '/solar/florida': {
    title: 'Solar in Florida: A Homeowner Decision Guide | Nexora Global', h1: 'Solar in Florida: A Homeowner Decision Guide',
    description: 'Explore Florida home-solar questions, including roof condition, weather planning, utility interconnection, quote scope, and system-size planning.',
    breadcrumb: 'Solar in Florida', schemaType: 'Article', robots: 'index,follow,max-image-preview:large',
    snapshot: 'Florida homeowners can make a clearer solar decision by reviewing roof condition, shade, electricity use, equipment and installation scope, storm-readiness questions, and the rules of the utility serving the property. This is an educational guide, not a quote, engineering design, or promise of savings.',
  },
  '/solar-panel-cost': {
    title: 'Solar Panel Cost: What a Complete Home Quote Should Include | Nexora Global', h1: 'Solar Panel Cost: What a Complete Home Quote Should Include',
    description: 'Learn what changes residential solar cost, how to compare complete quotes, and why system size, roof work, equipment, and financing matter.',
    breadcrumb: 'Solar panel cost', schemaType: 'Article', robots: 'index,follow,max-image-preview:large',
    snapshot: 'A useful solar cost comparison starts with the complete scope rather than a single headline number. This guide explains how system size, equipment, roof and electrical work, permitting, interconnection, financing, and contract terms can change a homeowner’s final proposal.',
  },
  '/solar-panel-cost/texas': {
    title: 'Solar Panel Cost in Texas: How to Compare Home Quotes | Nexora Global', h1: 'Solar Panel Cost in Texas: How to Compare Home Quotes',
    description: 'Understand the Texas-specific questions that can affect a home solar proposal, including electricity plans, interconnection, roof scope, and financing.',
    breadcrumb: 'Solar panel cost in Texas', schemaType: 'Article', robots: 'index,follow,max-image-preview:large',
    snapshot: 'A Texas solar proposal should make clear which electricity plan or utility context it assumes, along with system size, production assumptions, roof and electrical scope, interconnection steps, financing, and all contract terms. Compare the complete written scope rather than a headline price.',
  },
  '/solar-panel-cost/florida': {
    title: 'Solar Panel Cost in Florida: How to Compare Home Quotes | Nexora Global', h1: 'Solar Panel Cost in Florida: How to Compare Home Quotes',
    description: 'Understand the Florida-specific questions that can affect a home solar proposal, including roof condition, weather planning, utility rules, and financing.',
    breadcrumb: 'Solar panel cost in Florida', schemaType: 'Article', robots: 'index,follow,max-image-preview:large',
    snapshot: 'A Florida solar proposal should identify its roof and electrical scope, system design assumptions, utility interconnection steps, weather-related installation planning, financing, and contract obligations. Homeowners should compare complete written proposals rather than a single advertised figure.',
  },  '/solar-system-size-estimator': {
    title: 'Solar System Size Estimator | Nexora Global',
    h1: 'Solar System Size Estimator',
    description: 'Use your ZIP code and electricity use to estimate a U.S. home solar system-size, panel-count, and modeled production range.',
    breadcrumb: 'Solar System Size Estimator',
    schemaType: 'WebApplication',
    robots: 'index,follow,max-image-preview:large',
  },  '/404': {
    title: 'Page Not Found | Nexora Global',
    description: 'The requested page could not be found. Return to Nexora Global to explore solar options for your property.',
    breadcrumb: 'Page not found',
    schemaType: 'WebPage',
    robots: 'noindex,follow',
    noCanonical: true,
  },
};

export const PUBLIC_ROUTES = Object.keys(PAGE_META).filter((route) => route !== '/404');
export const PRERENDER_ROUTES = [...PUBLIC_ROUTES, '/404'];

export function normalizePathname(pathname = '/') {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return PAGE_META[normalized] ? normalized : '/404';
}

export function canonicalForRoute(route) {
  const meta = PAGE_META[route] || PAGE_META['/404'];
  if (meta.noCanonical) return null;
  return route === '/' ? `${SITE_URL}/` : `${SITE_URL}${route}`;
}

export function getStructuredData(route) {
  const meta = PAGE_META[route] || PAGE_META['/404'];
  const canonical = canonicalForRoute(route);
  const organizationId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/favicon.svg`,
    image: SOCIAL_IMAGE_URL,
    email: CONTACT_EMAIL,
    telephone: PHONE_HREF,
    description: 'Solar inquiry collection, verification, and matching service for US property owners.',
    areaServed: { '@type': 'Country', name: 'United States' },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: CONTACT_EMAIL,
      telephone: PHONE_HREF,
      areaServed: 'US',
      availableLanguage: 'English',
    },
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteId,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    publisher: { '@id': organizationId },
  };

  const page = {
    '@context': 'https://schema.org',
    '@type': meta.schemaType,
    name: meta.title,
    description: meta.description,
    isPartOf: { '@id': websiteId },
    about: { '@id': organizationId },
    publisher: { '@id': organizationId },
  };

  if (canonical) page.url = canonical;
  if (meta.schemaType === 'WebApplication') Object.assign(page, { applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', featureList: 'ZIP-area solar production modeling, system-size planning range, panel-count planning range' });

  const breadcrumbs = route !== '/' && route !== '/404' ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: meta.breadcrumb,
        item: canonical,
      },
    ],
  } : null;

  return { organization, website, page, breadcrumbs };
}

export function getSeoData(route) {
  const resolvedRoute = PAGE_META[route] ? route : '/404';
  return {
    route: resolvedRoute,
    ...PAGE_META[resolvedRoute],
    canonical: canonicalForRoute(resolvedRoute),
    image: SOCIAL_IMAGE_URL,
    schemas: getStructuredData(resolvedRoute),
  };
}
