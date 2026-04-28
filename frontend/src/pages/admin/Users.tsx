import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckSquare,
  ChevronDown,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AdminUserDetail, AdminUserSummary } from "@/types/admin.types";

const PAGE_SIZE = 25;

type SortField = "email" | "created_at" | "last_login" | "analyses_count";
type SortDir = "asc" | "desc";

function relativeTime(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function withinDays(iso: string, days: string) {
  if (days === "all") return true;
  const d = parseInt(days, 10);
  return Date.now() - new Date(iso).getTime() <= d * 86_400_000;
}

function SortIcon({ field, active, dir }: { field: string; active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
}

// ── User Detail Modal ─────────────────────────────────────────────────────────

function UserDetailModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const { data: user, isLoading } = useQuery({
    queryKey: ["admin-user", userId],
    queryFn: () => adminApi.getUser(userId),
  });

  const patchMutation = useMutation({
    mutationFn: (patch: { is_admin?: boolean; is_banned?: boolean }) =>
      adminApi.patchUser(userId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user", userId] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User deleted" });
      onClose();
    },
    onError: () => toast({ variant: "destructive", title: "Delete failed" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : user ? (
          <div className="space-y-6">
            {/* Profile */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.avatar_url ?? undefined} />
                <AvatarFallback className="text-lg">{(user.name ?? user.email)[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-lg">{user.name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <div className="flex gap-1.5 mt-1">
                  {user.is_admin && <Badge>Admin</Badge>}
                  {user.is_banned && <Badge variant="destructive">Banned</Badge>}
                  {!user.is_admin && !user.is_banned && <Badge variant="secondary">User</Badge>}
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "User ID", value: user.id.slice(0, 8) + "…" },
                { label: "Joined", value: new Date(user.created_at).toLocaleDateString() },
                { label: "Last login", value: relativeTime(user.last_login) },
                { label: "Analyses", value: user.analyses_count },
                { label: "Chat messages", value: user.chat_messages_count },
                { label: "Google ID", value: user.google_id ? "connected" : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-medium mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {/* Recent analyses */}
            {user.analyses.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Recent Analyses</p>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {(user.analyses as any[]).map((a: any, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs">
                      <span className="truncate font-medium">{a.repo_name ?? a.repo_url ?? "—"}</span>
                      <span className="text-muted-foreground ml-2 shrink-0">{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => patchMutation.mutate({ is_admin: !user.is_admin })}
                disabled={patchMutation.isPending}
                className="gap-1.5"
              >
                <Shield className="h-3.5 w-3.5" />
                {user.is_admin ? "Remove Admin" : "Make Admin"}
              </Button>
              <Button
                variant={user.is_banned ? "outline" : "secondary"}
                size="sm"
                onClick={() => patchMutation.mutate({ is_banned: !user.is_banned })}
                disabled={patchMutation.isPending}
              >
                {user.is_banned ? "Unban User" : "Ban User"}
              </Button>

              {deleteStep === 0 ? (
                <Button variant="ghost" size="sm" className="text-red-500 gap-1.5 ml-auto" onClick={() => setDeleteStep(1)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete Account
                </Button>
              ) : (
                <div className="ml-auto flex items-center gap-2">
                  <Input
                    placeholder='Type "DELETE" to confirm'
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    className="h-8 w-48 text-xs"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteConfirm !== "DELETE" || deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate()}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setDeleteStep(0); setDeleteConfirm(""); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">User not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Users() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const skip = (page - 1) * PAGE_SIZE;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-users", search, skip, sortField, sortDir],
    queryFn: () =>
      adminApi.listUsers({
        search: search || undefined,
        skip,
        limit: PAGE_SIZE,
        sort_by: sortField,
        order: sortDir,
      }),
  });

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((u) => {
      if (roleFilter === "admin" && !u.is_admin) return false;
      if (roleFilter === "regular" && u.is_admin) return false;
      if (statusFilter === "active" && u.is_banned) return false;
      if (statusFilter === "banned" && !u.is_banned) return false;
      if (!withinDays(u.created_at, dateFilter)) return false;
      return true;
    });
  }, [data?.items, roleFilter, statusFilter, dateFilter]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
    setPage(1);
  }

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((u) => u.id)));
  }

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await adminApi.deleteUser(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSelected(new Set());
      toast({ title: `Deleted ${selected.size} users` });
    },
    onError: () => toast({ variant: "destructive", title: "Bulk delete failed" }),
  });

  function exportSelected() {
    const toExport = filtered.filter((u) => selected.size === 0 || selected.has(u.id));
    const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  const cols: { label: string; field?: SortField }[] = [
    { label: "User", field: "email" },
    { label: "Joined", field: "created_at" },
    { label: "Last Active", field: "last_login" },
    { label: "Analyses", field: "analyses_count" },
    { label: "Role" },
    { label: "" },
  ];

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Users</h1>
          {data && (
            <Badge variant="secondary" className="tabular-nums">{data.total}</Badge>
          )}
        </div>
        <div className="sm:ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 h-9 w-64"
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="regular">Regular</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="7">Last 7d</SelectItem>
              <SelectItem value="30">Last 30d</SelectItem>
              <SelectItem value="90">Last 90d</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Bulk actions bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2"
          >
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button variant="outline" size="sm" onClick={exportSelected} className="gap-1.5 h-7">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkDeleteMutation.isPending}
              className="gap-1.5 h-7"
            >
              {bulkDeleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="ml-auto h-7">
              Clear
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : !filtered.length ? (
        <EmptyState title="No users found" description="Try adjusting your filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition-colors">
                      {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  {cols.map(({ label, field }) => (
                    <th
                      key={label}
                      className={cn(
                        "px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap",
                        field && "cursor-pointer hover:text-foreground transition-colors",
                      )}
                      onClick={() => field && toggleSort(field)}
                    >
                      <div className="flex items-center gap-1.5">
                        {label}
                        {field && <SortIcon field={field} active={sortField === field} dir={sortDir} />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}>
                {filtered.map((u) => (
                  <motion.tr
                    key={u.id}
                    variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
                    className={cn(
                      "border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer",
                      selected.has(u.id) && "bg-primary/5",
                    )}
                    onClick={() => setDetailUserId(u.id)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelect(u.id)} className="text-muted-foreground hover:text-primary transition-colors">
                        {selected.has(u.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={u.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs">{(u.name ?? u.email)[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{u.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {relativeTime(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap" title={u.last_login ?? "Never"}>
                      {relativeTime(u.last_login)}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums">{u.analyses_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {u.is_admin && <Badge className="text-xs">Admin</Badge>}
                        {u.is_banned && <Badge variant="destructive" className="text-xs">Banned</Badge>}
                        {!u.is_admin && !u.is_banned && <Badge variant="secondary" className="text-xs">User</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <UserActions user={u} />
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

      {detailUserId && (
        <UserDetailModal userId={detailUserId} onClose={() => setDetailUserId(null)} />
      )}

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selected.size} users`}
        description="All selected user accounts will be permanently deleted."
        confirmLabel="Delete all"
        onConfirm={() => {
          bulkDeleteMutation.mutate(Array.from(selected));
          setBulkDeleteOpen(false);
        }}
      />
    </div>
  );
}

function UserActions({ user }: { user: AdminUserSummary }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const patchMutation = useMutation({
    mutationFn: (patch: { is_admin?: boolean; is_banned?: boolean }) =>
      adminApi.patchUser(user.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User updated" });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => adminApi.deleteUser(user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "User deleted" });
    },
    onError: () => toast({ variant: "destructive", title: "Delete failed" }),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => patchMutation.mutate({ is_admin: !user.is_admin })}>
            {user.is_admin ? "Remove admin" : "Make admin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => patchMutation.mutate({ is_banned: !user.is_banned })}>
            {user.is_banned ? "Unban" : "Ban user"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-500" onClick={() => setDeleteOpen(true)}>
            Delete account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete account"
        description={`Permanently delete ${user.email}?`}
        confirmLabel="Delete"
        onConfirm={() => { deleteMutation.mutate(); setDeleteOpen(false); }}
      />
    </>
  );
}
