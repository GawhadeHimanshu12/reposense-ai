import api from "./api";
import type { Repository, RepositoryAnalysis } from "@/types";

export const repositoryService = {
  async list(): Promise<Repository[]> {
    const { data } = await api.get<Repository[]>("/api/v1/repositories/");
    return data;
  },

  async sync(): Promise<Repository[]> {
    const { data } = await api.post<Repository[]>("/api/v1/repositories/sync");
    return data;
  },

  async get(id: string): Promise<Repository> {
    const { data } = await api.get<Repository>(`/api/v1/repositories/${id}`);
    return data;
  },

  async analyze(id: string, aiProvider = "anthropic"): Promise<RepositoryAnalysis> {
    const { data } = await api.post<RepositoryAnalysis>(`/api/v1/repositories/${id}/analyze`, {
      ai_provider: aiProvider,
    });
    return data;
  },

  async getAnalyses(id: string): Promise<RepositoryAnalysis[]> {
    const { data } = await api.get<RepositoryAnalysis[]>(`/api/v1/repositories/${id}/analyses`);
    return data;
  },
};
