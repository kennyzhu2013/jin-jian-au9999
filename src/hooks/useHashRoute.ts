import { useEffect, useState } from "react";

export type RouteId = "market" | "signals" | "digest" | "alerts";

function readRoute(): RouteId {
  const hash = window.location.hash;
  if (hash.startsWith("#/signals")) return "signals";
  if (hash.startsWith("#/digest")) return "digest";
  if (hash.startsWith("#/alerts")) return "alerts";
  return "market";
}

export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
