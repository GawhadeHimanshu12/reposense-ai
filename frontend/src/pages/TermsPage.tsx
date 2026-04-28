import { FileText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TermsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">By using RepoSense AI, you agree to these terms.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>RepoSense AI is provided as-is for analyzing public repositories. You are responsible for ensuring you have the right to analyze any repository.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limitations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Analysis results are best-effort and may be incomplete. Do not rely on them as the sole source of truth for security decisions.</p>
        </CardContent>
      </Card>
    </div>
  );
}
