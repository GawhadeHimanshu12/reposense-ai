import { WifiOff } from "lucide-react";

export function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center p-8">
      <div className="rounded-full bg-muted p-4">
        <WifiOff className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">You're offline</h1>
        <p className="text-muted-foreground max-w-sm">Check your internet connection. We'll retry automatically when you're back online.</p>
      </div>
    </div>
  );
}
