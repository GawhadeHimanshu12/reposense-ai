import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface ScoreCardProps {
  label: string;
  score: number | null | undefined;
  icon: React.ReactNode;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-600";
}

export function ScoreCard({ label, score, icon }: ScoreCardProps) {
  const value = score ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        <span className={cn("text-2xl font-bold", scoreColor(value))}>
          {score != null ? score : "—"}
        </span>
      </div>
      <Progress
        value={value}
        className={cn(
          "h-2",
          value >= 80 ? "[&>div]:bg-green-500" : value >= 60 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"
        )}
      />
    </div>
  );
}
