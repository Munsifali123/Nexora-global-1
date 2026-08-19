const JOB_FIELDS = new Set([
  'leadId',
  'state',
  'attempts',
  'dueAt',
  'createdAt',
  'leaseId',
  'leaseUntil',
  'lastErrorCode',
  'updatedAt',
  'deliveredAt',
]);
const JOB_ERROR_CODES = new Set([
  'network_error', 'upstream_http_error', 'invalid_acknowledgement',
  'canonical_lead_unavailable', 'delivery_failed',
]);

function asMillis(value) {
  if (!value) return Number.NaN;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return Number.NaN;
}

export function validateStoredNotificationJob(job, expectedLeadId) {
  if (!job || Object.prototype.toString.call(job) !== '[object Object]') {
    throw new Error('Invalid notification job.');
  }
  const keys = Object.keys(job);
  if (
    !keys.every((key) => JOB_FIELDS.has(key))
    || !['leadId', 'state', 'attempts', 'dueAt', 'createdAt'].every((key) => keys.includes(key))
    || job.leadId !== expectedLeadId
    || !['pending', 'delivered'].includes(job.state)
    || !Number.isSafeInteger(job.attempts)
    || job.attempts < 0
    || !Number.isFinite(asMillis(job.createdAt))
  ) {
    throw new Error('Invalid notification job.');
  }

  const leaseId = job.leaseId;
  const leaseUntil = job.leaseUntil;
  const hasLeaseId = typeof leaseId === 'string' && leaseId.length > 0 && leaseId.length <= 128;
  const hasLeaseUntil = Number.isFinite(asMillis(leaseUntil));
  if (
    ![undefined, null].includes(leaseId) && !hasLeaseId
    || ![undefined, null].includes(leaseUntil) && !hasLeaseUntil
    || hasLeaseId !== hasLeaseUntil
    || job.updatedAt !== undefined && !Number.isFinite(asMillis(job.updatedAt))
    || job.lastErrorCode !== undefined
      && job.lastErrorCode !== null
      && !JOB_ERROR_CODES.has(job.lastErrorCode)
  ) {
    throw new Error('Invalid notification job.');
  }

  if (job.state === 'pending') {
    if (!Number.isFinite(asMillis(job.dueAt)) || ![undefined, null].includes(job.deliveredAt)) {
      throw new Error('Invalid notification job.');
    }
  } else if (
    job.dueAt !== null
    || !Number.isFinite(asMillis(job.deliveredAt))
    || hasLeaseId
    || hasLeaseUntil
    || job.lastErrorCode !== null
  ) {
    throw new Error('Invalid notification job.');
  }
  return job;
}

export function createFirebaseNotificationStore({ db, Timestamp, onlyLeadId = null }) {
  const jobs = db.collection('leadNotificationJobs');
  const inquiries = db.collection('inquiries');

  return {
    async getCanonicalLead(leadId) {
      const snapshot = await inquiries.doc(leadId).get();
      return snapshot.exists ? snapshot.data() : null;
    },

    async enqueue(leadId, now) {
      const jobRef = jobs.doc(leadId);
      const timestamp = Timestamp.fromDate(now);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (snapshot.exists) {
          const existing = validateStoredNotificationJob(snapshot.data(), leadId);
          return existing.state;
        }
        transaction.create(jobRef, {
          leadId,
          state: 'pending',
          attempts: 0,
          dueAt: timestamp,
          leaseId: null,
          leaseUntil: null,
          lastErrorCode: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          deliveredAt: null,
        });
        return 'pending';
      });
    },

    async claimDue({ now, leaseMs, limit, leaseIdFactory }) {
      const nowTimestamp = Timestamp.fromDate(now);
      const candidates = onlyLeadId
        ? [await jobs.doc(onlyLeadId).get()]
        : (await jobs
          .where('dueAt', '<=', nowTimestamp)
          .orderBy('dueAt')
          .limit(Math.max(limit * 4, limit))
          .get()).docs;
      const claimed = [];

      for (const candidate of candidates) {
        if (claimed.length >= limit) break;
        if (!candidate.exists) continue;
        const claim = await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(candidate.ref);
          if (!snapshot.exists) return null;
          const job = snapshot.data();
          try {
            validateStoredNotificationJob(job, candidate.id);
          } catch {
            return null;
          }
          if (job.state !== 'pending' || asMillis(job.dueAt) > now.getTime()) return null;
          if (job.leaseUntil && asMillis(job.leaseUntil) > now.getTime()) return null;

          const leaseId = leaseIdFactory();
          const leaseUntil = new Date(now.getTime() + leaseMs);
          const attemptCount = Number.isSafeInteger(job.attempts) ? job.attempts + 1 : 1;
          transaction.update(candidate.ref, {
            attempts: attemptCount,
            leaseId,
            leaseUntil: Timestamp.fromDate(leaseUntil),
            dueAt: Timestamp.fromDate(leaseUntil),
            updatedAt: nowTimestamp,
          });
          return { leadId: job.leadId, leaseId, attemptCount };
        });
        if (claim) claimed.push(claim);
      }

      return claimed;
    },

    async markDelivered(claim, now) {
      const jobRef = jobs.doc(claim.leadId);
      const timestamp = Timestamp.fromDate(now);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) return false;
        const job = snapshot.data();
        if (job.state !== 'pending' || job.leaseId !== claim.leaseId) return false;
        transaction.update(jobRef, {
          state: 'delivered',
          dueAt: null,
          leaseId: null,
          leaseUntil: null,
          lastErrorCode: null,
          deliveredAt: timestamp,
          updatedAt: timestamp,
        });
        return true;
      });
    },

    async scheduleRetry(claim, { dueAt, errorCode, now }) {
      const jobRef = jobs.doc(claim.leadId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(jobRef);
        if (!snapshot.exists) return false;
        const job = snapshot.data();
        if (job.state !== 'pending' || job.leaseId !== claim.leaseId) return false;
        transaction.update(jobRef, {
          dueAt: Timestamp.fromDate(dueAt),
          leaseId: null,
          leaseUntil: null,
          lastErrorCode: errorCode,
          updatedAt: Timestamp.fromDate(now),
        });
        return true;
      });
    },
  };
}
