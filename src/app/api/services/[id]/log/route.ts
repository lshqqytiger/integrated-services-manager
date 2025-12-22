import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/app/lib/session";
import { getServiceSettings } from "@/app/lib/settings";
import { getProcessLogs } from "@/app/lib/service-manager";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  await requireSession();

  const { id: serviceId } = await context.params;
  const { services } = await getServiceSettings();
  const service = services.find((candidate) => candidate.id === serviceId);

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const logs = getProcessLogs(serviceId);
  const cacheHeaders = {
    "Cache-Control": "no-store",
  };

  if (request.nextUrl.searchParams.get("format") === "plain") {
    const body = logs.length ? logs.join("\n") : "No logs captured yet.";
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        ...cacheHeaders,
      },
    });
  }

  return NextResponse.json(
    { id: serviceId, log: logs },
    {
      headers: cacheHeaders,
    }
  );
}
