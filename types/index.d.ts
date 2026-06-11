export type BackendType = 0 | 1 | 2 | 3 | 4;
export type TextureFormat = number;

export interface SenderInfo {
  name: string;
  applicationName: string;
  id: string;
  backend: BackendType;
}

export interface ConnectedSenderInfo extends SenderInfo {
  width: number;
  height: number;
  format: TextureFormat;
  semanticFormat: TextureFormat;
  estimatedFps: number;
  frameCounter: bigint;
  lastUpdateTimeNs: bigint;
  nativeFormatKind: number;
  nativeFormatValue: number;
  nativeFormatModifier: bigint;
}

export interface ReceiverStatus {
  closed: boolean;
  connected: ConnectedSenderInfo | null;
  lastError?: string;
}

export interface ReceiverOptions {
  applicationName?: string;
}

export interface Diagnostics {
  binding: 'napi';
  napiBaseline: number;
  metalAvailable: boolean;
  d3d11Available: boolean;
  dmaBufAvailable: boolean;
  openglAvailable: boolean;
}

export class NozzleError extends Error {
  code: string;
  nativeCode: number;
}

export class NozzleLoadError extends Error {
  code: 'NOZZLE_NODE_LOAD_FAILED';
  cause: unknown;
}

export class Receiver {
  readonly sourceName: string;
  readonly closed: boolean;
  constructor(sourceName: string, options?: ReceiverOptions);
  status(): ReceiverStatus;
  close(): void;
  [Symbol.dispose](): void;
}

export function listSources(): SenderInfo[];
export function diagnostics(): Diagnostics;
