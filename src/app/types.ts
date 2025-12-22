export type ServiceMode = "PRODUCTION" | "DEVELOPMENT";

export interface ServiceDefinition {
  name: string;
  main: string;
  nodeVersion: string;
  mode: ServiceMode;
  version?: string;
  argv?: string[];
}

export type RawServiceDefinition = Partial<Omit<ServiceDefinition, "argv">> & {
  argv?: unknown;
};

export interface SettingsFile {
  nvm: string;
  services: RawServiceDefinition[];
}

export enum ServiceStatus {
  STOPPED = "STOPPED",
  RUNNING = "RUNNING",
}

export interface ServiceRuntime extends ServiceDefinition {
  id: string;
  argv: string[];
  status: ServiceStatus;
  rootDir: string;
  entryPoint: string;
}

export interface ServiceStatsSnapshot {
  total: number;
  production: number;
  development: number;
}

export interface ServiceActionResult {
  status: ServiceStatus;
  message: string;
}
