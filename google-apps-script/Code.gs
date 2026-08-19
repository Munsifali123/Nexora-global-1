/**
 * Nexora Global internal lead-notification pipeline.
 *
 * The website stores each inquiry in Firestore before the Node server sends the
 * canonical lead payload here. This script keeps a durable, lead-ID-keyed row
 * and sends one internal operational alert. It never emails the homeowner.
 */
const DEFAULTS = {
  sheetName: 'Solar Leads',
  senderEmail: 'support@nexoraglobal.agency',
};

const REQUIRED_PROPERTIES = [
  'SPREADSHEET_ID', 'SHEET_NAME', 'SENDER_EMAIL', 'NOTIFICATION_EMAIL',
  'WEBHOOK_TOKEN', 'BREVO_API_KEY'
];

const ALLOWED_VALUES = {
  propertyType: ['Single-family home', 'Multifamily property', 'Commercial property', 'Farm or agricultural property', 'Other'],
  ownership: ['I own the property', 'I am authorized to make decisions', 'I am purchasing the property', 'I rent or lease the property'],
  electricBill: ['Under $100', '$100\u2013$200', '$201\u2013$350', '$351\u2013$500', '$500+'],
  sunlightExposure: ['Mostly full sun', 'Some shade', 'Heavy shade', 'Unsure'],
  timeline: ['As soon as possible', 'Within 1\u20133 months', 'Within 3\u20136 months', 'Within 6\u201312 months', 'Just researching'],
  financingInterest: ['Interested in financing', 'Planning to pay cash', 'Not sure yet'],
};

const HEADERS = [
  'Received At', 'Lead ID', 'Status', 'Name', 'Phone', 'Email', 'Property Address',
  'ZIP Code', 'Property Type', 'Property Relationship', 'Electric Bill', 'Sun Exposure',
  'Timeline', 'Financing Interest', 'Notes', 'Phone Verified', 'Consent Version',
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'GCLID', 'Page URL', 'Reference Number',
  'County', 'Campaign Variant', 'Notification Status', 'Notified At'
];

const LEAD_FIELDS = [
  'leadId', 'name', 'number', 'email', 'address', 'zipCode', 'propertyType',
  'ownership', 'electricBill', 'sunlightExposure', 'timeline',
  'financingInterest', 'description', 'consent', 'consentText',
  'consentVersion', 'leadStatus', 'phoneVerified', 'pageUrl', 'source',
  'createdAt', 'county', 'campaignVariant'
];

const SOURCE_FIELDS = ['internalSource', 'utmSource', 'utmMedium', 'utmCampaign', 'gclid'];
const SOURCE_MAX_LENGTHS = { internalSource: 200, utmSource: 200, utmMedium: 200, utmCampaign: 300, gclid: 512 };
const PAID_COUNTIES = ['Orange County', 'Riverside County', 'San Bernardino County'];

function setupNexoraLeadPipeline() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open Apps Script from the lead spreadsheet.');

  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    SPREADSHEET_ID: properties.getProperty('SPREADSHEET_ID') || spreadsheet.getId(),
    SHEET_NAME: properties.getProperty('SHEET_NAME') || DEFAULTS.sheetName,
    SENDER_EMAIL: properties.getProperty('SENDER_EMAIL') || DEFAULTS.senderEmail,
  });
  requireConfiguration_(properties);

  const sheet = getOrCreateSheet_(spreadsheet, properties.getProperty('SHEET_NAME'));
  ensureHeaders_(sheet);
  return 'Nexora lead pipeline configured successfully.';
}

function doGet() {
  return jsonResponse_({ ok: true, service: 'Nexora lead notifications' });
}

function doPost(event) {
  try {
    const properties = PropertiesService.getScriptProperties();
    requireConfiguration_(properties);
    const suppliedToken = event && event.parameter ? String(event.parameter.token || '') : '';
    if (!secureEqual_(suppliedToken, properties.getProperty('WEBHOOK_TOKEN'))) {
      return jsonResponse_({ ok: false, error: 'Unauthorized' });
    }

    const rawPayload = String(event.parameter.payload || '');
    if (!rawPayload || rawPayload.length > 20000) throw new Error('Invalid request.');
    const lead = JSON.parse(rawPayload);
    validateLead_(lead);

    const result = processLead_(lead, properties);
    return jsonResponse_({
      ok: true,
      leadId: lead.leadId,
      referenceNumber: result.referenceNumber,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error('Lead notification request failed.');
    return jsonResponse_({ ok: false, error: 'Request could not be processed.' });
  }
}

/**
 * The script lock covers row lookup/creation and delivery state transitions.
 * A request that races with another request therefore cannot append or notify
 * the same lead twice. Brevo also receives a deterministic idempotency key so a
 * retry after an uncertain network result is safe at the provider boundary.
 */
function processLead_(lead, properties) {
  const spreadsheet = SpreadsheetApp.openById(properties.getProperty('SPREADSHEET_ID'));
  const sheet = getOrCreateSheet_(spreadsheet, properties.getProperty('SHEET_NAME'));
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    ensureHeaders_(sheet);
    const leadIdColumn = columnNumber_('Lead ID');
    const referenceColumn = columnNumber_('Reference Number');
    const statusColumn = columnNumber_('Notification Status');
    const notifiedAtColumn = columnNumber_('Notified At');
    let rowNumber = findLeadRow_(sheet, lead.leadId, leadIdColumn);

    if (!rowNumber) {
      const referenceNumber = nextReferenceNumber_(sheet, referenceColumn);
      appendLeadRow_(sheet, lead, referenceNumber);
      rowNumber = sheet.getLastRow();
    }

    let referenceNumber = String(sheet.getRange(rowNumber, referenceColumn).getDisplayValue() || '').trim();
    if (!referenceNumber) {
      referenceNumber = nextReferenceNumber_(sheet, referenceColumn);
      sheet.getRange(rowNumber, referenceColumn).setValue(referenceNumber);
    }

    const existingStatus = String(sheet.getRange(rowNumber, statusColumn).getDisplayValue() || '').trim().toLowerCase();
    if (existingStatus === 'delivered') {
      return { referenceNumber: referenceNumber, duplicate: true };
    }

    sheet.getRange(rowNumber, statusColumn).setValue('delivering');
    if (typeof SpreadsheetApp.flush === 'function') SpreadsheetApp.flush();

    try {
      const delivery = sendInternalNotification_(
        Object.assign({}, lead, { referenceNumber: referenceNumber }),
        properties
      );
      sheet.getRange(rowNumber, statusColumn).setValue('delivered');
      sheet.getRange(rowNumber, notifiedAtColumn).setValue(new Date().toISOString());
      return { referenceNumber: referenceNumber, duplicate: delivery.duplicate === true };
    } catch (error) {
      sheet.getRange(rowNumber, statusColumn).setValue('failed');
      throw new Error('Internal notification was not accepted.');
    }
  } finally {
    lock.releaseLock();
  }
}

function appendLeadRow_(sheet, lead, referenceNumber) {
  const source = lead.source || {};
  const row = [
    lead.createdAt, lead.leadId, lead.leadStatus || 'new', lead.name,
    lead.number, lead.email, lead.address, lead.zipCode, lead.propertyType, lead.ownership,
    lead.electricBill, lead.sunlightExposure, lead.timeline, lead.financingInterest,
    lead.description || '', Boolean(lead.phoneVerified), lead.consentVersion || '',
    source.utmSource || '', source.utmMedium || '', source.utmCampaign || '', source.gclid || '',
    lead.pageUrl || '', referenceNumber, lead.county, lead.campaignVariant, 'pending', ''
  ].map(protectSheetValue_);
  sheet.appendRow(row);
}

function findLeadRow_(sheet, leadId, leadIdColumn) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const values = sheet.getRange(2, leadIdColumn, lastRow - 1, 1).getDisplayValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][0] || '').trim() === String(leadId)) return index + 2;
  }
  return 0;
}

function nextReferenceNumber_(sheet, referenceColumn) {
  let nextNumber = 1001;
  if (sheet.getLastRow() > 1) {
    const references = sheet.getRange(2, referenceColumn, sheet.getLastRow() - 1, 1).getDisplayValues();
    references.forEach(function (row) {
      const match = /^S-(\d+)$/.exec(String(row[0] || '').trim());
      if (match) nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
    });
  }
  return 'S-' + String(nextNumber).padStart(4, '0');
}

function sendInternalNotification_(lead, properties) {
  const senderEmail = properties.getProperty('SENDER_EMAIL');
  const notificationEmail = properties.getProperty('NOTIFICATION_EMAIL');
  const idempotencyKey = idempotencyKeyForLead_(lead.leadId);
  const syntheticPrefix = isSyntheticTestLead_(lead) ? 'SYNTHETIC TEST \u2014 ' : '';

  return sendBrevoEmail_({
    apiKey: properties.getProperty('BREVO_API_KEY'),
    senderEmail: senderEmail,
    senderName: 'Nexora Lead Alerts',
    recipientEmail: notificationEmail,
    recipientName: 'Nexora Team',
    replyTo: senderEmail,
    subject: syntheticPrefix + 'New solar inquiry ' + lead.referenceNumber,
    textContent: formatInternalNotification_(lead),
    idempotencyKey: idempotencyKey,
  });
}

function sendBrevoEmail_(message) {
  const response = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      accept: 'application/json',
      'api-key': message.apiKey,
    },
    payload: JSON.stringify({
      sender: { email: message.senderEmail, name: message.senderName },
      to: [{ email: message.recipientEmail, name: message.recipientName }],
      replyTo: { email: message.replyTo },
      subject: message.subject,
      textContent: message.textContent,
      headers: {
        'Idempotency-Key': message.idempotencyKey,
      },
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status >= 200 && status < 300) return { duplicate: false };
  if (isSafeBrevoDuplicateResponse_(status, response.getContentText())) return { duplicate: true };
  throw new Error('Notification provider rejected the request.');
}

function isSafeBrevoDuplicateResponse_(status, responseText) {
  if (status !== 400 && status !== 409) return false;
  let body;
  try {
    body = JSON.parse(String(responseText || '').slice(0, 4096));
  } catch (error) {
    return false;
  }

  const code = String(body.code || body.errorCode || '').toLowerCase();
  const message = String(body.message || body.error || '').toLowerCase();
  const explicitDuplicateCodes = [
    'duplicate_parameter', 'duplicate_request', 'idempotency_key_already_used',
    'idempotency_key_reused'
  ];
  if (explicitDuplicateCodes.indexOf(code) !== -1) return true;
  return message.indexOf('idempotenc') !== -1 && /(duplicate|already|processed|used)/.test(message);
}

function idempotencyKeyForLead_(leadId) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'nexora-internal-lead-notification:' + String(leadId)
  ).slice(0, 16).map(function (value) {
    return value < 0 ? value + 256 : value;
  });
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function isSyntheticTestLead_(lead) {
  return /^SYNTHETIC TEST\b/i.test(String(lead.name || '').trim())
    || /synthetic/i.test(String(lead.consentVersion || ''));
}

function formatInternalNotification_(lead) {
  return [
    'A new solar inquiry was stored.', '',
    'Reference: ' + safeEmailText_(lead.referenceNumber),
    'Internal lead ID: ' + safeEmailText_(lead.leadId),
    'Status: ' + safeEmailText_(lead.leadStatus || 'new'),
    'Name: ' + safeEmailText_(lead.name),
    'Phone: ' + safeEmailText_(lead.number),
    'Email: ' + safeEmailText_(lead.email),
    'ZIP: ' + safeEmailText_(lead.zipCode),
    'County: ' + safeEmailText_(lead.county || 'Not supplied (organic inquiry)'),
    'Campaign variant: ' + safeEmailText_(lead.campaignVariant),
    'Property type: ' + safeEmailText_(lead.propertyType),
    'Relationship: ' + safeEmailText_(lead.ownership),
    'Timeline: ' + safeEmailText_(lead.timeline), '',
    'Review the complete record in the private lead Sheet or Firestore.'
  ].join('\n');
}

function validateLead_(lead) {
  if (!lead || Object.prototype.toString.call(lead) !== '[object Object]') throw new Error('Invalid lead payload.');
  if (!hasExactFields_(lead, LEAD_FIELDS)) throw new Error('Invalid lead payload.');
  validateText_(lead, 'leadId', 8, 128);
  validateText_(lead, 'name', 2, 120);
  validateText_(lead, 'number', 7, 30);
  validateText_(lead, 'email', 5, 254);
  validateText_(lead, 'address', 5, 300);
  validateText_(lead, 'zipCode', 5, 10);
  validateText_(lead, 'description', 0, 2000);
  validateText_(lead, 'consentText', 40, 1000);
  validateText_(lead, 'consentVersion', 8, 50);
  validateText_(lead, 'pageUrl', 8, 2048);
  validateText_(lead, 'createdAt', 20, 40);
  validateText_(lead, 'county', 0, 32);
  validateText_(lead, 'campaignVariant', 1, 80);

  if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(lead.leadId))) throw new Error('Invalid lead ID.');
  if (!/^\+?[0-9() .-]{7,30}$/.test(String(lead.number))) throw new Error('Invalid phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(lead.email))) throw new Error('Invalid email address.');
  if (!/^[0-9]{5}(-[0-9]{4})?$/.test(String(lead.zipCode))) throw new Error('Invalid ZIP code.');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}([._-][A-Za-z0-9]+)?$/.test(lead.consentVersion)) throw new Error('Invalid consent version.');
  if (isNaN(Date.parse(lead.createdAt))) throw new Error('Invalid creation time.');
  Object.keys(ALLOWED_VALUES).forEach(function (field) {
    if (ALLOWED_VALUES[field].indexOf(lead[field]) === -1) throw new Error('Invalid lead field: ' + field);
  });
  if (lead.leadStatus !== 'new') throw new Error('Invalid lead status.');
  if (lead.phoneVerified !== false) throw new Error('Invalid phone verification state.');
  if (!lead.source || Object.prototype.toString.call(lead.source) !== '[object Object]' || !hasExactFields_(lead.source, SOURCE_FIELDS)) throw new Error('Invalid source data.');
  SOURCE_FIELDS.forEach(function (field) {
    const value = lead.source[field];
    if (typeof value !== 'string' || value.length > SOURCE_MAX_LENGTHS[field]) throw new Error('Invalid source field: ' + field);
  });
  if (lead.consent !== true) throw new Error('Contact consent is required.');

  if (lead.campaignVariant === 'organic') {
    if (lead.county !== '') throw new Error('Invalid organic campaign county.');
  } else if (lead.campaignVariant === 'california_homeowners') {
    if (PAID_COUNTIES.indexOf(lead.county) === -1) throw new Error('Invalid paid campaign county.');
    if (['Single-family home', 'Multifamily property'].indexOf(lead.propertyType) === -1) throw new Error('Invalid paid campaign property type.');
    if (lead.ownership !== 'I own the property') throw new Error('Invalid paid campaign relationship.');
  } else {
    throw new Error('Invalid campaign variant.');
  }
}

function validateText_(object, field, minLength, maxLength) {
  const value = object[field];
  if (typeof value !== 'string') throw new Error('Invalid lead field: ' + field);
  const length = value.trim().length;
  if (length < minLength || length > maxLength) throw new Error('Invalid lead field: ' + field);
}

function hasExactFields_(object, fields) {
  const keys = Object.keys(object).sort();
  const expected = fields.slice().sort();
  return keys.length === expected.length && keys.every(function (key, index) {
    return key === expected[index];
  });
}

function requireConfiguration_(properties) {
  REQUIRED_PROPERTIES.forEach(function (name) {
    if (!String(properties.getProperty(name) || '').trim()) throw new Error('Missing script configuration.');
  });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(properties.getProperty('SENDER_EMAIL'))) {
    throw new Error('Invalid script configuration.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(properties.getProperty('NOTIFICATION_EMAIL'))) {
    throw new Error('Invalid script configuration.');
  }
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    return;
  }

  const existingColumns = sheet.getLastColumn();
  const prefixLength = Math.min(existingColumns, HEADERS.length);
  const existingHeaders = prefixLength
    ? sheet.getRange(1, 1, 1, prefixLength).getDisplayValues()[0]
    : [];
  for (let index = 0; index < existingHeaders.length; index += 1) {
    if (String(existingHeaders[index] || '') !== HEADERS[index]) {
      throw new Error('Unexpected lead Sheet headers.');
    }
  }
  if (existingColumns < HEADERS.length) {
    const missingHeaders = HEADERS.slice(existingColumns);
    sheet.getRange(1, existingColumns + 1, 1, missingHeaders.length)
      .setValues([missingHeaders])
      .setFontWeight('bold');
  }
}

function columnNumber_(header) {
  const index = HEADERS.indexOf(header);
  if (index === -1) throw new Error('Unknown Sheet column.');
  return index + 1;
}

function protectSheetValue_(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /^\s*[=+\-@]/.test(text) ? "'" + text : text;
}

function safeEmailText_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .trim();
}

function secureEqual_(left, right) {
  const first = String(left || '');
  const second = String(right || '');
  let difference = first.length ^ second.length;
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0);
  }
  return difference === 0 && first.length > 0;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
