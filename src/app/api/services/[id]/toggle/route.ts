import { NextResponse } from "next/server";
import { getServiceSettings } from "@/app/lib/settings";
import { requireSession } from "@/app/lib/session";
import {
  getProcessStatus,
  startServiceProcess,
  stopServiceProcess,
} from "@/app/lib/service-manager";
import { ServiceStatus } from "@/app/types";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(_: Request, context: RouteContext) {
  await requireSession();

  const { id: serviceId } = await context.params;
  const { services } = await getServiceSettings();
  const service = services.find((candidate) => candidate.id === serviceId);

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const isRunning = getProcessStatus(serviceId) === ServiceStatus.RUNNING;

  try {
    const result = isRunning
      ? await stopServiceProcess(serviceId)
      : await startServiceProcess(service);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Unable to toggle service" },
      { status: 500 }
    );
  }
}
