import { randomBytes } from "node:crypto";

const MAX_FAILED_ATTEMPTS = 5;
const CAPTCHA_AFTER_ATTEMPTS = 3;
const BASE_COOLDOWN_MS = 1000 * 5; // 5 seconds
const MAX_COOLDOWN_MS = 1000 * 60 * 10; // 10 minutes
const BLOCK_DURATION_MS = 1000 * 60 * 60 * 12; // 12 hours
export const LOGIN_SESSION_COOKIE_NAME = "login_session";
export const LOGIN_SESSION_TTL_MS = 1000 * 60 * 15; // 15 minutes

type AttemptRecord = {
  count: number;
  blockedUntil: number | null;
  cooldownUntil: number | null;
  captchaPrompt: string | null;
  captchaAnswer: string | null;
};

type LoginSessionRecord = {
  ip: string;
  expiresAt: number;
};

const attemptStore = new Map<string, AttemptRecord>();
const loginSessionStore = new Map<string, LoginSessionRecord>();

function now() {
  return Date.now();
}

function getOrCreateRecord(ip: string): AttemptRecord {
  const existing = attemptStore.get(ip);
  if (existing) {
    if (existing.blockedUntil && existing.blockedUntil <= now()) {
      existing.blockedUntil = null;
    }
    if (existing.cooldownUntil && existing.cooldownUntil <= now()) {
      existing.cooldownUntil = null;
    }
    if (existing.count < CAPTCHA_AFTER_ATTEMPTS) {
      existing.captchaPrompt = null;
      existing.captchaAnswer = null;
    }
    return existing;
  }

  const initialRecord: AttemptRecord = {
    count: 0,
    blockedUntil: null,
    cooldownUntil: null,
    captchaPrompt: null,
    captchaAnswer: null,
  };
  attemptStore.set(ip, initialRecord);
  return initialRecord;
}

function getRemainingCooldown(cooldownUntil: number | null): number {
  if (!cooldownUntil) {
    return 0;
  }
  return Math.max(0, cooldownUntil - now());
}

function getRemainingBlockTime(blockedUntil: number | null): number {
  if (!blockedUntil) {
    return 0;
  }
  return Math.max(0, blockedUntil - now());
}

function generateCaptchaChallenge() {
  const left = Math.floor(Math.random() * 9) + 1;
  const right = Math.floor(Math.random() * 9) + 1;
  return {
    prompt: `CAPTCHA: What is ${left} + ${right}?`,
    answer: String(left + right),
  };
}

function getCooldownDurationMs(attemptCount: number): number {
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** exponent);
}

export function isIpBlocked(ip: string): {
  blocked: boolean;
  blockedUntil: number | null;
} {
  const record = getOrCreateRecord(ip);
  const remainingBlockMs = getRemainingBlockTime(record.blockedUntil);
  if (remainingBlockMs > 0) {
    return { blocked: true, blockedUntil: record.blockedUntil };
  }
  return { blocked: false, blockedUntil: null };
}

export function getIpAttemptState(ip: string): {
  blocked: boolean;
  blockedUntil: number | null;
  blockRetryAfterMs: number;
  coolingDown: boolean;
  cooldownUntil: number | null;
  cooldownRetryAfterMs: number;
  captchaRequired: boolean;
  captchaPrompt: string | null;
} {
  const record = getOrCreateRecord(ip);
  const blockRetryAfterMs = getRemainingBlockTime(record.blockedUntil);
  const cooldownRetryAfterMs = getRemainingCooldown(record.cooldownUntil);

  return {
    blocked: blockRetryAfterMs > 0,
    blockedUntil: blockRetryAfterMs > 0 ? record.blockedUntil : null,
    blockRetryAfterMs,
    coolingDown: cooldownRetryAfterMs > 0,
    cooldownUntil: cooldownRetryAfterMs > 0 ? record.cooldownUntil : null,
    cooldownRetryAfterMs,
    captchaRequired: record.count >= CAPTCHA_AFTER_ATTEMPTS,
    captchaPrompt: record.count >= CAPTCHA_AFTER_ATTEMPTS ? record.captchaPrompt : null,
  };
}

export function validateCaptchaAnswer(ip: string, answer: string): boolean {
  const record = getOrCreateRecord(ip);
  if (record.count < CAPTCHA_AFTER_ATTEMPTS) {
    return true;
  }

  if (!record.captchaAnswer) {
    return false;
  }

  return record.captchaAnswer === answer.trim();
}

export function getCaptchaPrompt(ip: string): string | null {
  const record = getOrCreateRecord(ip);
  if (record.count < CAPTCHA_AFTER_ATTEMPTS) {
    return null;
  }
  return record.captchaPrompt;
}

export function createLoginSession(ip: string): string {
  const token = randomBytes(32).toString("hex");
  loginSessionStore.set(token, {
    ip,
    expiresAt: now() + LOGIN_SESSION_TTL_MS,
  });
  return token;
}

export function hasValidLoginSession(ip: string, token?: string | null): boolean {
  if (!token) {
    return false;
  }
  const session = loginSessionStore.get(token);
  if (!session) {
    return false;
  }
  if (session.expiresAt <= now()) {
    loginSessionStore.delete(token);
    return false;
  }
  return session.ip === ip;
}

export function clearLoginSession(token?: string | null): void {
  if (!token) {
    return;
  }
  loginSessionStore.delete(token);
}

export function getBlockedMessage(retryAfterMs: number): string {
  if (retryAfterMs <= 0) {
    return "Too many failed attempts. Please try again after the block period ends.";
  }
  const retrySeconds = Math.ceil(retryAfterMs / 1000);
  return `Too many failed attempts. Please try again in ${retrySeconds} seconds.`;
}

export function getCooldownMessage(retryAfterMs: number): string {
  const retrySeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `Please wait ${retrySeconds} seconds before trying again.`;
}

export function registerFailedAttempt(ip: string): {
  blocked: boolean;
  remainingAttempts: number;
  blockedUntil: number | null;
  cooldownUntil: number | null;
  cooldownRetryAfterMs: number;
  captchaRequired: boolean;
  captchaPrompt: string | null;
} {
  const record = getOrCreateRecord(ip);

  const blockRetryAfterMs = getRemainingBlockTime(record.blockedUntil);
  if (blockRetryAfterMs > 0) {
    return {
      blocked: true,
      remainingAttempts: 0,
      blockedUntil: record.blockedUntil,
      cooldownUntil: null,
      cooldownRetryAfterMs: 0,
      captchaRequired: record.count >= CAPTCHA_AFTER_ATTEMPTS,
      captchaPrompt: record.captchaPrompt,
    };
  }

  const cooldownRetryAfterMs = getRemainingCooldown(record.cooldownUntil);
  if (cooldownRetryAfterMs > 0) {
    return {
      blocked: false,
      remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - record.count),
      blockedUntil: null,
      cooldownUntil: record.cooldownUntil,
      cooldownRetryAfterMs,
      captchaRequired: record.count >= CAPTCHA_AFTER_ATTEMPTS,
      captchaPrompt: record.captchaPrompt,
    };
  }

  record.count += 1;

  if (record.count >= CAPTCHA_AFTER_ATTEMPTS && !record.captchaPrompt) {
    const captcha = generateCaptchaChallenge();
    record.captchaPrompt = captcha.prompt;
    record.captchaAnswer = captcha.answer;
  }

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.blockedUntil = now() + BLOCK_DURATION_MS;
    record.cooldownUntil = null;
    record.count = 0;
    record.captchaPrompt = null;
    record.captchaAnswer = null;
    attemptStore.set(ip, record);
    return {
      blocked: true,
      remainingAttempts: 0,
      blockedUntil: record.blockedUntil,
      cooldownUntil: null,
      cooldownRetryAfterMs: 0,
      captchaRequired: false,
      captchaPrompt: null,
    };
  }

  const cooldownMs = getCooldownDurationMs(record.count);
  record.cooldownUntil = now() + cooldownMs;
  attemptStore.set(ip, record);
  return {
    blocked: false,
    remainingAttempts: MAX_FAILED_ATTEMPTS - record.count,
    blockedUntil: null,
    cooldownUntil: record.cooldownUntil,
    cooldownRetryAfterMs: cooldownMs,
    captchaRequired: record.count >= CAPTCHA_AFTER_ATTEMPTS,
    captchaPrompt: record.captchaPrompt,
  };
}

export function resetIpAttempts(ip: string): void {
  attemptStore.delete(ip);
}
