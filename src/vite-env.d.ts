/// <reference types="vite/client" />

type InstallProgress = {
  stage: 'idle' | 'downloading' | 'extracting' | 'verifying' | 'done' | 'error';
  percent?: number;
  message?: string;
  currentBytes?: number;
  totalBytes?: number;
};

type LauncherStatus = {
  instanceDir: string;
  javaPath?: string;
  javaOk: boolean;
  lastError?: string;
  installed: boolean;
  installedSha256?: string;
  mcVersion?: string;
  instanceId?: string;
};

type Distribution = {
  schema: number;
  instanceId: string;
  minecraft: { version: string; type?: string };
  java?: { required?: boolean };
  package: { url: string; sha256: string; size?: number };
};

type UpdaterStatus = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  message?: string;
  progress?: number;
  version?: string;
};

declare global {
  interface Window {
    bloodcraft?: {
      openExternal: (url: string) => Promise<boolean>;
      network?: {
        check: () => Promise<boolean>;
      };
      logger?: {
        info: (message: string) => Promise<boolean>;
        error: (message: string) => Promise<boolean>;
      };
      logs?: {
        openDir: () => Promise<string>;
        openLatest: () => Promise<string>;
      };
      updater?: {
        getStatus: () => Promise<UpdaterStatus>;
        check: () => Promise<boolean>;
        download: () => Promise<boolean>;
        restart: () => Promise<boolean>;
        onStatus: (cb: (status: UpdaterStatus) => void) => () => void;
      };
      launcher?: {
        getStatus: () => Promise<LauncherStatus>;
        getDistribution: () => Promise<Distribution | null>;
        install: () => Promise<boolean>;
        launch: () => Promise<boolean>;
        onProgress: (cb: (progress: InstallProgress) => void) => () => void;
      };
    };
  }
}

export {};
