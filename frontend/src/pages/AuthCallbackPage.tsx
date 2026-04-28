import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState("");

  useEffect(() => {
    async function completeLogin() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken || !refreshToken) {
        setError("OAuth did not return login tokens. Try signing in again.");
        return;
      }

      try {
        setTokens(accessToken, refreshToken);
        const user = await authApi.getMe();
        setUser(user);
        window.history.replaceState(null, "", "/auth/callback");
        navigate("/dashboard", { replace: true });
      } catch {
        setError("OAuth completed, but the session could not be loaded.");
      }
    }

    completeLogin();
  }, [navigate, setTokens, setUser]);

  return (
    <div className="space-y-4 text-center">
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      <div>
        <h1 className="text-xl font-semibold">Finishing sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">You will be redirected automatically.</p>
      </div>
      {error && (
        <Alert variant="destructive" className="text-left">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
