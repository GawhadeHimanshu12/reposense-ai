import api from "./api";
import type { TokenResponse, User } from "@/types";

export const authService = {
  async login(email: string, password: string): Promise<TokenResponse> {
    const { data } = await api.post<TokenResponse>("/auth/login", { email, password });
    return data;
  },

  async register(email: string, username: string, password: string): Promise<User> {
    const { data } = await api.post<User>("/auth/register", { email, username, password });
    return data;
  },

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const { data } = await api.post<TokenResponse>("/auth/refresh", {
      refresh_token: refreshToken,
    });
    return data;
  },

  async getGitHubOAuthUrl(): Promise<string> {
    const { data } = await api.get<{ url: string }>("/auth/github/url");
    return data.url;
  },

  async getMe(): Promise<User> {
    const { data } = await api.get<User>("/auth/me");
    return data;
  },
};
