/**
 * Nexora Global lead notification pipeline.
 * Create a Google Sheet, open Extensions > Apps Script, paste this file,
 * add the private values in Project Settings > Script properties, and deploy.
 */
const DEFAULTS = {
  sheetName: 'Solar Leads',
  senderEmail: 'support@nexoraglobal.agency',
  notificationEmail: 'syedmunsifali@nexoraglobal.agency',
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
  'County', 'Campaign Variant'
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
  if (!spreadsheet) throw new Error('Open Apps Script from the Google Sheet using Extensions > Apps Script.');

  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('WEBHOOK_TOKEN') || !properties.getProperty('BREVO_API_KEY')) {
    throw new Error('Add WEBHOOK_TOKEN and BREVO_API_KEY in Project Settings > Script properties first.');
  }

  properties.setProperties({
    SPREADSHEET_ID: spreadsheet.getId(),
    SHEET_NAME: properties.getProperty('SHEET_NAME') || DEFAULTS.sheetName,
    SENDER_EMAIL: properties.getProperty('SENDER_EMAIL') || DEFAULTS.senderEmail,
    NOTIFICATION_EMAIL: properties.getProperty('NOTIFICATION_EMAIL') || DEFAULTS.notificationEmail,
  });
  if (!properties.getProperty('NEXT_REFERENCE_NUMBER')) {
    properties.setProperty('NEXT_REFERENCE_NUMBER', '1001');
  }

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
    if (!event || !event.parameter || event.parameter.token !== properties.getProperty('WEBHOOK_TOKEN')) {
      return jsonResponse_({ ok: false, error: 'Unauthorized' });
    }

    const rawPayload = String(event.parameter.payload || '');
    if (!rawPayload || rawPayload.length > 20000) throw new Error('Invalid payload size.');
    const lead = JSON.parse(rawPayload);
    validateLead_(lead);

    const duplicateKey = 'lead-' + digest_(lead.leadId || (lead.email + lead.number));
    const cache = CacheService.getScriptCache();
    if (cache.get(duplicateKey)) return jsonResponse_({ ok: true, duplicate: true });

    const referenceNumber = appendLead_(lead, properties);
    const referencedLead = Object.assign({}, lead, { referenceNumber: referenceNumber });
    sendLeadEmails_(referencedLead, properties, cache);
    cache.put(duplicateKey, '1', 21600);

    return jsonResponse_({ ok: true, referenceNumber: referenceNumber });
  } catch (error) {
    console.error('Lead notification pipeline failed.');
    return jsonResponse_({ ok: false, error: 'Request could not be processed.' });
  }
}

function appendLead_(lead, properties) {
  const spreadsheet = SpreadsheetApp.openById(properties.getProperty('SPREADSHEET_ID'));
  const sheet = getOrCreateSheet_(spreadsheet, properties.getProperty('SHEET_NAME'));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ensureHeaders_(sheet);
    const referenceColumn = HEADERS.indexOf('Reference Number') + 1;
    if (sheet.getLastRow() > 1) {
      const existingLead = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
        .createTextFinder(String(lead.leadId))
        .matchEntireCell(true)
        .findNext();
      if (existingLead) {
        const existingReferenceCell = sheet.getRange(existingLead.getRow(), referenceColumn);
        const existingReference = String(existingReferenceCell.getDisplayValue() || '').trim();
        if (existingReference) return existingReference;

        const recoveredReference = nextReferenceNumber_(properties, sheet, referenceColumn);
        existingReferenceCell.setValue(recoveredReference);
        rememberNextReferenceNumber_(properties, recoveredReference);
        return recoveredReference;
      }
    }

    const referenceNumber = nextReferenceNumber_(properties, sheet, referenceColumn);
    const source = lead.source || {};
    const row = [
      lead.createdAt || new Date().toISOString(), lead.leadId, lead.leadStatus || 'new', lead.name,
      lead.number, lead.email, lead.address, lead.zipCode, lead.propertyType, lead.ownership,
      lead.electricBill, lead.sunlightExposure, lead.timeline, lead.financingInterest,
      lead.description || '', Boolean(lead.phoneVerified), lead.consentVersion || '',
      source.utmSource || '', source.utmMedium || '', source.utmCampaign || '', source.gclid || '',
      lead.pageUrl || '', referenceNumber, lead.county, lead.campaignVariant
    ].map(protectSheetValue_);
    sheet.appendRow(row);
    rememberNextReferenceNumber_(properties, referenceNumber);
    return referenceNumber;
  } finally {
    lock.releaseLock();
  }
}

function nextReferenceNumber_(properties, sheet, referenceColumn) {
  const storedNumber = Number(properties.getProperty('NEXT_REFERENCE_NUMBER'));
  let nextNumber = Number.isSafeInteger(storedNumber) && storedNumber >= 1001 ? storedNumber : 1001;

  if (sheet.getLastRow() > 1) {
    const references = sheet.getRange(2, referenceColumn, sheet.getLastRow() - 1, 1).getDisplayValues();
    references.forEach(function (row) {
      const match = /^S-(\d+)$/.exec(String(row[0] || '').trim());
      if (match) nextNumber = Math.max(nextNumber, Number(match[1]) + 1);
    });
  }

  return 'S-' + String(nextNumber).padStart(4, '0');
}

function rememberNextReferenceNumber_(properties, referenceNumber) {
  const sequence = Number(String(referenceNumber).replace(/^S-/, ''));
  const storedNumber = Number(properties.getProperty('NEXT_REFERENCE_NUMBER'));
  const nextNumber = Number.isSafeInteger(storedNumber) && storedNumber >= 1001 ? storedNumber : 1001;
  properties.setProperty('NEXT_REFERENCE_NUMBER', String(Math.max(nextNumber, sequence + 1)));
}

function sendLeadEmails_(lead, properties, cache) {
  const senderEmail = properties.getProperty('SENDER_EMAIL');
  const notificationEmail = properties.getProperty('NOTIFICATION_EMAIL');
  const apiKey = properties.getProperty('BREVO_API_KEY');
  const deliveryId = digest_(lead.leadId);

  const customerSubject = 'We received your solar request';
  const customerText = [
    'Hi ' + lead.name + ',', '',
    'Thank you for contacting Nexora Global. We received your solar request and will review the information you submitted.', '',
    'Reference: ' + lead.referenceNumber, '',
    'Nexora Global Support',
    'support@nexoraglobal.agency'
  ].join('\n');
  const customerHtml = '<p>Hi ' + escapeHtml_(lead.name) + ',</p>' +
    '<p>Thank you for contacting Nexora Global. We received your solar request and will review the information you submitted.</p>' +
    '<p><strong>Reference:</strong> ' + escapeHtml_(lead.referenceNumber) + '</p>' +
    '<p>Nexora Global Support<br><a href="mailto:support@nexoraglobal.agency">support@nexoraglobal.agency</a></p>';

  const ownerSubject = 'New solar lead: ' + lead.name + ' - ' + lead.zipCode;
  const ownerText = formatOwnerNotification_(lead);
  const ownerDeliveryKey = 'email-owner-' + deliveryId;
  if (!cache.get(ownerDeliveryKey)) {
    sendBrevoEmail_({
      apiKey: apiKey,
      senderEmail: senderEmail,
      senderName: 'Nexora Lead Alerts',
      recipientEmail: notificationEmail,
      recipientName: 'Nexora Team',
      replyTo: lead.email,
      subject: ownerSubject,
      textContent: ownerText,
    });
    cache.put(ownerDeliveryKey, '1', 21600);
  }

  const customerDeliveryKey = 'email-customer-' + deliveryId;
  if (!cache.get(customerDeliveryKey)) {
    sendBrevoEmail_({
      apiKey: apiKey,
      senderEmail: senderEmail,
      senderName: 'Nexora Global Support',
      recipientEmail: lead.email,
      recipientName: lead.name,
      replyTo: senderEmail,
      subject: customerSubject,
      textContent: customerText,
      htmlContent: customerHtml,
    });
    cache.put(customerDeliveryKey, '1', 21600);
  }
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
      htmlContent: message.htmlContent || undefined,
    }),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Brevo email request failed with status ' + status + '.');
  }
}

function formatOwnerNotification_(lead) {
  return [
    'A new solar inquiry was submitted.', '',
    'Reference: ' + lead.referenceNumber,
    'Internal lead ID: ' + lead.leadId,
    'Status: ' + (lead.leadStatus || 'new'),
    'Name: ' + lead.name,
    'Phone: ' + lead.number,
    'Email: ' + lead.email,
    'ZIP: ' + lead.zipCode,
    'County: ' + (lead.county || 'Not supplied (organic inquiry)'),
    'Campaign variant: ' + lead.campaignVariant,
    'Property type: ' + lead.propertyType,
    'Relationship: ' + lead.ownership,
    'Electric bill: ' + lead.electricBill,
    'Sun exposure: ' + lead.sunlightExposure,
    'Timeline: ' + lead.timeline,
    'Financing: ' + lead.financingInterest, '',
    'Review the full lead in Firestore or the connected Google Sheet.'
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
    if (!properties.getProperty(name)) throw new Error('Missing script property: ' + name);
  });
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
  if (existingColumns < HEADERS.length) {
    const missingHeaders = HEADERS.slice(existingColumns);
    sheet.getRange(1, existingColumns + 1, 1, missingHeaders.length)
      .setValues([missingHeaders])
      .setFontWeight('bold');
  }
}

function protectSheetValue_(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function digest_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value));
  return Utilities.base64EncodeWebSafe(bytes).slice(0, 40);
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
