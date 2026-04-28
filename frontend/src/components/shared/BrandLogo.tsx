import { GitBranch } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm",
        className,
      )}
    >
      <GitBranch className="h-4 w-4" strokeWidth={2.4} />
    </div>
  );
}

export function BrandLogo({
  to = "/",
  compact = false,
  className,
}: {
  to?: string;
  compact?: boolean;
  className?: string;
}) {
  const content = (
    <>
      <BrandMark className={compact ? "h-7 w-7" : "h-8 w-8"} />
      <span className={cn("font-bold tracking-tight text-foreground", compact ? "text-base" : "text-xl")}>
        RepoSense<span className="ml-1 text-muted-foreground">AI</span>
      </span>
    </>
  );

  if (!to) {
    return <div className={cn("flex items-center gap-2", className)}>{content}</div>;
  }

  return (
    <Link to={to} className={cn("flex items-center gap-2", className)}>
      {content}
    </Link>
  );
}
