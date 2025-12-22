import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  type RawServiceDefinition,
  type ServiceRuntime,
  type ServiceStatsSnapshot,
  type SettingsFile,
  ServiceStatus,
} from "../types";
import { getProcessStatus } from "./service-manager";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");
const SERVICES_ROOT = path.join(process.cwd(), "services");
const DEFAULT_ENTRY = "dist/index.js";

export interface ServiceSettingsSnapshot {
  nvmPath: string;
  services: ServiceRuntime[];
  stats: ServiceStatsSnapshot;
}

type BaseSettingsSnapshot = {
  nvmPath: string;
  services: ServiceRuntime[];
};

let cachedSnapshot: BaseSettingsSnapshot | null = null;
let cachedMtime = 0;

export async function getServiceSettings(
  forceReload = false
): Promise<ServiceSettingsSnapshot> {
  const fileStats = await safeStat(SETTINGS_PATH);

  if (
    forceReload ||
    !cachedSnapshot ||
    (fileStats?.mtimeMs ?? 0) !== cachedMtime
  ) {
    const raw = await safeReadFile(SETTINGS_PATH);
    const parsed = parseSettings(raw);
    const services = parsed.services.map(normalizeService);
    cachedSnapshot = {
      nvmPath: parsed.nvm,
      services,
    };
    cachedMtime = fileStats?.mtimeMs ?? Date.now();
  }

  if (!cachedSnapshot) {
    return { nvmPath: "", services: [], stats: summarizeServices([]) };
  }

  const servicesWithRuntimeState = cachedSnapshot.services.map((service) => ({
    ...service,
    status: getProcessStatus(service.id),
  }));

  return {
    nvmPath: cachedSnapshot.nvmPath,
    services: servicesWithRuntimeState,
    stats: summarizeServices(servicesWithRuntimeState),
  };
}

function summarizeServices(services: ServiceRuntime[]): ServiceStatsSnapshot {
  return services.reduce(
    (acc, service) => {
      acc.total += 1;
      if (service.mode === "PRODUCTION") {
        acc.production += 1;
      } else {
        acc.development += 1;
      }
      return acc;
    },
    { total: 0, production: 0, development: 0 }
  );
}

function parseSettings(raw: string): SettingsFile {
  try {
    const parsed = JSON.parse(raw) as Partial<SettingsFile>;
    const services = Array.isArray(parsed?.services)
      ? (parsed.services as RawServiceDefinition[])
      : [];
    return {
      nvm: parsed?.nvm?.trim() || "",
      services,
    };
  } catch (error) {
    throw new Error(`Unable to parse data/settings.json: ${String(error)}`);
  }
}

function normalizeService(
  service: RawServiceDefinition,
  index: number
): ServiceRuntime {
  const name = service.name?.trim() || `Service ${index + 1}`;
  const id = createStableIdentifier(name, index);
  const folderSlug = sanitizeFolderName(name);
  const defaultRoot = path.join(SERVICES_ROOT, folderSlug);
  const entryCandidate = service.main?.trim() || DEFAULT_ENTRY;
  let rootDir = defaultRoot;
  let entryPoint = entryCandidate;

  if (path.isAbsolute(entryCandidate)) {
    entryPoint = entryCandidate;
    rootDir = path.dirname(entryPoint);
  } else {
    entryPoint = path.join(rootDir, entryCandidate);
  }

  return {
    id,
    name,
    main: entryCandidate,
    nodeVersion: service.nodeVersion?.trim() || "lts",
    mode: service.mode === "PRODUCTION" ? "PRODUCTION" : "DEVELOPMENT",
    version: service.version?.trim(),
    argv: Array.isArray(service.argv) ? service.argv.map(String) : [],
    status: ServiceStatus.STOPPED,
    rootDir,
    entryPoint,
  };
}

function createStableIdentifier(name: string, index: number): string {
  const slugBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slugBase || "service";
  return `${safeSlug}-${index + 1}`;
}

function sanitizeFolderName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-") || "service"
  );
}

async function safeReadFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read ${path.relative(
        process.cwd(),
        filePath
      )}. Did you create data/settings.json?`
    );
  }
}

async function safeStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}
