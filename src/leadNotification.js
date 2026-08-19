const NOTIFICATION_ENDPOINT = '/api/lead-notification';

export async function createInquiryWithNotificationJob(db, leadData, firestoreImpl) {
  const firestore = firestoreImpl || await import('firebase/firestore');
  const inquiryRef = firestore.doc(firestore.collection(db, 'inquiries'));
  const notificationJobRef = firestore.doc(db, 'leadNotificationJobs', inquiryRef.id);
  const createdAt = firestore.serverTimestamp();
  const batch = firestore.writeBatch(db);

  batch.set(inquiryRef, {
    ...leadData,
    createdAt,
  });
  batch.set(notificationJobRef, {
    leadId: inquiryRef.id,
    state: 'pending',
    attempts: 0,
    dueAt: createdAt,
    createdAt,
  });
  await batch.commit();

  return inquiryRef;
}

export async function sendLeadNotification(leadId, { fetchImpl = fetch } = {}) {
  if (typeof leadId !== 'string' || !leadId || leadId.length > 128) {
    throw new TypeError('A valid lead ID is required.');
  }

  const response = await fetchImpl(NOTIFICATION_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leadId }),
    keepalive: true,
  });

  if (!response.ok) throw new Error('Lead notification could not be delivered.');
  return response.json();
}
