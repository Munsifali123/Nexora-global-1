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
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'GCLID', 'Page URL', 'Reference Number'
];

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
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
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
      lead.pageUrl || '', referenceNumber
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
    throw new Error('Brevo email failed (' + status + '): ' + response.getContentText());
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
    'Address: ' + lead.address,
    'ZIP: ' + lead.zipCode,
    'Property type: ' + lead.propertyType,
    'Relationship: ' + lead.ownership,
    'Electric bill: ' + lead.electricBill,
    'Sun exposure: ' + lead.sunlightExposure,
    'Timeline: ' + lead.timeline,
    'Financing: ' + lead.financingInterest,
    'Notes: ' + (lead.description || 'None'), '',
    'Review this lead in Firestore or the connected Google Sheet.'
  ].join('\n');
}

function validateLead_(lead) {
  if (!lead || Object.prototype.toString.call(lead) !== '[object Object]') throw new Error('Invalid lead payload.');
  validateText_(lead, 'leadId', 8, 128);
  validateText_(lead, 'name', 2, 100);
  validateText_(lead, 'number', 7, 30);
  validateText_(lead, 'email', 5, 254);
  validateText_(lead, 'address', 5, 300);
  validateText_(lead, 'zipCode', 5, 10);
  validateText_(lead, 'consentVersion', 1, 80);
  validateText_(lead, 'description', 0, 2000, true);
  validateText_(lead, 'pageUrl', 0, 2000, true);

  if (!/^[A-Za-z0-9_-]{8,128}$/.test(String(lead.leadId))) throw new Error('Invalid lead ID.');
  if (!/^\+?[0-9() .-]{7,30}$/.test(String(lead.number))) throw new Error('Invalid phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(lead.email))) throw new Error('Invalid email address.');
  if (!/^[0-9]{5}(-[0-9]{4})?$/.test(String(lead.zipCode))) throw new Error('Invalid ZIP code.');
  Object.keys(ALLOWED_VALUES).forEach(function (field) {
    if (ALLOWED_VALUES[field].indexOf(lead[field]) === -1) throw new Error('Invalid lead field: ' + field);
  });
  if (lead.leadStatus && lead.leadStatus !== 'new') throw new Error('Invalid lead status.');
  if (lead.source && Object.prototype.toString.call(lead.source) !== '[object Object]') throw new Error('Invalid source data.');
  ['utmSource', 'utmMedium', 'utmCampaign', 'gclid'].forEach(function (field) {
    const value = lead.source && lead.source[field];
    if (value && String(value).length > 250) throw new Error('Invalid source field: ' + field);
  });
  if (lead.consent !== true) throw new Error('Contact consent is required.');
}

function validateText_(object, field, minLength, maxLength, optional) {
  const value = object[field];
  if (optional && (value === undefined || value === null || value === '')) return;
  if (typeof value !== 'string') throw new Error('Invalid lead field: ' + field);
  const length = value.trim().length;
  if (length < minLength || length > maxLength) throw new Error('Invalid lead field: ' + field);
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
