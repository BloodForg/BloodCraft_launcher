export interface InstallProgress {
  stage: 'idle' | 'downloading' | 'extracting' | 'verifying' | 'done' | 'error';
  percent?: number;
  message?: string;
  currentBytes?: number;
  totalBytes?: number;
}

export interface Distribution {
  schema: number;
  instanceId: string;
  minecraft: {
    version: string;
    type?: string;
  };
  java?: {
    required?: boolean;
  };
  package: {
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
