import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appsScriptSource = readFileSync(
  new URL('../google-apps-script/Code.gs', import.meta.url),
  'utf8',
);

const validLead = {
  leadId: 'synthetic-lead-001',
  name: 'SYNTHETIC TEST Fixture',
  number: '+1 000 000 0000',
  email: 'homeowner@example.invalid',
  address: '123 Synthetic Street',
  zipCode: '00000',
  propertyType: 'Single-family home',
  ownership: 'I own the property',
  electricBill: '$100\u2013$200',
  sunlightExposure: 'Mostly full sun',
  timeline: 'Within 1\u20133 months',
  financingInterest: 'Not sure yet',
  description: 'Private synthetic notes that must stay out of email.',
  consent: true,
  consentText: 'Synthetic consent text that must stay out of notification email.',
  consentVersion: '2026-08-19-synthetic',
  leadStatus: 'new',
  phoneVerified: false,
  pageUrl: 'https://example.invalid/synthetic',
  source: {
    internalSource: 'synthetic',
    utmSource: 'local',
    utmMedium: 'test',
    utmCampaign: 'notification-test',
    gclid: 'gclid-private-value',
  },
  createdAt: '2026-08-19T00:00:00.000Z',
  county: '',
  campaignVariant: 'organic',
};

class FakeRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  setValues(values) {
    for (let rowIndex = 0; rowIndex < this.rowCount; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < this.columnCount; columnIndex += 1) {
        this.sheet.setCell(
          this.row + rowIndex,
          this.column + columnIndex,
          values[rowIndex][columnIndex],
        );
      }
    }
    return this;
  }

  getDisplayValues() {
    const values = [];
    for (let rowIndex = 0; rowIndex < this.rowCount; rowIndex += 1) {
      const row = [];
      for (let columnIndex = 0; columnIndex < this.columnCount; columnIndex += 1) {
        const value = this.sheet.getCell(this.row + rowIndex, this.column + columnIndex);
        row.push(value === undefined || value === null ? '' : String(value));
      }
      values.push(row);
    }
    return values;
  }

  getDisplayValue() {
    return this.getDisplayValues()[0][0];
  }

  setValue(value) {
    this.sheet.setCell(this.row, this.column, value);
    return this;
  }

  setFontWeight() {
    return this;
  }
}

class FakeSheet {
  constructor() {
    this.rows = [];
  }

  getLastRow() {
    return this.rows.length;
  }

  getLastColumn() {
    return this.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }

  setFrozenRows() {}

  appendRow(row) {
    this.rows.push([...row]);
  }

  getCell(row, column) {
    return this.rows[row - 1]?.[column - 1];
  }

  setCell(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
}

function createHarness(providerResponses = [{ status: 202, body: '{"messageId":"accepted"}' }]) {
  const sheet = new FakeSheet();
  const properties = {
    SPREADSHEET_ID: 'spreadsheet-test-id',
    SHEET_NAME: 'Solar Leads',
    SENDER_EMAIL: 'support@example.invalid',
    NOTIFICATION_EMAIL: 'alerts@example.invalid',
    WEBHOOK_TOKEN: 'server-only-test-token',
    BREVO_API_KEY: 'brevo-test-key',
  };
  const calls = [];
  const logs = [];
  const counters = { waitLock: 0, releaseLock: 0, flush: 0 };
  const responses = [...providerResponses];
  const scriptProperties = {
    getProperty(name) {
      return properties[name] || '';
    },
    setProperties(values) {
      Object.assign(properties, values);
    },
  };
  const spreadsheet = {
    getId: () => properties.SPREADSHEET_ID,
    getSheetByName: () => sheet,
    insertSheet: () => sheet,
  };

  const context = vm.createContext({
    console: {
      error(...values) {
        logs.push(values.join(' '));
      },
    },
    PropertiesService: {
      getScriptProperties: () => scriptProperties,
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      openById: () => spreadsheet,
      flush() {
        counters.flush += 1;
      },
    },
    LockService: {
      getScriptLock: () => ({
        waitLock(milliseconds) {
          assert.equal(milliseconds, 30000);
          counters.waitLock += 1;
        },
        releaseLock() {
          counters.releaseLock += 1;
        },
      }),
    },
    UrlFetchApp: {
      fetch(url, options) {
        calls.push({ url, options });
        const next = responses.shift() || { status: 202, body: '{"messageId":"accepted"}' };
        return {
          getResponseCode: () => next.status,
          getContentText: () => next.body,
        };
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest(algorithm, value) {
        assert.equal(algorithm, 'SHA_256');
        return [...createHash('sha256').update(String(value)).digest()]
          .map((byte) => byte > 127 ? byte - 256 : byte);
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(content) {
        return {
          content,
          setMimeType() {
            return this;
          },
        };
      },
    },
  });

  vm.runInContext(appsScriptSource, context);

  return {
    calls,
    context,
    counters,
    logs,
    properties,
    sheet,
    post(lead = validLead, token = properties.WEBHOOK_TOKEN) {
      context.__eventFixture = {
        parameter: {
          token,
          payload: JSON.stringify(lead),
        },
      };
      const output = vm.runInContext('doPost(__eventFixture)', context);
      delete context.__eventFixture;
      return JSON.parse(output.content);
    },
    evaluate(expression) {
      return vm.runInContext(expression, context);
    },
  };
}

function headerMap(sheet) {
  return new Map(sheet.rows[0].map((header, index) => [header, index]));
}

test('stores one durable row and sends one minimal internal notification', () => {
  const harness = createHarness();

  const first = harness.post();
  const second = harness.post();

  assert.deepEqual(first, {
    ok: true,
    leadId: validLead.leadId,
    referenceNumber: 'S-1001',
    duplicate: false,
  });
  assert.deepEqual(second, {
    ok: true,
    leadId: validLead.leadId,
    referenceNumber: 'S-1001',
    duplicate: true,
  });
  assert.equal(harness.sheet.rows.length, 2, 'header plus one lead row');
  assert.equal(harness.calls.length, 1, 'a delivered lead is not emailed again');
  assert.deepEqual(harness.counters, { waitLock: 2, releaseLock: 2, flush: 1 });

  const columns = headerMap(harness.sheet);
  const row = harness.sheet.rows[1];
  assert.equal(row[columns.get('Lead ID')], validLead.leadId);
  assert.equal(row[columns.get('Received At')], validLead.createdAt);
  assert.equal(row[columns.get('Reference Number')], 'S-1001');
  assert.equal(row[columns.get('Notification Status')], 'delivered');
  assert.match(row[columns.get('Notified At')], /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(row[columns.get('Property Address')], validLead.address);
  assert.equal(row[columns.get('GCLID')], validLead.source.gclid);

  const request = harness.calls[0];
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(request.options.headers['Idempotency-Key'], undefined);

  const email = JSON.parse(request.options.payload);
  assert.match(
    email.headers['Idempotency-Key'],
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(
    email.headers['Idempotency-Key'],
    harness.evaluate("idempotencyKeyForLead_('synthetic-lead-001')"),
  );

  assert.deepEqual(email.to, [{ email: 'alerts@example.invalid', name: 'Nexora Team' }]);
  assert.deepEqual(email.replyTo, { email: 'support@example.invalid' });
  assert.match(email.subject, /^SYNTHETIC TEST — New solar inquiry S-1001$/);
  assert.match(email.textContent, /Internal lead ID: synthetic-lead-001/);
  assert.match(email.textContent, /Email: homeowner@example\.invalid/);

  for (const forbidden of [
    validLead.address,
    validLead.description,
    validLead.consentText,
    validLead.source.gclid,
    validLead.electricBill,
    validLead.sunlightExposure,
    validLead.financingInterest,
  ]) {
    assert.equal(email.textContent.includes(forbidden), false, 'forbidden field stayed out of email');
  }
});

test('treats an explicit Brevo idempotency duplicate as accepted', () => {
  const harness = createHarness([{
    status: 409,
    body: JSON.stringify({
      code: 'conflict',
      message: 'The idempotency key has already been processed.',
    }),
  }]);

  const response = harness.post();
  assert.deepEqual(response, {
    ok: true,
    leadId: validLead.leadId,
    referenceNumber: 'S-1001',
    duplicate: true,
  });
  const columns = headerMap(harness.sheet);
  assert.equal(harness.sheet.rows[1][columns.get('Notification Status')], 'delivered');
  assert.match(harness.sheet.rows[1][columns.get('Notified At')], /^\d{4}-/);
});

test('accepts Brevo duplicate_parameter only for an allowed duplicate status', () => {
  const harness = createHarness();
  const body = '{"code":"duplicate_parameter"}';

  assert.equal(harness.evaluate(`isSafeBrevoDuplicateResponse_(400, '${body}')`), true);
  assert.equal(harness.evaluate(`isSafeBrevoDuplicateResponse_(409, '${body}')`), true);
  assert.equal(harness.evaluate(`isSafeBrevoDuplicateResponse_(422, '${body}')`), false);
});

test('does not accept an ambiguous provider conflict and logs no private data', () => {
  const harness = createHarness([{
    status: 409,
    body: JSON.stringify({ code: 'conflict', message: 'Recipient rejected.' }),
  }]);

  assert.deepEqual(harness.post(), {
    ok: false,
    error: 'Request could not be processed.',
  });
  const columns = headerMap(harness.sheet);
  assert.equal(harness.sheet.rows[1][columns.get('Notification Status')], 'failed');
  assert.deepEqual(harness.logs, ['Lead notification request failed.']);
  const logged = harness.logs.join(' ');
  assert.equal(logged.includes(validLead.email), false);
  assert.equal(logged.includes(validLead.address), false);
  assert.equal(logged.includes(harness.properties.BREVO_API_KEY), false);
  assert.equal(harness.counters.releaseLock, 1);
});

test('requires an explicit internal recipient and protects Sheet formulas', () => {
  const harness = createHarness();

  assert.throws(
    () => harness.evaluate(`requireConfiguration_({
      getProperty: function (name) {
        if (name === 'NOTIFICATION_EMAIL') return '';
        if (name === 'SENDER_EMAIL') return 'support@example.invalid';
        return 'configured';
      }
    })`),
    /Missing script configuration/,
  );
  assert.equal(
    harness.evaluate("protectSheetValue_('  =IMPORTXML(\"https://example.invalid\")')"),
    "'  =IMPORTXML(\"https://example.invalid\")",
  );
  assert.equal(
    harness.evaluate("safeEmailText_('subject\\r\\ninjection')"),
    'subject injection',
  );
});

test('contains no customer-email path, cache-only dedupe, or hardcoded private recipient', () => {
  assert.equal(appsScriptSource.includes('recipientEmail: lead.email'), false);
  assert.equal(appsScriptSource.includes('customerSubject'), false);
  assert.equal(appsScriptSource.includes('CacheService'), false);
  assert.equal(appsScriptSource.includes('syedmunsifali'), false);

  const readme = readFileSync(
    new URL('../google-apps-script/README.md', import.meta.url),
    'utf8',
  );
  const configuredProperties = [...readme.matchAll(/^\s*- \`([A-Z_]+)\`:/gm)]
    .map((match) => match[1]);
  assert.deepEqual(configuredProperties, [
    'SPREADSHEET_ID',
    'SHEET_NAME',
    'SENDER_EMAIL',
    'NOTIFICATION_EMAIL',
    'WEBHOOK_TOKEN',
    'BREVO_API_KEY',
  ]);
});
