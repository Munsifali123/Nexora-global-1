const CANONICAL_LEAD_FIELDS = [
  'name', 'number', 'email', 'address', 'zipCode', 'propertyType',
  'ownership', 'electricBill', 'sunlightExposure', 'timeline',
  'financingInterest', 'description', 'consent', 'consentText',
  'consentVersion', 'leadStatus', 'phoneVerified', 'pageUrl', 'source',
  'createdAt', 'county', 'campaignVariant',
];

const SOURCE_FIELDS = ['internalSource', 'utmSource', 'utmMedium', 'utmCampaign', 'gclid'];
const SOURCE_MAX_LENGTHS = {
  internalSource: 200,
  utmSource: 200,
  utmMedium: 200,
  utmCampaign: 300,
  gclid: 512,
};
const ALLOWED_LEAD_VALUES = {
  propertyType: [
    'Single-family home',
    'Multifamily property',
    'Commercial property',
    'Farm or agricultural property',
    'Other',
  ],
  ownership: [
    'I own the property',
    'I am authorized to make decisions',
    'I am purchasing the property',
    'I rent or lease the property',
  ],
  electricBill: ['Under $100', '$100–$200', '$201–$350', '$351–$500', '$500+'],
  sunlightExposure: ['Mostly full sun', 'Some shade', 'Heavy shade', 'Unsure'],
  timeline: [
    'As soon as possible',
    'Within 1–3 months',
    'Within 3–6 months',
    'Within 6–12 months',
    'Just researching',
  ],
  financingInterest: ['Interested in financing', 'Planning to pay cash', 'Not sure yet'],
};
const PAID_COUNTIES = ['Orange County', 'Riverside County', 'San Bernardino County'];

function isPlainObject(value) {
  return Boolean(value) && Object.prototype.toString.call(value) === '[object Object]';
}

function hasExactFields(value, fields) {
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function hasUnsafeControlCharacters(value, multiline = false) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    const allowedWhitespace = multiline && (code === 9 || code === 10 || code === 13);
    if (code === 127 || (code < 32 && !allowedWhitespace)) return true;
  }
  return false;
}

function validateText(lead, field, minLength, maxLength, { multiline = false } = {}) {
  const value = lead[field];
  if (typeof value !== 'string') throw new Error(`Invalid lead field: ${field}`);
  const length = value.trim().length;
  if (length < minLength || length > maxLength) throw new Error(`Invalid lead field: ${field}`);
  if (hasUnsafeControlCharacters(value, multiline)) throw new Error(`Invalid lead field: ${field}`);
}

function createdAtIso(value) {
  let date;
  if (value instanceof Date) date = value;
  else if (value && typeof value.toDate === 'function') date = value.toDate();
  else if (typeof value === 'string') date = new Date(value);
  else throw new Error('Invalid creation time.');

  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid creation time.');
  return date.toISOString();
}

export function validateLeadId(leadId) {
  if (typeof leadId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(leadId)) {
    throw new Error('Invalid lead ID.');
  }
  return leadId;
}

export function validateNotificationRequest(value) {
  if (!isPlainObject(value) || !hasExactFields(value, ['leadId'])) {
    throw new Error('Invalid lead notification request.');
  }
  return { leadId: validateLeadId(value.leadId) };
}

function validateOutboundLead(lead) {
  if (!isPlainObject(lead) || !hasExactFields(lead, ['leadId', ...CANONICAL_LEAD_FIELDS])) {
    throw new Error('Invalid lead payload.');
  }

  validateLeadId(lead.leadId);
  validateText(lead, 'name', 2, 120);
  validateText(lead, 'number', 7, 30);
  validateText(lead, 'email', 5, 254);
  validateText(lead, 'address', 5, 300);
  validateText(lead, 'zipCode', 5, 10);
  validateText(lead, 'description', 0, 2000, { multiline: true });
  validateText(lead, 'consentText', 40, 1000, { multiline: true });
  validateText(lead, 'consentVersion', 8, 50);
  validateText(lead, 'pageUrl', 8, 2048);
  validateText(lead, 'createdAt', 20, 40);
  validateText(lead, 'county', 0, 32);
  validateText(lead, 'campaignVariant', 1, 80);

  if (!/^\+?[0-9() .-]{7,30}$/.test(lead.number)) throw new Error('Invalid phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) throw new Error('Invalid email address.');
  if (!/^[0-9]{5}(-[0-9]{4})?$/.test(lead.zipCode)) throw new Error('Invalid ZIP code.');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}([._-][A-Za-z0-9]+)?$/.test(lead.consentVersion)) {
    throw new Error('Invalid consent version.');
  }
  if (!Number.isFinite(Date.parse(lead.createdAt))) throw new Error('Invalid creation time.');
  try {
    const pageUrl = new URL(lead.pageUrl);
    if (!['http:', 'https:'].includes(pageUrl.protocol)) throw new Error();
  } catch {
    throw new Error('Invalid page URL.');
  }

  for (const [field, allowedValues] of Object.entries(ALLOWED_LEAD_VALUES)) {
    if (!allowedValues.includes(lead[field])) throw new Error(`Invalid lead field: ${field}`);
  }
  if (lead.consent !== true) throw new Error('Contact consent is required.');
  if (lead.leadStatus !== 'new') throw new Error('Invalid lead status.');
  if (lead.phoneVerified !== false) throw new Error('Invalid phone verification state.');

  if (!isPlainObject(lead.source) || !hasExactFields(lead.source, SOURCE_FIELDS)) {
    throw new Error('Invalid source data.');
  }
  for (const field of SOURCE_FIELDS) {
    if (
      typeof lead.source[field] !== 'string'
      || lead.source[field].length > SOURCE_MAX_LENGTHS[field]
      || hasUnsafeControlCharacters(lead.source[field])
    ) {
      throw new Error(`Invalid source field: ${field}`);
    }
  }

  if (lead.campaignVariant === 'organic') {
    if (lead.county !== '') throw new Error('Organic inquiries must not declare a paid campaign county.');
  } else if (lead.campaignVariant === 'california_homeowners') {
    if (!PAID_COUNTIES.includes(lead.county)) throw new Error('Invalid paid campaign county.');
    if (!['Single-family home', 'Multifamily property'].includes(lead.propertyType)) {
      throw new Error('Invalid paid campaign property type.');
    }
    if (lead.ownership !== 'I own the property') {
      throw new Error('Invalid paid campaign property relationship.');
    }
  } else {
    throw new Error('Invalid campaign variant.');
  }

  return lead;
}

export function validateCanonicalLead(leadId, data) {
  validateLeadId(leadId);
  if (!isPlainObject(data) || !hasExactFields(data, CANONICAL_LEAD_FIELDS)) {
    throw new Error('Invalid canonical lead.');
  }

  const lead = {
    leadId,
    ...data,
    source: isPlainObject(data.source) ? { ...data.source } : data.source,
    createdAt: createdAtIso(data.createdAt),
  };
  return validateOutboundLead(lead);
}

// Retained as a server-side schema export for focused validation tests. The
// notification route never calls this with browser-supplied lead details.
export function validateLeadNotificationPayload(lead) {
  return validateOutboundLead(lead);
}

export const canonicalLeadFields = Object.freeze([...CANONICAL_LEAD_FIELDS]);
