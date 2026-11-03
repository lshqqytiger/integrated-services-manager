import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE_NAME = "session_token";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
export const MIN_PASSWORD_LENGTH = 12;
const TOKEN_VERSION = "v1";
const NONCE_REGEX = /^[0-9a-f]{64}$/;
const SHA512_HEX_REGEX = /^[0-9a-f]{128}$/;

declare global {
  // eslint-disable-next-line no-var
  var __ISM_RUNTIME_SECRET__: string | undefined;
}

const RUNTIME_SECRET =
  globalThis.__ISM_RUNTIME_SECRET__ ?? randomBytes(32).toString("hex");
globalThis.__ISM_RUNTIME_SECRET__ = RUNTIME_SECRET;

const systemPassword = process.env.SYSTEM_PASSWORD;
const systemPasswordHash = systemPassword
  ? createHash("sha512").update(systemPassword, "utf8").digest("hex")
  : null;

export interface SessionPayload {
  version: string;
  issuedAt: number;
  nonce: string;
}

function ensureSystemPasswordHash(): string {
  if (!systemPassword || !systemPasswordHash) {
    throw new Error(
      "SYSTEM_PASSWORD is not configured. Set it in the environment."
    );
  }
  if (!isStrongPassword(systemPassword)) {
    throw new Error(
      `SYSTEM_PASSWORD does not meet minimum security requirements (length >= ${MIN_PASSWORD_LENGTH}, upper/lowercase letters, number, symbol).`
    );
  }
  return systemPasswordHash;
}

export function getSystemPasswordHash(): string {
  return ensureSystemPasswordHash();
}

function getSigningSecret(): Buffer {
  const baseHash = ensureSystemPasswordHash();
  return Buffer.from(`${baseHash}:${RUNTIME_SECRET}`, "utf8");
}

function signPayload(payload: string): string {
  return createHmac("sha512", getSigningSecret()).update(payload).digest("hex");
}

function safeEqual(expectedHex: string, providedHex: string): boolean {
  try {
    const expectedBuffer = Buffer.from(expectedHex, "hex");
    const providedBuffer = Buffer.from(providedHex, "hex");

    if (
      expectedBuffer.length === 0 ||
      expectedBuffer.length !== providedBuffer.length
    ) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}

export function isStrongPassword(password: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return false;
  }
  return (
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function isSha512Hex(value: string): boolean {
  return SHA512_HEX_REGEX.test(value);
}

export function verifySystemPasswordHash(hashedPassword: string): boolean {
  if (!isSha512Hex(hashedPassword)) {
    return false;
  }
  return safeEqual(ensureSystemPasswordHash(), hashedPassword);
}

export function createSessionToken(): string {
  const issuedAt = Date.now();
  const nonce = randomBytes(32).toString("hex");
  const payload = `${TOKEN_VERSION}:${issuedAt}:${nonce}`;
  const signature = signPayload(payload);
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(
  token?: string | null
): SessionPayload | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSignature = signPayload(payload);
  if (!safeEqual(expectedSignature, providedSignature)) {
    return null;
  }

  const segments = payload.split(":");
  if (segments.length !== 3) {
    return null;
  }

  const [version, issuedAtRaw, nonce] = segments;
  const issuedAt = Number(issuedAtRaw);

  if (version !== TOKEN_VERSION || !Number.isFinite(issuedAt) || !nonce) {
    return null;
  }

  if (!NONCE_REGEX.test(nonce)) {
    return null;
  }

  const now = Date.now();
  if (issuedAt > now || now - issuedAt > SESSION_TTL_MS) {
    return null;
  }

  return { version, issuedAt, nonce };
}

export function validateSessionToken(token?: string | null): boolean {
  return verifySessionToken(token) !== null;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}
