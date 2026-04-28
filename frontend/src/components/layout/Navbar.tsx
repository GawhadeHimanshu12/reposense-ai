import { GitBranch, LogOut, Settings, User } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 font-bold text-lg">
          <GitBranch className="h-5 w-5 text-primary" />
          RepoSense AI
        </Link>

        <nav className="flex items-center gap-4">
          {user && (
            <>
              <span className="text-sm text-muted-foreground">
                {user.username}
              </span>
              <Button variant="ghost" size="icon" asChild>
                <Link to="/settings">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
