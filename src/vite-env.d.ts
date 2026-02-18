/// <reference types="vite/client" />

declare global {
  interface Window {
    bloodcraft?: {
      openExternal: (url: string) => Promise<boolean>;
    };
  }
}

export {};
