import { Shield } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PrivacyPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">We keep data collection minimal and transparent.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What we collect</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>We store your account email, profile name, and repository analyses to deliver the service.</p>
          <p>We use Plausible Analytics for anonymous usage metrics. No cookies and no personally identifiable information are tracked.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>You can delete your account at any time from the Profile page. This disables access and removes personal identifiers.</p>
        </CardContent>
      </Card>
    </div>
  );
}
