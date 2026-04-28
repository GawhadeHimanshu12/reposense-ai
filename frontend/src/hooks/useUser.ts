import { useQuery } from "@tanstack/react-query";

import { authApi, userApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function useUser() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const user = await authApi.getMe();
      setUser(user);
      return user;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}

export function useUserStats() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  return useQuery({
    queryKey: ["me", "stats"],
    queryFn: () => userApi.getStats(),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}
