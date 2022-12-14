export interface Settings {
  nvm: string;
  services: Service[];
}
export interface Service {
  name: string;
  version: string;
  main: string;
  nodeVersion: string;
  argv: string[];
  mode: "PRODUCTION" | "DEVELOPMENT";

  status: ServiceStatus;
}
export interface Props {
  title: string;
  version: string;
  services: Service[];
  preIndex: number;
  logs: LengthLimitedArray<string>;
  detachedWindows: string[];
  pageName: string;
}
export interface STDResponse {
  index: number;
  data: string;
}
export enum ServiceStatus {
  STOPPED,
  RUNNING,
}
export class LengthLimitedArray<T> extends Array {
  maxLength: number;
  constructor(maxLength: number) {
    super();

    this.maxLength = maxLength;
  }
  push(...args: T[]) {
    if (this.length >= this.maxLength) this.shift();

    return super.push(...args);
  }
  copy() {
    const copied = this.slice(0) as LengthLimitedArray<T>;
    copied.maxLength = this.maxLength;
    return copied;
  }
}
