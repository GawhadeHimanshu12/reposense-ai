import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { OfflinePage } from "@/pages/OfflinePage";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineOverlay() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOnline) {
      queryClient.invalidateQueries();
    }
  }, [isOnline, queryClient]);

  if (isOnline) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-sm">
      <OfflinePage />
    </div>
  );
}
