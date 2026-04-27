export type ServiceMode = "PRODUCTION" | "DEVELOPMENT";

export interface ServiceDefinition {
  name: string;
  root: string;
  command: string;
  mode: ServiceMode;
}

export type RawServiceDefinition = Partial<
  Record<keyof ServiceDefinition, unknown>
>;

export interface SettingsFile {
  services: RawServiceDefinition[];
}

export enum ServiceStatus {
  STOPPED = "STOPPED",
  RUNNING = "RUNNING",
}

export interface ServiceRuntime extends ServiceDefinition {
  id: string;
  executable: string;
  args: string[];
  status: ServiceStatus;
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
