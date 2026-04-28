import { useQuery } from "@tanstack/react-query";

import { chatApi } from "@/lib/api";

export function useChatHistory(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["chat-history", sessionId],
    queryFn: () => chatApi.getHistory(sessionId!),
    enabled: !!sessionId,
    staleTime: 10_000,
  });
}

export function useFollowupRemaining(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["followup-remaining", sessionId],
    queryFn: () => chatApi.getRemaining(sessionId!),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}
