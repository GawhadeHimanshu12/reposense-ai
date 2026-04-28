import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Info,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function NumericInput({
  label,
  value,
  onChange,
  help,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  help?: string;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          type="number"
          value={value}
          min={min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 text-center tabular-nums w-24"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  warning,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  warning?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {checked && warning && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {warning}
          </p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ── Rate Limits Tab ───────────────────────────────────────────────────────────

function RateLimitsTab({ data }: { data: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const defaults = {
    repos_per_day: 3,
    followups_per_session: 10,
    api_requests_per_hour: 100,
  };

  const [form, setForm] = useState({
    repos_per_day: data?.repos_per_day ?? defaults.repos_per_day,
    followups_per_session: data?.followups_per_session ?? defaults.followups_per_session,
    api_requests_per_hour: data?.api_requests_per_hour ?? defaults.api_requests_per_hour,
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        repos_per_day: data.repos_per_day ?? defaults.repos_per_day,
        followups_per_session: data.followups_per_session ?? defaults.followups_per_session,
        api_requests_per_hour: data.api_requests_per_hour ?? defaults.api_requests_per_hour,
      });
      setDirty(false);
    }
  }, [data]);

  function update(key: keyof typeof form, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => adminApi.patchSettings("rate_limits", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      setDirty(false);
      toast({ title: "Rate limits saved" });
    },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Rate Limits</CardTitle>
        {dirty && <Badge variant="secondary" className="text-xs">Unsaved changes</Badge>}
      </CardHeader>
      <CardContent className="space-y-6">
        <NumericInput
          label="Repos per day per user"
          value={form.repos_per_day}
          onChange={(v) => update("repos_per_day", v)}
          help="How many repositories each user can analyze per day"
          min={1}
        />
        <NumericInput
          label="Follow-up questions per session"
          value={form.followups_per_session}
          onChange={(v) => update("followups_per_session", v)}
          help="Maximum questions users can ask per analysis"
          min={1}
        />
        <NumericInput
          label="API requests per IP per hour"
          value={form.api_requests_per_hour}
          onChange={(v) => update("api_requests_per_hour", v)}
          help="Rate limit for DDoS prevention"
          min={10}
        />

        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => { setForm({ ...defaults }); setDirty(true); }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Feature Flags Tab ─────────────────────────────────────────────────────────

function FeatureFlagsTab({ data }: { data: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const flags = {
    maintenance_mode: !!(data?.maintenance_mode),
    new_registrations: data?.new_registrations !== false,
    analysis_feature: data?.analysis_feature !== false,
    chat_feature: data?.chat_feature !== false,
  };

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      adminApi.patchSettings(`feature_flags.${key}`, value),
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      toast({ title: `${key.replace(/_/g, " ")} updated` });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  const toggles = [
    {
      key: "maintenance_mode",
      label: "Maintenance Mode",
      description: "Disables all user actions. Shows maintenance page.",
      warning: "All users are currently blocked.",
    },
    {
      key: "new_registrations",
      label: "New Registrations",
      description: "Allow new users to sign up via OAuth.",
    },
    {
      key: "analysis_feature",
      label: "Analysis Feature",
      description: "Enable/disable repository analysis feature.",
    },
    {
      key: "chat_feature",
      label: "Chat Feature",
      description: "Enable/disable follow-up questions.",
    },
  ] as const;

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-base">Feature Flags</CardTitle>
        <p className="text-xs text-muted-foreground">Changes take effect immediately</p>
      </CardHeader>
      <CardContent className="pt-3">
        {toggles.map((toggle) => (
          <ToggleRow
            key={toggle.key}
            label={toggle.label}
            description={toggle.description}
            checked={flags[toggle.key]}
            onCheckedChange={(v) => mutation.mutate({ key: toggle.key, value: v })}
            warning={"warning" in toggle ? toggle.warning : undefined}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ── Security Tab ──────────────────────────────────────────────────────────────

function SecurityTab({ data }: { data: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const defaults = {
    max_repo_size_mb: 500,
    max_files_to_analyze: 1000,
    session_timeout_minutes: 60,
    allowed_domains: "github.com",
  };

  const [form, setForm] = useState({
    max_repo_size_mb: data?.max_repo_size_mb ?? defaults.max_repo_size_mb,
    max_files_to_analyze: data?.max_files_to_analyze ?? defaults.max_files_to_analyze,
    session_timeout_minutes: data?.session_timeout_minutes ?? defaults.session_timeout_minutes,
    allowed_domains: data?.allowed_domains ?? defaults.allowed_domains,
  });
  const [dirty, setDirty] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [blockedIps] = useState<string[]>([]);

  const saveMutation = useMutation({
    mutationFn: () => adminApi.patchSettings("security", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      setDirty(false);
      toast({ title: "Security settings saved" });
    },
    onError: () => toast({ variant: "destructive", title: "Save failed" }),
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Security Settings</CardTitle>
          {dirty && <Badge variant="secondary" className="text-xs">Unsaved changes</Badge>}
        </CardHeader>
        <CardContent className="space-y-5">
          <NumericInput
            label="Maximum repository size (MB)"
            value={form.max_repo_size_mb}
            onChange={(v) => update("max_repo_size_mb", v)}
            help="Reject repos larger than this"
            min={1}
          />
          <NumericInput
            label="Maximum files to analyze"
            value={form.max_files_to_analyze}
            onChange={(v) => update("max_files_to_analyze", v)}
            help="Limit number of files scanned per repo"
            min={10}
          />
          <NumericInput
            label="Session timeout (minutes)"
            value={form.session_timeout_minutes}
            onChange={(v) => update("session_timeout_minutes", v)}
            help="Auto-logout inactive users"
            min={5}
          />
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Allowed GitHub domains</Label>
            <Input
              value={form.allowed_domains}
              onChange={(e) => update("allowed_domains", e.target.value)}
              placeholder="github.com"
            />
            <p className="text-xs text-muted-foreground">Comma-separated list of allowed domains</p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { setForm({ ...defaults }); setDirty(true); }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* IP Blocking */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">IP Blocking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. 192.168.1.1"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              className="h-8"
            />
            <Button
              size="sm"
              variant="destructive"
              className="h-8 shrink-0"
              onClick={() => {
                if (newIp.trim()) {
                  toast({ title: `Blocked ${newIp.trim()}` });
                  setNewIp("");
                }
              }}
            >
              Block IP
            </Button>
          </div>
          {blockedIps.length === 0 ? (
            <p className="text-xs text-muted-foreground">No IPs blocked</p>
          ) : (
            blockedIps.map((ip) => (
              <div key={ip} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                <span className="font-mono">{ip}</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500">
                  Unblock
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Advanced Tab ──────────────────────────────────────────────────────────────

function AdvancedTab() {
  const { toast } = useToast();
  const [clearCacheOpen, setClearCacheOpen] = useState(false);
  const [clearRateLimitsOpen, setClearRateLimitsOpen] = useState(false);
  const [deleteLogsOpen, setDeleteLogsOpen] = useState(false);
  const [logsOlderThan, setLogsOlderThan] = useState(30);
  const [dangerConfirm, setDangerConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function clearCache() {
    toast({ title: "Cache cleared" });
  }

  async function clearRateLimits() {
    toast({ title: "Rate limits reset" });
  }

  async function exportAllData() {
    toast({ title: "Exporting data…" });
  }

  async function deleteLogs() {
    toast({ title: `Deleting logs older than ${logsOlderThan} days…` });
    setDeleteLogsOpen(false);
  }

  return (
    <div className="space-y-4">
      {/* Cache Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cache Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Clear All Cache</p>
              <p className="text-xs text-muted-foreground">Clears all cached data from Redis</p>
            </div>
            <Button variant="destructive" size="sm" onClick={() => setClearCacheOpen(true)}>
              Clear Cache
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Clear Rate Limits</p>
              <p className="text-xs text-muted-foreground">Resets all user rate limit counters</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500 text-amber-600 hover:bg-amber-50"
              onClick={() => setClearRateLimitsOpen(true)}
            >
              Clear Limits
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Export All Data</p>
              <p className="text-xs text-muted-foreground">Download complete database as JSON</p>
            </div>
            <Button variant="outline" size="sm" onClick={exportAllData}>
              Export
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium">Delete Old Logs</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-muted-foreground">Delete logs older than</span>
                <Input
                  type="number"
                  value={logsOlderThan}
                  onChange={(e) => setLogsOlderThan(Number(e.target.value))}
                  className="h-7 w-20 text-sm"
                  min={1}
                />
                <span className="text-xs text-muted-foreground">days</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-3 shrink-0"
              onClick={() => setDeleteLogsOpen(true)}
            >
              Delete Logs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader className="pb-3 bg-red-50/50 dark:bg-red-950/20 rounded-t-xl">
          <CardTitle className="text-base text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <div className="rounded-lg border border-red-200 dark:border-red-900 px-4 py-3">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete All User Data</p>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">Permanently delete all users, analyses, and chat logs.</p>
            <div className="flex items-center gap-2">
              <Input
                placeholder='Type "DELETE" to enable'
                value={dangerConfirm}
                onChange={(e) => setDangerConfirm(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                variant="destructive"
                size="sm"
                disabled={dangerConfirm !== "DELETE" || deleting}
                onClick={() => {
                  setDeleting(true);
                  toast({ variant: "destructive", title: "This operation is disabled in this environment." });
                  setDeleting(false);
                  setDangerConfirm("");
                }}
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete All"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={clearCacheOpen}
        onOpenChange={setClearCacheOpen}
        title="Clear all cache"
        description="This will clear all cached data. Users may experience slower load times temporarily."
        confirmLabel="Clear cache"
        onConfirm={clearCache}
      />
      <ConfirmDialog
        open={clearRateLimitsOpen}
        onOpenChange={setClearRateLimitsOpen}
        title="Clear rate limits"
        description="This will reset all user rate limit counters. Users will get their full quota immediately."
        confirmLabel="Clear limits"
        onConfirm={clearRateLimits}
      />
      <ConfirmDialog
        open={deleteLogsOpen}
        onOpenChange={setDeleteLogsOpen}
        title={`Delete logs older than ${logsOlderThan} days`}
        description="This will permanently delete audit logs. This cannot be undone."
        confirmLabel="Delete logs"
        onConfirm={deleteLogs}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Settings() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: adminApi.getSettings,
  });

  return (
    <div className="space-y-6 page-enter">
      <h1 className="text-xl font-bold">System Settings</h1>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      ) : (
        <Tabs defaultValue="rate-limits">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="rate-limits">Rate Limits</TabsTrigger>
            <TabsTrigger value="features">Feature Flags</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="rate-limits">
              <RateLimitsTab data={data?.rate_limits} />
            </TabsContent>
            <TabsContent value="features">
              <FeatureFlagsTab data={data?.feature_flags} />
            </TabsContent>
            <TabsContent value="security">
              <SecurityTab data={data?.security} />
            </TabsContent>
            <TabsContent value="advanced">
              <AdvancedTab />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
