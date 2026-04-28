import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  GitFork,
  Loader2,
  Shield,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightItem } from "@/components/features/InsightItem";
import { ScoreCard } from "@/components/features/ScoreCard";
import { useRepository, useAnalyzeRepository, useAnalyses } from "@/hooks/useRepositories";

export function RepositoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: repo, isLoading: repoLoading } = useRepository(id!);
  const { data: analyses, isLoading: analysesLoading } = useAnalyses(id!);
  const analyzeMutation = useAnalyzeRepository(id!);
  const [aiProvider, setAiProvider] = useState<"anthropic" | "openai">("anthropic");

  const latestAnalysis = analyses?.[0];

  if (repoLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!repo) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Back to dashboard">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{repo.full_name}</h1>
          {repo.description && (
            <p className="text-muted-foreground text-sm">{repo.description}</p>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={repo.html_url} target="_blank" rel="noreferrer" className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" /> GitHub
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        {repo.language && <Badge variant="secondary">{repo.language}</Badge>}
        <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" /> {repo.stars.toLocaleString()}</span>
        <span className="flex items-center gap-1"><GitFork className="h-3.5 w-3.5" /> {repo.forks.toLocaleString()}</span>
        <span className="flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> {repo.open_issues} issues</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border overflow-hidden">
              {(["anthropic", "openai"] as const).map((p) => (
                <button
                  key={p}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    aiProvider === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                  onClick={() => setAiProvider(p)}
                >
                  {p === "anthropic" ? "Claude" : "GPT-4o"}
                </button>
              ))}
            </div>
            <Button
              onClick={() => analyzeMutation.mutate(aiProvider)}
              disabled={
                analyzeMutation.isPending ||
                latestAnalysis?.status === "pending" ||
                latestAnalysis?.status === "running"
              }
              className="gap-2"
            >
              {(analyzeMutation.isPending ||
                latestAnalysis?.status === "pending" ||
                latestAnalysis?.status === "running") && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {analyzeMutation.isPending || latestAnalysis?.status === "pending" || latestAnalysis?.status === "running"
                ? "Analyzing..."
                : "Run Analysis"}
            </Button>
            {latestAnalysis && (
              <Badge
                variant={
                  latestAnalysis.status === "completed"
                    ? "success"
                    : latestAnalysis.status === "failed"
                    ? "destructive"
                    : "secondary"
                }
              >
                {latestAnalysis.status}
              </Badge>
            )}
          </div>

          {latestAnalysis?.status === "completed" && (
            <div className="space-y-6">
              {latestAnalysis.summary && (
                <p className="text-sm leading-relaxed bg-muted/50 rounded-lg p-4">
                  {latestAnalysis.summary}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <ScoreCard
                  label="Code Quality"
                  score={latestAnalysis.code_quality_score}
                  icon={<Wrench className="h-4 w-4" />}
                />
                <ScoreCard
                  label="Security"
                  score={latestAnalysis.security_score}
                  icon={<Shield className="h-4 w-4" />}
                />
                <ScoreCard
                  label="Maintainability"
                  score={latestAnalysis.maintainability_score}
                  icon={<Sparkles className="h-4 w-4" />}
                />
              </div>

              {latestAnalysis.insights.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">
                    Insights ({latestAnalysis.insights.length})
                  </h3>
                  <div>
                    {latestAnalysis.insights.map((insight) => (
                      <InsightItem key={insight.id} insight={insight} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {latestAnalysis?.status === "failed" && (
            <p className="text-sm text-destructive">
              Analysis failed: {latestAnalysis.error_message ?? "Unknown error"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
