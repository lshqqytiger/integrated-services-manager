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

  status: ServiceStatus;
}
export interface STDResponse {
  index: number;
  data: string;
}
export enum ServiceStatus {
  STOPPED,
  RUNNING,
}
export class LengthLimitedArray extends Array {
  maxLength: number;
  constructor(maxLength: number) {
    super();

    this.maxLength = maxLength;
  }
  push(...args: any[]) {
    if (this.length >= this.maxLength) this.shift();

    return super.push(...args);
  }
  copy() {
    const copied = this.slice(0) as LengthLimitedArray;
    copied.maxLength = this.maxLength;
    return copied;
  }
}
