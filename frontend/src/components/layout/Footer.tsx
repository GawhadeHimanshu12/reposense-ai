import { GitBranch } from "lucide-react";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <GitBranch className="h-4 w-4 text-primary" />
          RepoSense AI
        </div>

        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
        </nav>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} RepoSense AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
