import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AnalysisInsight } from "@/types";

const severityConfig = {
  critical: { icon: AlertCircle, color: "text-red-600", badge: "destructive" as const },
  warning: { icon: AlertTriangle, color: "text-yellow-600", badge: "warning" as const },
  info: { icon: Info, color: "text-blue-600", badge: "secondary" as const },
};

export function InsightItem({ insight }: { insight: AnalysisInsight }) {
  const cfg = severityConfig[insight.severity] ?? severityConfig.info;
  const Icon = cfg.icon;

  return (
    <div className="flex gap-3 py-3 border-b last:border-0">
      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${cfg.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{insight.title}</p>
          <div className="flex gap-1.5 shrink-0">
            <Badge variant={cfg.badge}>{insight.severity}</Badge>
            <Badge variant="outline">{insight.category}</Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{insight.description}</p>
        {insight.file_path && (
          <code className="text-xs text-muted-foreground bg-muted px-1 rounded mt-1 inline-block">
            {insight.file_path}
          </code>
        )}
      </div>
    </div>
  );
}
