import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Settings,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ProviderStats } from "@/types/admin.types";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

const PROVIDERS = [
  {
    id: "anthropic",
    name: "Claude",
    company: "Anthropic",
    color: "#6366f1",
    description: "claude-sonnet-4-6 — best reasoning",
  },
  {
    id: "openai",
    name: "GPT-4",
    company: "OpenAI",
    color: "#10b981",
    description: "gpt-4-turbo — broad capability",
  },
  {
    id: "gemini",
    name: "Gemini",
    company: "Google",
    color: "#f59e0b",
    description: "gemini-1.5-pro — multimodal",
  },
];

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#6366f1",
  openai: "#10b981",
  gemini: "#f59e0b",
};

type DateRange = "7d" | "30d" | "90d";

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ stats }: { stats?: ProviderStats }) {
  if (!stats) return <span className="h-2.5 w-2.5 rounded-full bg-gray-300 inline-block" />;
  if (!stats.enabled) return <span className="h-2.5 w-2.5 rounded-full bg-gray-300 inline-block" />;
  if (!stats.api_key_configured) return <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse inline-block" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />;
}

function statusLabel(stats?: ProviderStats) {
  if (!stats) return "Unknown";
  if (!stats.enabled) return "Disabled";
  if (!stats.api_key_configured) return "No API key";
  return "Configured";
}

// ── API Key Modal ─────────────────────────────────────────────────────────────

function ApiKeyModal({
  providerId,
  providerName,
  onClose,
}: {
  providerId: string;
  providerName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; latency_ms: number | null } | null>(null);

  const mutation = useMutation({
    mutationFn: () => adminApi.configureProvider(providerId, key),
    onSuccess: (data) => {
      setResult(data);
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
        toast({ title: `${providerName} API key saved` });
      }
    },
    onError: () => {
      toast({ variant: "destructive", title: "Failed to configure provider" });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {providerName} API Key</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                placeholder="sk-…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {result && (
            <div
              className={cn(
                "rounded-lg px-4 py-3 text-sm flex items-start gap-2",
                result.success ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
              )}
            >
              {result.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
              <div>
                <p className="font-medium">{result.success ? "Success" : "Failed"}</p>
                <p className="text-xs mt-0.5">{result.message}</p>
                {result.latency_ms && (
                  <p className="text-xs mt-0.5 opacity-70">{result.latency_ms}ms</p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={!key.trim() || mutation.isPending}
              className="gap-2"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Test & Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Provider Card ─────────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  stats,
  isDefault,
  onSetDefault,
}: {
  provider: (typeof PROVIDERS)[number];
  stats?: ProviderStats;
  isDefault: boolean;
  onSetDefault: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const patchMutation = useMutation({
    mutationFn: (patch: { enabled?: boolean; is_default?: boolean }) =>
      adminApi.updateProvider(provider.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  async function testConnection() {
    setTesting(true);
    try {
      const result = await adminApi.testProvider(provider.id);
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: "Request failed", latency_ms: null });
    } finally {
      setTesting(false);
    }
  }

  const enabled = stats?.enabled ?? false;
  const configured = stats?.api_key_configured ?? false;

  return (
    <>
      <motion.div variants={fadeUp} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
        <Card className={cn("h-full transition-all duration-200", !enabled && "opacity-60")}>
          <CardContent className="pt-5 pb-4 space-y-4">
            {/* Top row */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: provider.color }}
                  >
                    {provider.company[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.company}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{provider.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <StatusDot stats={stats} />
                <span className="text-xs text-muted-foreground">{statusLabel(stats)}</span>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm cursor-pointer" htmlFor={`enabled-${provider.id}`}>Enabled</Label>
                <Switch
                  id={`enabled-${provider.id}`}
                  checked={enabled}
                  onCheckedChange={(v) => patchMutation.mutate({ enabled: v })}
                  disabled={patchMutation.isPending}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Default provider</Label>
                <input
                  type="radio"
                  checked={isDefault}
                  onChange={onSetDefault}
                  disabled={!enabled || !configured}
                  className="h-4 w-4 accent-primary"
                />
              </div>
            </div>

            {/* Stats */}
            {stats && enabled && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t">
                {[
                  { icon: TrendingUp, label: "Requests", value: stats.total_requests.toLocaleString() },
                  { icon: DollarSign, label: "Cost", value: `$${stats.total_cost_usd.toFixed(2)}` },
                  { icon: Clock, label: "Avg latency", value: stats.avg_response_time_ms ? `${stats.avg_response_time_ms}ms` : "—" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-lg bg-muted/40 px-2.5 py-2">
                    <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
                      <Icon className="h-3 w-3" />
                      <span className="text-xs">{label}</span>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs gap-1"
                onClick={() => setKeyModalOpen(true)}
              >
                <Settings className="h-3.5 w-3.5" />
                {configured ? "Update Key" : "Set API Key"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={testConnection}
                disabled={!configured || !enabled || testing}
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Test
              </Button>
            </div>

            {/* Test result inline */}
            {testResult && (
              <div
                className={cn(
                  "rounded-lg px-3 py-2 text-xs flex items-start gap-2",
                  testResult.success
                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                    : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400",
                )}
              >
                {testResult.success
                  ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <div>
                  <span className="font-medium">{testResult.success ? "OK" : "Failed"}</span>
                  <span className="ml-1 opacity-80">{testResult.message}</span>
                  {testResult.latency_ms && <span className="ml-1 opacity-60">({testResult.latency_ms}ms)</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {keyModalOpen && (
        <ApiKeyModal
          providerId={provider.id}
          providerName={provider.name}
          onClose={() => setKeyModalOpen(false)}
        />
      )}
    </>
  );
}

// ── Usage Analytics ───────────────────────────────────────────────────────────

function UsageAnalytics() {
  const [range, setRange] = useState<DateRange>("30d");

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const dateFrom = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ai-usage", range],
    queryFn: () => adminApi.getUsage({ date_from: dateFrom, group_by: "day" }),
  });

  const { data: costs } = useQuery({
    queryKey: ["admin-ai-costs", range],
    queryFn: () => adminApi.getCosts({ date_from: dateFrom }),
  });

  const timeSeriesData = (data as any)?.by_provider_day ?? [];
  const costRows: any[] = (costs as any)?.by_provider ?? [];
  const responseTimeData = (data as any)?.avg_response_times ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base">Usage Analytics</h2>
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
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Requests per provider over time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Requests per Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  {PROVIDERS.map((p) => (
                    <Line key={p.id} type="monotone" dataKey={p.id} stroke={p.color} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Avg response time comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={responseTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="provider" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="avg_ms" radius={[3, 3, 0, 0]}>
                    {responseTimeData.map((entry: any, i: number) => (
                      <Cell key={i} fill={PROVIDER_COLORS[entry.provider] ?? "#888"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cost table */}
      {costRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="pb-2 text-left font-semibold">Provider</th>
                  <th className="pb-2 text-right font-semibold">Requests</th>
                  <th className="pb-2 text-right font-semibold">Avg Cost/Req</th>
                  <th className="pb-2 text-right font-semibold">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {costRows.map((row: any) => (
                  <tr key={row.provider}>
                    <td className="py-2 capitalize">{row.provider}</td>
                    <td className="py-2 text-right tabular-nums">{row.requests?.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">${row.avg_cost_per_request?.toFixed(4)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">${row.total_cost?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Fallback Config ───────────────────────────────────────────────────────────

function FallbackConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: adminApi.getSettings,
  });

  const fallbackEnabled = !!(settings?.ai_defaults as any)?.fallback_enabled;
  const fallbackOrder: string[] = (settings?.ai_defaults as any)?.fallback_order ?? ["anthropic", "openai", "gemini"];

  const mutation = useMutation({
    mutationFn: (patch: { key: string; value: unknown }) => adminApi.patchSettings(patch.key, patch.value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      toast({ title: "Settings saved" });
    },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  function moveProvider(index: number, dir: -1 | 1) {
    const newOrder = [...fallbackOrder];
    const target = index + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    mutation.mutate({ key: "ai_defaults.fallback_order", value: newOrder });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Fallback Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable automatic fallback</p>
            <p className="text-xs text-muted-foreground mt-0.5">Try providers in order if one fails</p>
          </div>
          <Switch
            checked={fallbackEnabled}
            onCheckedChange={(v) => mutation.mutate({ key: "ai_defaults.fallback_enabled", value: v })}
          />
        </div>

        {fallbackEnabled && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Priority Order</p>
            {fallbackOrder.map((id, i) => {
              const provider = PROVIDERS.find((p) => p.id === id);
              return (
                <div key={id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 bg-muted/20">
                  <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                  <div className="h-5 w-5 rounded flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: provider?.color ?? "#888" }}>
                    {provider?.company[0] ?? "?"}
                  </div>
                  <span className="text-sm font-medium flex-1">{provider?.name ?? id}</span>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveProvider(i, -1)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => moveProvider(i, 1)}
                      disabled={i === fallbackOrder.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AISettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: providers, isLoading } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: adminApi.listProviders,
    refetchInterval: 30_000,
  });

  const defaultProvider = Object.entries(providers ?? {}).find(([, s]) => s.is_default)?.[0];

  const setDefaultMutation = useMutation({
    mutationFn: (name: string) => adminApi.updateProvider(name, { is_default: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-providers"] });
      toast({ title: "Default provider updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  return (
    <div className="space-y-8 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">AI Provider Settings</h1>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-providers"] })} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Provider cards */}
      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="grid md:grid-cols-3 gap-4">
          {PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              stats={providers?.[p.id]}
              isDefault={defaultProvider === p.id}
              onSetDefault={() => setDefaultMutation.mutate(p.id)}
            />
          ))}
        </motion.div>
      )}

      <FallbackConfig />
      <UsageAnalytics />
    </div>
  );
}
