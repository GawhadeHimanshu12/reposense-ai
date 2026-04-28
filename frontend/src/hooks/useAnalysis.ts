import { useQuery } from "@tanstack/react-query";

import { reposApi } from "@/lib/api";

export function useAnalysis(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["analysis", sessionId],
    queryFn: () => reposApi.getAnalysis(sessionId!),
    enabled: !!sessionId,
    // Poll every 3 s while still running
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "analyzing" ? 3_000 : false;
    },
    staleTime: 30_000,
  });
}

export function useMyAnalyses(skip = 0, limit = 20) {
  return useQuery({
    queryKey: ["my-analyses", skip, limit],
    queryFn: () => reposApi.getMyAnalyses(skip, limit),
    staleTime: 30_000,
  });
}

export function useRateLimit() {
  return useQuery({
    queryKey: ["rate-limit"],
    queryFn: () => reposApi.getRateLimit(),
    staleTime: 60_000,
  });
}
