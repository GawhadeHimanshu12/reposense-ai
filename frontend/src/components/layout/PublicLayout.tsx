import { ArrowRight, GitBranch } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { useAuthStore } from "@/store/auth";
import { Footer } from "./Footer";

export function PublicLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-base">
            <GitBranch className="h-4 w-4 text-primary" />
            RepoSense AI
          </Link>

          <nav className="hidden sm:flex items-center gap-5 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/dashboard">
                  Dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container py-10 max-w-3xl">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
