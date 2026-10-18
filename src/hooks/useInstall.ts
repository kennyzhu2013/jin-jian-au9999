import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function standalone(): boolean {
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || ios;
}

export function useInstall() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(standalone);
  const [workerReady, setWorkerReady] = useState(false);

  useEffect(() => {
    const onPrompt = (promptEvent: Event) => {
      promptEvent.preventDefault();
      setEvent(promptEvent as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(() => setWorkerReady(true))
        .catch(() => setWorkerReady(false));
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setEvent(null);
  };

  return { canPrompt: event != null, installed, workerReady, promptInstall };
}
