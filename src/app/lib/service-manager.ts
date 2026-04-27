import { access } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  ServiceStatus,
  type ServiceRuntime,
  type ServiceActionResult,
} from "../types";

const LOG_LIMIT = 2000;
const KILL_TIMEOUT_MS = 7000;

type ManagedProcess = {
  child: ChildProcess;
};

type ManagerStore = {
  processes: Map<string, ManagedProcess>;
  logs: Map<string, string[]>;
};

declare global {
  // eslint-disable-next-line no-var
  var __ISM_SERVICE_MANAGER__: ManagerStore | undefined;
}

const managerStore: ManagerStore = globalThis.__ISM_SERVICE_MANAGER__ ?? {
  processes: new Map(),
  logs: new Map(),
};

if (!globalThis.__ISM_SERVICE_MANAGER__) {
  globalThis.__ISM_SERVICE_MANAGER__ = managerStore;
}

function ensureLogBuffer(id: string): string[] {
  let buffer = managerStore.logs.get(id);
  if (!buffer) {
    buffer = [];
    managerStore.logs.set(id, buffer);
  }
  return buffer;
}

function appendLog(id: string, chunk: string) {
  const lines = chunk.toString().split(/\r?\n/);
  const buffer = ensureLogBuffer(id);
  for (const line of lines) {
    if (!line.length) {
      continue;
    }
    buffer.push(`[${new Date().toISOString()}] ${line}`);
  }
  while (buffer.length > LOG_LIMIT) {
    buffer.shift();
  }
}

async function ensureEntryPointExists(entryPoint: string, serviceName: string) {
  try {
    await access(entryPoint);
  } catch {
    throw new Error(
      `Entry point for ${serviceName} not found at ${entryPoint}`,
    );
  }
}

function normalizeNodeVersion(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) {
    throw new Error(
      "nodeVersion is required and must be an explicit version (e.g. 22.13.0)",
    );
  }
  if (trimmed.startsWith("v")) {
    return trimmed;
  }
  if (/^\d+\.\d+\.\d+$/.test(trimmed)) {
    return `v${trimmed}`;
  }
  throw new Error(
    `Invalid nodeVersion \"${version}\". Use an explicit version like 22.13.0`,
  );
}

async function resolveNodeExecutable(
  nvmPath: string,
  configuredVersion: string,
): Promise<string> {
  const normalizedVersion = normalizeNodeVersion(configuredVersion);
  const candidates =
    process.platform === "win32"
      ? [
          path.join(nvmPath, normalizedVersion, "node.exe"),
          path.join(nvmPath, normalizedVersion, "node"),
        ]
      : [
          path.join(
            nvmPath,
            "versions",
            "node",
            normalizedVersion,
            "bin",
            "node",
          ),
        ];

  for (const executablePath of candidates) {
    try {
      await access(executablePath);
      return executablePath;
    } catch {
      continue;
    }
  }

  throw new Error(
    `Node executable not found for version \"${configuredVersion}\" in nvm path \"${nvmPath}\"`,
  );
}

export function getProcessStatus(id: string): ServiceStatus {
  return managerStore.processes.has(id)
    ? ServiceStatus.RUNNING
    : ServiceStatus.STOPPED;
}

export function getProcessLogs(id: string): string[] {
  return [...(managerStore.logs.get(id) ?? [])];
}

export async function startServiceProcess(
  service: ServiceRuntime,
  nvmPath: string,
): Promise<ServiceActionResult> {
  if (managerStore.processes.has(service.id)) {
    return {
      status: ServiceStatus.RUNNING,
      message: `${service.name} is already running.`,
    };
  }

  await ensureEntryPointExists(service.entryPoint, service.name);
  const nodeExecutable = await resolveNodeExecutable(
    nvmPath,
    service.nodeVersion,
  );

  const child = spawn(nodeExecutable, [service.entryPoint, ...service.argv], {
    cwd: service.rootDir,
    env: {
      ...process.env,
      SERVICE_NAME: service.name,
      SERVICE_MODE: service.mode,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  managerStore.processes.set(service.id, { child });
  appendLog(service.id, `Launching process: ${service.entryPoint}`);

  child.stdout.on("data", (data: Buffer) =>
    appendLog(service.id, data.toString()),
  );
  child.stderr.on("data", (data: Buffer) =>
    appendLog(service.id, data.toString()),
  );

  child.on("exit", (code, signal) => {
    appendLog(
      service.id,
      `Process exited with code ${code ?? "null"} signal ${signal ?? "null"}`,
    );
    managerStore.processes.delete(service.id);
  });

  child.on("error", (error) => {
    appendLog(service.id, `Process error: ${error.message}`);
    managerStore.processes.delete(service.id);
  });

  return {
    status: ServiceStatus.RUNNING,
    message: `Started ${service.name}`,
  };
}

export async function stopServiceProcess(
  id: string,
): Promise<ServiceActionResult> {
  const record = managerStore.processes.get(id);
  if (!record) {
    return {
      status: ServiceStatus.STOPPED,
      message: "Process is not running.",
    };
  }

  const { child } = record;

  return new Promise((resolve) => {
    let settled = false;

    const settle = (message: string) => {
      if (settled) return;
      settled = true;
      managerStore.processes.delete(id);
      resolve({ status: ServiceStatus.STOPPED, message });
    };

    const killTimeout = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }, KILL_TIMEOUT_MS);

    const clear = () => {
      clearTimeout(killTimeout);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      appendLog(
        id,
        `Process stopped with code ${code ?? "null"} signal ${signal ?? "null"}`,
      );
      clear();
      settle("Process stopped");
    };

    const onError = (error: Error) => {
      appendLog(id, `Process error while stopping: ${error.message}`);
      clear();
      settle(`Process error: ${error.message}`);
    };

    child.once("exit", onExit);
    child.once("error", onError);

    const signalled = child.kill("SIGTERM");
    if (!signalled) {
      appendLog(
        id,
        "Unable to deliver SIGTERM; process may have already exited.",
      );
      clear();
      settle("Unable to signal process");
    }
  });
}
