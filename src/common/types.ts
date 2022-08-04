export interface Settings {
  nvm: string;
  services: Service[];
}
export interface Service {
  name: string;
  version: string;
  main: string;
  status: ServiceStatus;
  nodeVersion: string;
}
export enum ServiceStatus {
  STOPPED,
  RUNNING,
}
