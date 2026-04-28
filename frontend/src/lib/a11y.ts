export function announce(message: string) {
  if (typeof document === "undefined") return;
  const region = document.getElementById("app-live-region");
  if (!region) return;
  region.textContent = "";
  window.requestAnimationFrame(() => {
    region.textContent = message;
  });
}
