import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./auth";
import type { SessionPayload } from "./auth";

export async function getSessionTokenFromCookies(): Promise<
  string | undefined
> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = await getSessionTokenFromCookies();
  return verifySessionToken(token);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function redirectIfAuthenticated(
  destination = "/"
): Promise<void> {
  const session = await getSession();
  if (session) {
    redirect(destination);
  }
}
