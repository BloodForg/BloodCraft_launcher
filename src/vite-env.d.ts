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
          | { ok: false; error: { code: string; message: string } }
        >;
        me: () => Promise<{ ok: true; user: { username: string; avatarUrl: string; email: string } } | { ok: false; error: { code: string; message: string } }>;
        refresh: () => Promise<
          | { ok: true; session: { accessToken: string; user: { username: string; avatarUrl: string; email: string } } }
          | { ok: false; error: { code: string; message: string } }
        >;
        logout: () => Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }>;
      };
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
        launch: (options?: { javaPath?: string; minMemoryGb?: number; maxMemoryGb?: number }) => Promise<boolean>;
        onProgress: (cb: (progress: InstallProgress) => void) => () => void;
      };
    };
  }
}

export {};
