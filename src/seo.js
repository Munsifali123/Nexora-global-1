export const SITE_URL = 'https://www.nexoraglobal.agency';
export const SITE_NAME = 'Nexora Global';
export const CONTACT_EMAIL = 'support@nexoraglobal.agency';
export const PHONE_DISPLAY = '+1 (917) 962-0181';
export const PHONE_HREF = '+19179620181';
export const SOCIAL_IMAGE_URL = `${SITE_URL}/solar-preview.svg`;

export const PAGE_META = {
  '/': {
    title: 'Explore Solar Options for Your Property | Nexora Global',
    description: 'Answer a few questions about your US property and electricity use to explore solar options and request contact from a participating independent solar provider.',
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
  '/privacy': {
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
  '/404': {
    title: 'Page Not Found | Nexora Global',
    description: 'The requested page could not be found. Return to Nexora Global to explore solar options for your property.',
    breadcrumb: 'Page not found',
    schemaType: 'WebPage',
    robots: 'noindex,follow',
    noCanonical: true,
  },
};

export const PUBLIC_ROUTES = ['/', '/how-it-works', '/about', '/contact', '/privacy', '/terms'];
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
  };

  if (canonical) page.url = canonical;

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
