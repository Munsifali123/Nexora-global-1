import { randomUUID } from 'node:crypto';
import { validateCanonicalLead, validateLeadId } from './leadNotificationSchema.mjs';

const ALLOWED_ERROR_CODES = new Set([
  'network_error',
  'upstream_http_error',
  'invalid_acknowledgement',
  'canonical_lead_unavailable',
  'delivery_failed',
]);

export class NotificationQueueError extends Error {
  constructor(code) {
    super('Lead notification queue operation failed.');
    this.name = 'NotificationQueueError';
    this.code = code;
  }
}

function retryErrorCode(error) {
  return ALLOWED_ERROR_CODES.has(error?.code) ? error.code : 'delivery_failed';
}

export function retryDelayMs(attemptCount, baseRetryMs, maxRetryMs) {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 20));
  return Math.min(maxRetryMs, baseRetryMs * (2 ** exponent));
}

export function createNotificationQueue({
  store,
  deliver,
  now = () => new Date(),
  leaseIdFactory = randomUUID,
  leaseMs = 60_000,
  baseRetryMs = 30_000,
  maxRetryMs = 6 * 60 * 60 * 1000,
  pollMs = 30_000,
  batchSize = 10,
  logger = console,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
} = {}) {
  if (!store || typeof deliver !== 'function') throw new Error('Queue dependencies are required.');
  let activeDrain = null;
  let interval = null;
  let stopped = false;

  async function enqueue(leadId) {
    validateLeadId(leadId);
    let canonical;
    try {
      canonical = await store.getCanonicalLead(leadId);
    } catch {
      throw new NotificationQueueError('storage_unavailable');
    }
    if (!canonical) throw new NotificationQueueError('lead_not_found');
    try {
      validateCanonicalLead(leadId, canonical);
    } catch {
      throw new NotificationQueueError('lead_invalid');
    }
    try {
      await store.enqueue(leadId, now());
    } catch {
      throw new NotificationQueueError('storage_unavailable');
    }
    kick();
  }

  async function deliverClaim(claim) {
    let errorCode;
    try {
      const canonical = await store.getCanonicalLead(claim.leadId);
      if (!canonical) throw Object.assign(new Error(), { code: 'canonical_lead_unavailable' });
      const lead = validateCanonicalLead(claim.leadId, canonical);
      await deliver(lead);
      await store.markDelivered(claim, now());
      return;
    } catch (error) {
      errorCode = retryErrorCode(error);
    }

    const retryNow = now();
    const dueAt = new Date(
      retryNow.getTime() + retryDelayMs(claim.attemptCount, baseRetryMs, maxRetryMs),
    );
    try {
      await store.scheduleRetry(claim, { dueAt, errorCode, now: retryNow });
    } catch {
      // The active lease expires and makes the job claimable again after a
      // process restart; logging details or lead identifiers is unnecessary.
      logger.warn?.('Lead notification retry scheduling was deferred.');
    }
  }

  async function performDrain() {
    while (!stopped) {
      let claims;
      try {
        claims = await store.claimDue({
          now: now(),
          leaseMs,
          limit: batchSize,
          leaseIdFactory,
        });
      } catch {
        logger.warn?.('Lead notification queue is temporarily unavailable.');
        return;
      }
      if (claims.length === 0) return;
      await Promise.all(claims.map(deliverClaim));
    }
  }

  function drain() {
    if (stopped) return Promise.resolve();
    if (!activeDrain) {
      activeDrain = performDrain().finally(() => {
        activeDrain = null;
      });
    }
    return activeDrain;
  }

  function kick() {
    if (stopped) return;
    queueMicrotask(() => void drain());
  }

  function start() {
    if (interval || stopped) return;
    void drain();
    interval = setIntervalImpl(() => void drain(), pollMs);
    interval?.unref?.();
  }

  function stop() {
    stopped = true;
    if (interval) clearIntervalImpl(interval);
    interval = null;
  }

  return { enqueue, drain, kick, start, stop };
}
