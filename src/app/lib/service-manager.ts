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

async function ensureWorkingDirectoryExists(root: string, serviceName: string) {
  try {
    await access(root);
  } catch {
    throw new Error(
      `Working directory for ${serviceName} not found at ${root}`,
    );
  }
}

async function ensureExecutableIfAbsolute(
  executable: string,
  serviceName: string,
) {
  if (!path.isAbsolute(executable)) {
    return;
  }
  try {
    await access(executable);
  } catch {
    throw new Error(`Executable for ${serviceName} not found at ${executable}`);
  }
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
): Promise<ServiceActionResult> {
  if (managerStore.processes.has(service.id)) {
    return {
      status: ServiceStatus.RUNNING,
      message: `${service.name} is already running.`,
    };
  }

  await ensureWorkingDirectoryExists(service.root, service.name);
  await ensureExecutableIfAbsolute(service.executable, service.name);

  const child = spawn(service.executable, service.args, {
    cwd: service.root,
    env: {
      ...process.env,
      SERVICE_NAME: service.name,
      SERVICE_MODE: service.mode,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  managerStore.processes.set(service.id, { child });
  appendLog(service.id, `Launching process: ${service.command}`);

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
