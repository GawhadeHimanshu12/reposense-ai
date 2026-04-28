import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/store/auth";
import { authService } from "@/services/auth";

export function useAuth() {
  const store = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (store.accessToken && !store.user) {
      authService.getMe().then(store.setUser).catch(() => store.logout());
    }
  }, [store.accessToken]);

  const login = async (email: string, password: string) => {
    const tokens = await authService.login(email, password);
    store.setTokens(tokens.access_token, tokens.refresh_token);
    const user = await authService.getMe();
    store.setUser(user);
    navigate("/dashboard");
  };

  const loginWithGitHub = async () => {
    const url = await authService.getGitHubOAuthUrl();
    window.location.href = url;
  };

  const logout = () => {
    store.logout();
    navigate("/");
  };

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated(),
    login,
    loginWithGitHub,
    logout,
  };
}
