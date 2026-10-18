import { NextRequest, NextResponse } from "next/server";
import {
  LOGIN_SESSION_COOKIE_NAME,
  LOGIN_SESSION_TTL_MS,
  createLoginSession,
  getBlockedMessage,
  getCooldownMessage,
  getIpAttemptState,
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
  const loginSessionToken = createLoginSession(ip);
  const attemptState = getIpAttemptState(ip);
  const response = NextResponse.json({
    ok: true,
    captchaPrompt: attemptState.captchaPrompt,
    blockedMessage: attemptState.blocked
      ? getBlockedMessage(attemptState.blockRetryAfterMs)
      : null,
    cooldownMessage: attemptState.coolingDown
      ? getCooldownMessage(attemptState.cooldownRetryAfterMs)
      : null,
  });

  response.cookies.set(LOGIN_SESSION_COOKIE_NAME, loginSessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(LOGIN_SESSION_TTL_MS / 1000),
  });
  return response;
}
