import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/lib/session";
import { getServiceSettings } from "@/app/lib/settings";
import { writeProcessInput } from "@/app/lib/service-manager";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface StdinPayload {
  input?: unknown;
}

export async function POST(request: NextRequest, context: RouteContext) {
  await requireSession();

  const { id: serviceId } = await context.params;
  const { services } = await getServiceSettings();
  const service = services.find((candidate) => candidate.id === serviceId);

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  let payload: StdinPayload;
  try {
    payload = (await request.json()) as StdinPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  if (typeof payload.input !== "string") {
    return NextResponse.json(
      { error: "Input must be a string" },
      { status: 400 },
    );
  }

  const result = writeProcessInput(serviceId, payload.input);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Unable to send input" },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { message: "Input sent" },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
