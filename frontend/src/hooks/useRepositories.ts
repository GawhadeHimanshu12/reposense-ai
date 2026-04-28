import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { repositoryService } from "@/services/repositories";

export function useRepositories() {
  return useQuery({
    queryKey: ["repositories"],
    queryFn: repositoryService.list,
  });
}

export function useRepository(id: string) {
  return useQuery({
    queryKey: ["repositories", id],
    queryFn: () => repositoryService.get(id),
    enabled: !!id,
  });
}

export function useSyncRepositories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: repositoryService.sync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repositories"] }),
  });
}

export function useAnalyzeRepository(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (aiProvider: string) => repositoryService.analyze(id, aiProvider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analyses", id] }),
  });
}

export function useAnalyses(repoId: string) {
  return useQuery({
    queryKey: ["analyses", repoId],
    queryFn: () => repositoryService.getAnalyses(repoId),
    enabled: !!repoId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasRunning = data.some((a) => a.status === "pending" || a.status === "running");
      return hasRunning ? 3000 : false;
    },
  });
}
