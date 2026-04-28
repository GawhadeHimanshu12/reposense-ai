import { Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AboutPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">About RepoSense AI</h1>
          <p className="text-sm text-muted-foreground">Understand GitHub repositories faster with AI-driven analysis.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What it does</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>RepoSense AI analyzes public GitHub repositories and produces structured summaries, architecture notes, and actionable recommendations.</p>
          <p>It combines repository metadata, file structure, and AI insights to help developers assess code quality, security, and maintainability.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why it exists</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Whether you are evaluating a dependency, onboarding to a new codebase, or preparing for a handoff, RepoSense AI gives you a clear starting point.</p>
          <p>It is designed to be fast, transparent, and privacy-friendly.</p>
        </CardContent>
      </Card>
    </div>
  );
}
