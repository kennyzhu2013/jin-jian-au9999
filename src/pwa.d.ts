declare module "virtual:pwa-register" {
  export function registerSW(options?: {
    immediate?: boolean;
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
