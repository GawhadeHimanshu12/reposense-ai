import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { RefreshCw, Shield } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function actionColor(action: string) {
  if (action.includes("delete")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (action.includes("ban")) return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  if (action.includes("admin") || action.includes("privilege")) return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
  return "bg-muted text-muted-foreground";
}

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");

  const skip = (page - 1) * PAGE_SIZE;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-audit", actionFilter, dateFrom, skip],
    queryFn: () =>
      adminApi.listAudit({
        action_type: actionFilter !== "all" ? actionFilter : undefined,
        date_from: dateFrom || undefined,
        skip,
        limit: PAGE_SIZE,
      }),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Audit Logs</h1>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[150px] text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="delete">Deletes</SelectItem>
            <SelectItem value="ban">Bans</SelectItem>
            <SelectItem value="admin">Admin changes</SelectItem>
            <SelectItem value="settings">Settings</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-9 text-sm w-40"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : !data?.items.length ? (
        <EmptyState icon={Shield} title="No audit logs" description="Admin actions will appear here." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Admin", "Action", "Target", "IP", "Time"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
              >
                {data.items.map((entry) => (
                  <motion.tr
                    key={entry.id}
                    variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{entry.admin_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{entry.admin_email ?? "system"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", actionColor(entry.action))}>
                        {entry.action.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {entry.target_type && (
                        <span className="capitalize">{entry.target_type}</span>
                      )}
                      {entry.target_id && (
                        <span className="text-xs ml-1 opacity-60">{entry.target_id.slice(0, 8)}…</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono text-xs">
                      {entry.ip_address ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap" title={new Date(entry.created_at).toLocaleString()}>
                      {relativeTime(entry.created_at)}
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        </Card>
      )}

      {data && data.total > PAGE_SIZE && (
        <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    </div>
  );
}
