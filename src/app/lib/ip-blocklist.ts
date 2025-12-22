const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 1000 * 60 * 60 * 12; // 12 hours

type AttemptRecord = {
  count: number;
  blockedUntil: number | null;
};

const attemptStore = new Map<string, AttemptRecord>();

function getOrCreateRecord(ip: string): AttemptRecord {
  const existing = attemptStore.get(ip);
  if (existing) {
    if (existing.blockedUntil && existing.blockedUntil <= Date.now()) {
      attemptStore.delete(ip);
      return { count: 0, blockedUntil: null };
    }
    return existing;
  }

  const initialRecord: AttemptRecord = { count: 0, blockedUntil: null };
  attemptStore.set(ip, initialRecord);
  return initialRecord;
}

export function isIpBlocked(ip: string): {
  blocked: boolean;
  blockedUntil: number | null;
} {
  const record = attemptStore.get(ip);
  if (!record) {
    return { blocked: false, blockedUntil: null };
  }

  if (record.blockedUntil && record.blockedUntil > Date.now()) {
    return { blocked: true, blockedUntil: record.blockedUntil };
  }

  if (record.blockedUntil && record.blockedUntil <= Date.now()) {
    attemptStore.delete(ip);
  }

  return { blocked: false, blockedUntil: null };
}

export function registerFailedAttempt(ip: string): {
  blocked: boolean;
  remainingAttempts: number;
  blockedUntil: number | null;
} {
  const record = getOrCreateRecord(ip);

  if (record.blockedUntil && record.blockedUntil > Date.now()) {
    return {
      blocked: true,
      remainingAttempts: 0,
      blockedUntil: record.blockedUntil,
    };
  }

  record.count += 1;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.blockedUntil = Date.now() + BLOCK_DURATION_MS;
    record.count = 0;
    attemptStore.set(ip, record);
    return {
      blocked: true,
      remainingAttempts: 0,
      blockedUntil: record.blockedUntil,
    };
  }

  attemptStore.set(ip, record);
  return {
    blocked: false,
    remainingAttempts: MAX_FAILED_ATTEMPTS - record.count,
    blockedUntil: null,
  };
}

export function resetIpAttempts(ip: string): void {
  attemptStore.delete(ip);
}
