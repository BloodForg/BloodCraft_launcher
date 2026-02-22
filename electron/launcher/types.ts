export interface InstallProgress {
  stage: 'idle' | 'downloading' | 'extracting' | 'verifying' | 'launching' | 'done' | 'error';
  percent?: number;
  message?: string;
  currentBytes?: number;
  totalBytes?: number;
}

export interface DistributionFile {
  url: string;
  path: string;
  sha256: string;
  size?: number;
}

export interface Distribution {
  schema?: number;
  instanceId: string;
  mcVersion?: string;
  minecraft?: {
    version: string;
    type?: string;
  };
  java?: {
    required?: boolean;
    minVersion?: number;
  };
  launch?: {
    mainClass?: string;
    jvmArgs?: string[];
    gameArgs?: string[];
  };
  server?: {
    host?: string;
    port?: number;
  };
  files?: DistributionFile[];
  zipUrl?: string;
  zipSha256?: string;
  zipSize?: number;
  package?: {
    url: string;
    sha256: string;
    size?: number;
  };
}

export interface LauncherStatus {
  instanceDir: string;
  javaPath?: string;
  javaOk: boolean;
  lastError?: string;
  installed: boolean;
  installedSha256?: string;
  mcVersion?: string;
  instanceId?: string;
}
