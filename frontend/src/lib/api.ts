import axios, { type AxiosError, type AxiosResponse } from "axios";

import type {
  AdminChatSessionListResponse,
  AdminUserDetail,
  AdminUserListResponse,
  AuditLogListResponse,
  OverviewStats,
  ProviderStats,
  ProviderTestResponse,
  ProviderUpdateRequest,
  SystemSettingsResponse,
  UserPatchRequest,
} from "@/types/admin.types";
import type { AnalyzeResponse, AnalysisSession, AnalysisSessionSummary, RepoRateLimit } from "@/types/analysis.types";
import type { ChatHistory, FollowupRemaining, SendMessageResponse } from "@/types/chat.types";
import type { AuthResponse, User, UserStats } from "@/types/user.types";
import { useAuthStore } from "@/store/auth";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const API_PREFIX = "/api/v1";

// ── Axios instance ────────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: `${BASE_URL}${API_PREFIX}`,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// Attach access token from store on every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 → attempt token refresh, then logout
apiClient.interceptors.response.use(
  (res: AxiosResponse) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status === 401 && !original?._retry) {
      original._retry = true;
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (refreshToken) {
          const { data } = await axios.post<{ access_token: string; refresh_token: string }>(
            `${BASE_URL}${API_PREFIX}/auth/refresh`,
            { refresh_token: refreshToken },
          );
          useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
          original!.headers!["Authorization"] = `Bearer ${data.access_token}`;
          return apiClient(original!);
        }
      } catch {
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>("/auth/login", { email, password }).then((r) => r.data),

  register: (email: string, password: string, username: string) =>
    apiClient.post<AuthResponse>("/auth/register", { email, password, username }).then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post("/auth/logout", { refresh_token: refreshToken }),

  getMe: () => apiClient.get<User>("/auth/me").then((r) => r.data),

  googleLogin: (idToken: string) =>
    apiClient.post<AuthResponse>("/auth/google", { id_token: idToken }).then((r) => r.data),

  getGoogleUrl: () =>
    apiClient.get<{ url: string }>("/auth/google/url").then((r) => r.data),

  getGithubUrl: () =>
    apiClient.get<{ url: string }>("/auth/github/url").then((r) => r.data),
};

// ── Users ───────────────────────────────────────────────────────────────────

export const userApi = {
  getStats: () => apiClient.get<UserStats>("/users/me/stats").then((r) => r.data),
  deleteMe: () => apiClient.delete("/users/me"),
};

// ── Repos ─────────────────────────────────────────────────────────────────────

export const reposApi = {
  analyze: (repoUrl: string) =>
    apiClient.post<AnalyzeResponse>("/repos/analyze", { repo_url: repoUrl }).then((r) => r.data),

  getAnalysis: (sessionId: string) =>
    apiClient.get<AnalysisSession>(`/repos/analysis/${sessionId}`).then((r) => r.data),

  getMyAnalyses: (skip = 0, limit = 20) =>
    apiClient.get<AnalysisSessionSummary[]>("/repos/my-analyses", { params: { skip, limit } }).then((r) => r.data),

  deleteAnalysis: (sessionId: string) =>
    apiClient.delete(`/repos/analysis/${sessionId}`),

  getRateLimit: () =>
    apiClient.get<RepoRateLimit>("/repos/rate-limit").then((r) => r.data),
};

// ── Chat ──────────────────────────────────────────────────────────────────────

export const chatApi = {
  sendMessage: (sessionId: string, message: string) =>
    apiClient.post<SendMessageResponse>(`/chat/${sessionId}/message`, { message }).then((r) => r.data),

  getHistory: (sessionId: string) =>
    apiClient.get<ChatHistory>(`/chat/${sessionId}/history`).then((r) => r.data),

  getRemaining: (sessionId: string) =>
    apiClient.get<FollowupRemaining>(`/chat/${sessionId}/remaining`).then((r) => r.data),
};

// ── Admin ─────────────────────────────────────────────────────────────────────

export const adminApi = {
  // Users
  listUsers: (params?: { search?: string; skip?: number; limit?: number; sort_by?: string; order?: string }) =>
    apiClient.get<AdminUserListResponse>("/admin/users", { params }).then((r) => r.data),

  getUser: (userId: string) =>
    apiClient.get<AdminUserDetail>(`/admin/users/${userId}`).then((r) => r.data),

  patchUser: (userId: string, patch: UserPatchRequest) =>
    apiClient.patch(`/admin/users/${userId}`, patch).then((r) => r.data),

  deleteUser: (userId: string) =>
    apiClient.delete(`/admin/users/${userId}`),

  // Chats
  listChats: (params?: { user_id?: string; date_from?: string; date_to?: string; ai_provider?: string; skip?: number; limit?: number }) =>
    apiClient.get<AdminChatSessionListResponse>("/admin/chats", { params }).then((r) => r.data),

  getChatDetail: (sessionId: string) =>
    apiClient.get(`/admin/chats/${sessionId}`).then((r) => r.data),

  exportChats: (fmt: "json" | "csv" = "json", params?: Record<string, unknown>) =>
    apiClient.get("/admin/chats/export", { params: { fmt, ...params }, responseType: "blob" }).then((r) => r.data),

  // AI providers
  listProviders: () =>
    apiClient.get<Record<string, ProviderStats>>("/admin/ai/providers").then((r) => r.data),

  updateProvider: (name: string, patch: ProviderUpdateRequest) =>
    apiClient.patch<ProviderStats>(`/admin/ai/providers/${name}`, patch).then((r) => r.data),

  testProvider: (name: string) =>
    apiClient.post<ProviderTestResponse>(`/admin/ai/test/${name}`).then((r) => r.data),

  configureProvider: (name: string, apiKey: string) =>
    apiClient.post<ProviderTestResponse>(`/admin/ai/providers/${name}/configure`, { api_key: apiKey }).then((r) => r.data),

  // Settings
  getSettings: () =>
    apiClient.get<SystemSettingsResponse>("/admin/settings").then((r) => r.data),

  patchSettings: (key: string, value: unknown) =>
    apiClient.patch("/admin/settings", { key, value }).then((r) => r.data),

  // Stats
  getOverview: () =>
    apiClient.get<OverviewStats>("/admin/stats/overview").then((r) => r.data),

  getUsage: (params?: { date_from?: string; date_to?: string; group_by?: string }) =>
    apiClient.get("/admin/stats/usage", { params }).then((r) => r.data),

  getCosts: (params?: { date_from?: string; date_to?: string }) =>
    apiClient.get("/admin/stats/costs", { params }).then((r) => r.data),

  // Audit
  listAudit: (params?: { action_type?: string; admin_id?: string; date_from?: string; date_to?: string; skip?: number; limit?: number }) =>
    apiClient.get<AuditLogListResponse>("/admin/audit", { params }).then((r) => r.data),
};

// ── Health ────────────────────────────────────────────────────────────────────

export const healthApi = {
  check: () => apiClient.get<{ status: string; database: string; redis: string }>("/health").then((r) => r.data),
};

export default apiClient;
