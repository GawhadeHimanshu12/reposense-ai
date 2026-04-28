import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, MessageSquare, Users } from "lucide-react";

import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/api";

function StatCard({ title, value, icon: Icon, description }: { title: string; value: string | number; icon: React.ElementType; description?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export function AdminOverviewPage() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-overview"], queryFn: adminApi.getOverview });

  if (isLoading) return <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">System Overview</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={data?.total_users ?? 0} icon={Users} description={`${data?.active_users_7d ?? 0} active last 7d`} />
        <StatCard title="Total Analyses" value={data?.total_analyses ?? 0} icon={BarChart3} description={`${data?.analyses_24h ?? 0} in last 24h`} />
        <StatCard title="Total Chats" value={data?.total_chats ?? 0} icon={MessageSquare} description={`avg ${data?.avg_followups ?? 0} per session`} />
        <StatCard title="AI Requests (24h)" value={data?.ai_requests_24h ?? 0} icon={Activity} />
      </div>
    </div>
  );
}
