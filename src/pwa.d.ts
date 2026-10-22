interface ImportMetaEnv {
  readonly VITE_NEWS_API_URL?: string;
  readonly VITE_NEWS_API_KEY?: string;
  readonly VITE_SETTINGS_API_URL?: string;
}

declare module "virtual:pwa-register" {
  export function registerSW(options?: {
    immediate?: boolean;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
