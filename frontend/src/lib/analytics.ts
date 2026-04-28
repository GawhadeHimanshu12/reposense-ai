type PlausibleFn = (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn;
  }
}

export function trackEvent(event: string, props?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  if (window.plausible) {
    window.plausible(event, props ? { props } : undefined);
  }
}
