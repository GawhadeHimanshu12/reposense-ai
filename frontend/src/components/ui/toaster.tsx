import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      richColors
      visibleToasts={3}
      duration={4000}
    />
  );
}
