import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Database,
  Download,
  MessageSquare,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi, healthApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#6366f1",
  openai: "#10b981",
  gemini: "#f59e0b",
};

const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"];

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SparkLine({ data }: { data: number[] }) {
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={pts}>
        <Line type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  color,
  sparkData,
  to,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  color: string;
  sparkData?: number[];
  to?: string;
}) {
  const inner = (
    <Card className="hover:shadow-card-hover transition-all duration-200 cursor-pointer group h-full">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", color)}>
            <Icon className="h-4 w-4" />
          </div>
          {trend !== undefined && (
            <span className={cn("text-xs font-semibold", trend >= 0 ? "text-green-500" : "text-red-500")}>
              {trend >= 0 ? "+" : ""}{trend}%
            </span>
          )}
        </div>
        <p className="text-2xl font-bold tabular-nums mt-3">{value}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        {sparkData && <div className="mt-2"><SparkLine data={sparkData} /></div>}
      </CardContent>
    </Card>
  );
  return (
    <motion.div variants={fadeUp} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      {to ? <Link to={to}>{inner}</Link> : inner}
    </motion.div>
  );
}

function HealthDot({ ok, loading }: { ok?: boolean; loading?: boolean }) {
  if (loading) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />;
  return (
    <span className={cn("inline-block h-2.5 w-2.5 rounded-full", ok ? "bg-green-500" : "bg-red-500")} />
  );
}

function HealthPanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-health"],
    queryFn: healthApi.check,
    refetchInterval: 10_000,
    retry: false,
  });

  const { data: providers, isLoading: pvLoading } = useQuery({
    queryKey: ["admin-providers-health"],
    queryFn: adminApi.listProviders,
    refetchInterval: 10_000,
  });

  const rows = [
    { label: "API Server", ok: !!data, icon: Server },
    { label: "Database", ok: data?.database === "ok", icon: Database },
    { label: "Redis", ok: data?.redis === "ok", icon: Wifi },
  ];

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">System Health</CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.map(({ label, ok, icon: Icon }) => (
          <div key={label} className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {label}
            </div>
            <HealthDot ok={ok} loading={isLoading} />
          </div>
        ))}
        <div className="pt-1 border-t space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Providers</p>
          {pvLoading
            ? <Skeleton className="h-12 w-full" />
            : Object.entries(providers ?? {}).map(([name, stats]) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm capitalize">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: PROVIDER_COLORS[name] ?? "#888" }}
                  />
                  {name}
                </div>
                <span className="text-xs text-muted-foreground">
                  {stats.enabled ? (stats.api_key_configured ? "configured" : "no key") : "disabled"}
                </span>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityFeed() {
  const { data, isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["admin-activity"],
    queryFn: () => adminApi.listAudit({ limit: 10 }),
    refetchInterval: 30_000,
  });

  const secondsAgo = Math.floor((Date.now() - dataUpdatedAt) / 1000);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Updated {secondsAgo}s ago</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
            <Link to="/admin/audit">View all <ChevronRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading
          ? [...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)
          : !data?.items.length
          ? <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
          : (
            <AnimatePresence>
              {data.items.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{entry.action.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.admin_email ?? "system"} · {relativeTime(entry.created_at)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {[
          { label: "View All Users", to: "/admin/users", icon: Users },
          { label: "Check Chat Logs", to: "/admin/chats", icon: MessageSquare },
          { label: "AI Settings", to: "/admin/ai-settings", icon: Zap },
          { label: "System Settings", to: "/admin/settings", icon: Settings },
          { label: "Audit Logs", to: "/admin/audit", icon: Activity },
        ].map(({ label, to, icon: Icon }) => (
          <Button key={to} variant="ghost" size="sm" asChild className="w-full justify-start gap-2 h-9">
            <Link to={to}>
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

type DateRange = "7d" | "30d" | "90d";

function UsageCharts() {
  const [range, setRange] = useState<DateRange>("30d");

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const dateFrom = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];

  const { data, isLoading } = useQuery({
    queryKey: ["admin-usage", range],
    queryFn: () => adminApi.getUsage({ date_from: dateFrom, group_by: "day" }),
  });

  const { data: costs } = useQuery({
    queryKey: ["admin-costs", range],
    queryFn: () => adminApi.getCosts({ date_from: dateFrom }),
  });

  const analyses = (data as any)?.analyses_by_day ?? [];
  const users = (data as any)?.users_by_day ?? [];
  const providerDist = (data as any)?.provider_distribution ?? [];
  const topRepos = ((data as any)?.top_repos ?? []).slice(0, 6);

  function exportChart() {
    const blob = new Blob([JSON.stringify({ analyses, users, providerDist, topRepos, costs }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-${range}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">Usage Analytics</h2>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-lg overflow-hidden">
            {(["7d", "30d", "90d"] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  range === r ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportChart} className="gap-1.5 h-8">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Analyses per day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Analyses per Day</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analyses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* New users per day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">New Users per Day</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={users}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Provider distribution pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">AI Provider Usage</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <ResponsiveContainer width="60%" height={160}>
                  <PieChart>
                    <Pie data={providerDist} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={65} strokeWidth={2}>
                      {providerDist.map((_: unknown, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {providerDist.map((p: any, i: number) => (
                    <div key={p.name} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="capitalize flex-1">{p.name}</span>
                      <span className="text-muted-foreground tabular-nums">{p.count}</span>
                    </div>
                  ))}
                  {!providerDist.length && <p className="text-xs text-muted-foreground">No data yet</p>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Top repositories */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Repositories</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={topRepos} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="repo" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: adminApi.getOverview,
    refetchInterval: 30_000,
  });

  const secondsAgo = Math.floor((Date.now() - dataUpdatedAt) / 1000);

  const sparkDummy = [2, 5, 3, 8, 6, 10, 7]; // placeholder until API supports time-series

  return (
    <div className="space-y-8 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Updated {secondsAgo}s ago
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Stats grid */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={isLoading ? "—" : data?.total_users ?? 0}
          sub={`${data?.active_users_7d ?? 0} active last 7d`}
          color="bg-indigo-500/10 text-indigo-500"
          to="/admin/users"
        />
        <StatCard
          icon={Activity}
          label="Active Today"
          value={isLoading ? "—" : data?.active_users_7d ?? 0}
          color="bg-green-500/10 text-green-500"
          to="/admin/users"
        />
        <StatCard
          icon={BarChart3}
          label="Analyses 24h"
          value={isLoading ? "—" : data?.analyses_24h ?? 0}
          sub={`${data?.total_analyses ?? 0} total`}
          sparkData={sparkDummy}
          color="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          icon={MessageSquare}
          label="Total Chats"
          value={isLoading ? "—" : data?.total_chats ?? 0}
          sub={`avg ${data?.avg_followups ?? 0} per session`}
          color="bg-amber-500/10 text-amber-500"
          to="/admin/chats"
        />
      </motion.div>

      {/* Charts + sidebar */}
      <div className="grid lg:grid-cols-[1fr_220px] gap-6">
        <div className="space-y-6 min-w-0">
          <ErrorBoundary>
            <UsageCharts />
          </ErrorBoundary>

          <div className="grid lg:grid-cols-2 gap-4">
            <ErrorBoundary>
              <ActivityFeed />
            </ErrorBoundary>
            <ErrorBoundary>
              <HealthPanel />
            </ErrorBoundary>
          </div>
        </div>

        <div className="space-y-4">
          <QuickActions />
        </div>
      </div>
    </div>
  );
}
