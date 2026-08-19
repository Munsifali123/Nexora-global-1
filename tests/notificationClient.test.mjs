import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInquiryWithNotificationJob,
  sendLeadNotification,
} from '../src/leadNotification.js';

function createFirestoreFixture() {
  const database = { name: 'test-database' };
  const timestamp = { type: 'server-timestamp' };
  const writes = [];
  let committed = false;

  const firestore = {
    collection(receivedDatabase, name) {
      assert.equal(receivedDatabase, database);
      assert.equal(name, 'inquiries');
      return { path: name };
    },
    doc(...args) {
      if (args.length === 1) {
        assert.deepEqual(args[0], { path: 'inquiries' });
        return { id: 'AtomicLead123', path: 'inquiries/AtomicLead123' };
      }
      assert.deepEqual(args, [database, 'leadNotificationJobs', 'AtomicLead123']);
      return { id: 'AtomicLead123', path: 'leadNotificationJobs/AtomicLead123' };
    },
    serverTimestamp() {
      return timestamp;
    },
    writeBatch(receivedDatabase) {
      assert.equal(receivedDatabase, database);
      return {
        set(reference, data) {
          writes.push({ reference, data });
        },
        async commit() {
          committed = true;
        },
      };
    },
  };

  return {
    database,
    firestore,
    timestamp,
    writes,
    wasCommitted: () => committed,
  };
}

test('creates an inquiry and its PII-free notification job in one batch', async () => {
  const fixture = createFirestoreFixture();
  const inquiry = {
    name: 'Synthetic Fixture',
    email: 'fixture@example.invalid',
    address: 'Not a production address',
    createdAt: 'must be replaced by a server timestamp',
  };

  const inquiryRef = await createInquiryWithNotificationJob(
    fixture.database,
    inquiry,
    fixture.firestore,
  );

  assert.equal(fixture.wasCommitted(), true);
  assert.deepEqual(inquiryRef, {
    id: 'AtomicLead123',
    path: 'inquiries/AtomicLead123',
  });
  assert.equal(fixture.writes.length, 2);
  assert.deepEqual(fixture.writes[0], {
    reference: inquiryRef,
    data: {
      ...inquiry,
      createdAt: fixture.timestamp,
    },
  });
  assert.deepEqual(fixture.writes[1], {
    reference: {
      id: 'AtomicLead123',
      path: 'leadNotificationJobs/AtomicLead123',
    },
    data: {
      leadId: 'AtomicLead123',
      state: 'pending',
      attempts: 0,
      dueAt: fixture.timestamp,
      createdAt: fixture.timestamp,
    },
  });
  assert.deepEqual(Object.keys(fixture.writes[1].data).sort(), [
    'attempts',
    'createdAt',
    'dueAt',
    'leadId',
    'state',
  ]);
});

test('the accelerator sends only the lead ID to the same-origin endpoint', async () => {
  let captured;
  const response = await sendLeadNotification('AtomicLead123', {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return Response.json({ ok: true });
    },
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(captured.url, '/api/lead-notification');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(captured.options.body), { leadId: 'AtomicLead123' });
  assert.deepEqual(Object.keys(JSON.parse(captured.options.body)), ['leadId']);
});

test('the accelerator rejects an invalid lead ID before making a request', async () => {
  let called = false;
  await assert.rejects(
    sendLeadNotification('', {
      fetchImpl: async () => {
        called = true;
        return Response.json({ ok: true });
      },
    }),
    /valid lead ID/,
  );
  assert.equal(called, false);
});
