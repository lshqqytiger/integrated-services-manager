import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  isSha512Hex,
  verifySystemPasswordHash,
} from "@/app/lib/auth";
import {
  LOGIN_SESSION_COOKIE_NAME,
  clearLoginSession,
  getBlockedMessage,
  getCooldownMessage,
  getIpAttemptState,
  hasValidLoginSession,
  registerFailedAttempt,
  resetIpAttempts,
  validateCaptchaAnswer,
} from "@/app/lib/ip-blocklist";

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [ip] = forwarded.split(",");
    if (ip) {
      return ip.trim();
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "0.0.0.0";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const loginSessionToken = request.cookies.get(LOGIN_SESSION_COOKIE_NAME)?.value;
  if (!hasValidLoginSession(ip, loginSessionToken)) {
    return NextResponse.json(
      {
        error:
          "Login session is missing or expired. Reload the page and try again.",
        requiresLoginSession: true,
      },
      { status: 401 }
    );
  }

  const attemptState = getIpAttemptState(ip);
  if (attemptState.blocked) {
    return NextResponse.json(
      {
        error: getBlockedMessage(attemptState.blockRetryAfterMs),
      },
      { status: 429 }
    );
  }
  if (attemptState.coolingDown) {
    return NextResponse.json(
      {
        error: getCooldownMessage(attemptState.cooldownRetryAfterMs),
        retryAfterMs: attemptState.cooldownRetryAfterMs,
      },
      { status: 429 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const hashedPassword =
    typeof payload === "object" &&
    payload !== null &&
    "hashedPassword" in payload
      ? String((payload as Record<string, unknown>).hashedPassword || "").trim()
      : "";
  const captchaAnswer =
    typeof payload === "object" &&
    payload !== null &&
    "captchaAnswer" in payload
      ? String((payload as Record<string, unknown>).captchaAnswer || "").trim()
      : "";

  if (!hashedPassword) {
    return NextResponse.json(
      { error: "Password is required" },
      { status: 400 }
    );
  }

  if (!isSha512Hex(hashedPassword)) {
    return NextResponse.json(
      { error: "Password format is invalid" },
      { status: 400 }
    );
  }

  if (attemptState.captchaRequired && !validateCaptchaAnswer(ip, captchaAnswer)) {
    return NextResponse.json(
      {
        error: "CAPTCHA answer is required or invalid.",
        captchaPrompt: attemptState.captchaPrompt,
      },
      { status: 400 }
    );
  }

  let isPasswordMatch = false;
  try {
    isPasswordMatch = verifySystemPasswordHash(hashedPassword);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Authentication is not configured on the server" },
      { status: 500 }
    );
  }

  if (!isPasswordMatch) {
    const { blocked, remainingAttempts } = registerFailedAttempt(ip);
    const failedAttemptState = getIpAttemptState(ip);

    if (blocked) {
      return NextResponse.json(
        { error: getBlockedMessage(failedAttemptState.blockRetryAfterMs) },
        { status: 429 }
      );
    }

    const attemptWord = remainingAttempts === 1 ? "attempt" : "attempts";
    return NextResponse.json(
      {
        error: `Invalid password. ${remainingAttempts} ${attemptWord} remaining.`,
        retryAfterMs: failedAttemptState.cooldownRetryAfterMs,
        captchaPrompt: failedAttemptState.captchaPrompt,
      },
      { status: 401 }
    );
  }

  clearLoginSession(loginSessionToken);
  resetIpAttempts(ip);
  const sessionToken = createSessionToken();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE_NAME,
    sessionToken,
    getSessionCookieOptions()
  );
  response.cookies.set(LOGIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
