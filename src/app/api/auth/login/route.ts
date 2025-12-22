import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
  getSystemPasswordHash,
} from "@/app/lib/auth";
import {
  isIpBlocked,
  registerFailedAttempt,
  resetIpAttempts,
} from "@/app/lib/ip-blocklist";

const BLOCKED_MESSAGE =
  "Too many failed attempts. Please try again after the block period ends.";

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
  const blockedStatus = isIpBlocked(ip);

  if (blockedStatus.blocked) {
    return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 429 });
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

  if (!hashedPassword) {
    return NextResponse.json(
      { error: "Password is required" },
      { status: 400 }
    );
  }

  let expectedHash: string;
  try {
    expectedHash = getSystemPasswordHash();
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Authentication is not configured on the server" },
      { status: 500 }
    );
  }

  if (hashedPassword !== expectedHash) {
    const { blocked, remainingAttempts } = registerFailedAttempt(ip);

    if (blocked) {
      return NextResponse.json({ error: BLOCKED_MESSAGE }, { status: 429 });
    }

    const attemptWord = remainingAttempts === 1 ? "attempt" : "attempts";
    return NextResponse.json(
      {
        error: `Invalid password. ${remainingAttempts} ${attemptWord} remaining.`,
      },
      { status: 401 }
    );
  }

  resetIpAttempts(ip);
  const sessionToken = createSessionToken();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE_NAME,
    sessionToken,
    getSessionCookieOptions()
  );

  return response;
}
