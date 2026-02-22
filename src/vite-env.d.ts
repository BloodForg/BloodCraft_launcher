/// <reference types="vite/client" />

type InstallProgress = {
  stage: 'idle' | 'downloading' | 'extracting' | 'verifying' | 'launching' | 'done' | 'error';
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
  launch?: {
    mainClass?: string;
    jvmArgs?: string[];
    gameArgs?: string[];
  };
  server?: {
    host?: string;
    port?: number;
  };
  java?: { required?: boolean };
  package?: { url: string; sha256: string; size?: number };
  files?: Array<{ url: string; path: string; sha256: string; size?: number }>;
};

type UpdaterStatus = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  message?: string;
  progress?: number;
  version?: string;
};

type NetworkDiagnostics = {
  ok: boolean;
  summary: string;
  site: { ok: boolean; status?: number; url: string; finalUrl?: string; message: string };
  launcherApi: { ok: boolean; status?: number; url: string; finalUrl?: string; message: string };
};

type AuthResultErrorCode = 'INVALID_CREDENTIALS' | 'NETWORK' | 'API_NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'INVALID_RESPONSE' | 'UNAUTHORIZED' | 'UNKNOWN';

declare global {
  interface Window {
    bloodcraft?: {
      openExternal: (url: string) => Promise<boolean>;
      auth?: {
        login: (
          login: string,
          password: string
        ) => Promise<
          | { ok: true; session: { accessToken: string; user: { username: string; avatarUrl: string; email: string } } }
          | { ok: false; error: { code: AuthResultErrorCode; message: string; status?: number; url?: string } }
        >;
        me: () => Promise<{ ok: true; user: { username: string; avatarUrl: string; email: string } } | { ok: false; error: { code: AuthResultErrorCode; message: string; status?: number; url?: string } }>;
        refresh: () => Promise<
          | { ok: true; session: { accessToken: string; user: { username: string; avatarUrl: string; email: string } } }
          | { ok: false; error: { code: AuthResultErrorCode; message: string; status?: number; url?: string } }
        >;
        logout: () => Promise<{ ok: true } | { ok: false; error: { code: AuthResultErrorCode; message: string; status?: number; url?: string } }>;
      };
      network?: {
        check: () => Promise<NetworkDiagnostics>;
        diagnose: () => Promise<NetworkDiagnostics>;
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
        launch: (options?: { javaPath?: string; minMemoryGb?: number; maxMemoryGb?: number }) => Promise<boolean>;
        onProgress: (cb: (progress: InstallProgress) => void) => () => void;
      };
    };
  }
}

export {};
