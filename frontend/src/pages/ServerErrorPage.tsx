import { AlertTriangle, Bug } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  message?: string;
  onRetry?: () => void;
}

const issuesUrl = import.meta.env.VITE_GITHUB_ISSUES_URL ?? "https://github.com/yourusername/reposense-ai/issues/new";

export function ServerErrorPage({ message, onRetry }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center p-8">
      <div className="rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground max-w-sm">
          {message ?? "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={onRetry ?? (() => window.location.reload())}>Try again</Button>
        <Button variant="outline" asChild>
          <a href={issuesUrl} target="_blank" rel="noreferrer" className="gap-2">
            <Bug className="h-4 w-4" /> Report this issue
          </a>
        </Button>
      </div>
    </div>
  );
}
