import { useQuery } from "@tanstack/react-query";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/api";

export function AdminSettingsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-settings"], queryFn: adminApi.getSettings });

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

  const sections = [
    { title: "Rate Limits", data: data?.rate_limits },
    { title: "Feature Flags", data: data?.feature_flags },
    { title: "AI Defaults", data: data?.ai_defaults },
    { title: "Security", data: data?.security },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">System Settings</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {sections.map(({ title, data: sData }) => (
          <Card key={title}>
            <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-auto">
                {JSON.stringify(sData ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
