import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center p-8">
      <div className="rounded-full bg-muted p-4">
        <Lock className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Access denied</h1>
        <p className="text-muted-foreground max-w-sm">You don't have permission to view this page.</p>
      </div>
      <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
    </div>
  );
}
