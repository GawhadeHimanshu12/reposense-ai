import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Download,
  Github,
  Grid3X3,
  History,
  Loader2,
  Search,
  SlidersHorizontal,
  Trash2,
  List,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
} from "lucide-react";
import { FixedSizeList as VirtualList } from "react-window";
import { useState, useMemo, useCallback, memo } from "react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMyAnalyses } from "@/hooks/useAnalysis";
import { useDebounce } from "@/hooks/useDebounce";
import { reposApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AnalysisSessionSummary } from "@/types/analysis.types";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};

function statusColor(s: string) {
  if (s === "completed") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (s === "failed") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (s === "analyzing") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
}

type SortField = "created_at" | "repo_name" | "status" | "ai_provider";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "grid";

const DATE_RANGES = [
  { label: "All time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
];

function withinRange(dateStr: string, range: string): boolean {
  if (range === "all") return true;
  const date = new Date(dateStr);
  const now = new Date();
  const msPerDay = 86_400_000;
  if (range === "today") return date.toDateString() === now.toDateString();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return now.getTime() - date.getTime() <= days * msPerDay;
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
  return sortDir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-primary" />
    : <ArrowDown className="h-3.5 w-3.5 text-primary" />;
}

const TableRow = memo(function TableRow({
  s,
  selected,
  onToggle,
  onPrefetch,
}: {
  s: AnalysisSessionSummary;
  selected: boolean;
  onToggle: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  return (
    <motion.tr
      variants={fadeUp}
      className={cn(
        "border-b last:border-0 transition-colors hover:bg-muted/30",
        selected && "bg-primary/5"
      )}
    >
      <td className="px-4 py-3 w-10">
        <button
          onClick={() => onToggle(s.session_id)}
          className="text-muted-foreground hover:text-primary transition-colors"
          aria-label={selected ? "Deselect analysis" : "Select analysis"}
        >
          {selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
        </button>
      </td>
      <td className="px-4 py-3 max-w-[200px]">
        <div className="flex items-center gap-2">
          <Github className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{s.repo_name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
        {new Date(s.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
      <td className="px-4 py-3">
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(s.status))}>
          {s.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="text-xs">{s.ai_provider}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-7 text-xs gap-1"
          onMouseEnter={() => onPrefetch(s.session_id)}
        >
          <Link to={`/analysis/${s.session_id}`}>
            View <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      </td>
    </motion.tr>
  );
});

const GridCard = memo(function GridCard({
  s,
  selected,
  onToggle,
  onPrefetch,
}: {
  s: AnalysisSessionSummary;
  selected: boolean;
  onToggle: (id: string) => void;
  onPrefetch: (id: string) => void;
}) {
  return (
    <motion.div variants={fadeUp} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      <Card className={cn("h-full hover:shadow-card-hover transition-all duration-200", selected && "ring-2 ring-primary")}>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Github className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm font-semibold truncate">{s.repo_name}</p>
            </div>
            <button
              onClick={() => onToggle(s.session_id)}
              className="text-muted-foreground hover:text-primary transition-colors shrink-0"
              aria-label={selected ? "Deselect analysis" : "Select analysis"}
            >
              {selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(s.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <div className="flex gap-2 flex-wrap">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(s.status))}>
              {s.status}
            </span>
            <Badge variant="outline" className="text-xs">{s.ai_provider}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="w-full gap-1 text-xs group-hover:bg-primary/10"
            onMouseEnter={() => onPrefetch(s.session_id)}
          >
            <Link to={`/analysis/${s.session_id}`}>
              View details <ChevronRight className="h-3 w-3" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
});

function RowSkeleton() {
  return (
    <tr className="border-b">
      <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-20 rounded-full" /></td>
      <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
      <td className="px-4 py-3"><Skeleton className="h-7 w-16 ml-auto rounded" /></td>
    </tr>
  );
}

export function HistoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: analyses, isLoading } = useMyAnalyses(0, 100);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const providers = useMemo(() => {
    const set = new Set(analyses?.map((a) => a.ai_provider) ?? []);
    return Array.from(set);
  }, [analyses]);

  const filtered = useMemo(() => {
    if (!analyses) return [];
    return analyses
      .filter((a) => {
        const matchSearch = !debouncedSearch || a.repo_name.toLowerCase().includes(debouncedSearch.toLowerCase());
        const matchStatus = statusFilter === "all" || a.status === statusFilter;
        const matchProvider = providerFilter === "all" || a.ai_provider === providerFilter;
        const matchDate = withinRange(a.created_at, dateRange);
        return matchSearch && matchStatus && matchProvider && matchDate;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === "created_at") cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        else if (sortField === "repo_name") cmp = a.repo_name.localeCompare(b.repo_name);
        else if (sortField === "status") cmp = a.status.localeCompare(b.status);
        else if (sortField === "ai_provider") cmp = a.ai_provider.localeCompare(b.ai_provider);
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [analyses, debouncedSearch, statusFilter, providerFilter, dateRange, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const prefetchAnalysis = useCallback((id: string) => {
    queryClient.prefetchQuery({
      queryKey: ["analysis", id],
      queryFn: () => reposApi.getAnalysis(id),
      staleTime: 60_000,
    });
  }, [queryClient]);

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((a) => a.session_id)));
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reposApi.deleteAnalysis(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-analyses"] });
      toast({ title: "Analysis deleted" });
    },
    onError: () => toast({ variant: "destructive", title: "Delete failed" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await reposApi.deleteAnalysis(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-analyses"] });
      setSelected(new Set());
      toast({ title: `Deleted ${selected.size} analyses` });
    },
    onError: () => toast({ variant: "destructive", title: "Bulk delete failed" }),
  });

  function handleExport() {
    const toExport = filtered.filter((a) => selected.size === 0 || selected.has(a.session_id));
    const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reposense-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ variant: "success", title: "Export ready" });
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="space-y-6 page-enter">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold">Analysis History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "Loading…" : `${filtered.length} of ${analyses?.length ?? 0} analyses`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          {selected.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkDeleteMutation.isPending}
              className="gap-2"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete {selected.size}
            </Button>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Search repositories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-9">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="analyzing">Analyzing</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex border rounded-lg overflow-hidden h-9" role="group" aria-label="View mode">
            <button
              onClick={() => setView("table")}
              aria-label="Table view"
              className={cn(
                "px-2.5 flex items-center transition-colors",
                view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={cn(
                "px-2.5 flex items-center transition-colors",
                view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Content */}
      {isLoading ? (
        view === "table" ? (
          <Card>
            <table className="w-full">
              <tbody>
                {[...Array(6)].map((_, i) => <RowSkeleton key={i} />)}
              </tbody>
            </table>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i}><CardContent className="pt-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-24" />
                <div className="flex gap-2"><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></div>
                <Skeleton className="h-8 w-full rounded-lg" />
              </CardContent></Card>
            ))}
          </div>
        )
      ) : !filtered.length ? (
        <EmptyState
          icon={History}
          title={analyses?.length ? "No matches" : "No analyses yet"}
          description={analyses?.length ? "Try adjusting your filters." : "Analyze a repository to see it here."}
        />
      ) : view === "table" ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              {filtered.length > 50 ? (
                <div role="table" className="min-w-[800px]">
                  <div role="row" className="grid grid-cols-[40px_1fr_140px_120px_140px_80px] border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <div className="px-4 py-3">
                      <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Select all">
                        {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    </div>
                    {(
                      [
                        { label: "Repository", field: "repo_name" },
                        { label: "Date", field: "created_at" },
                        { label: "Status", field: "status" },
                        { label: "Provider", field: "ai_provider" },
                      ] as { label: string; field: SortField }[]
                    ).map(({ label, field }) => (
                      <button
                        key={field}
                        className="px-4 py-3 text-left hover:text-foreground transition-colors"
                        onClick={() => toggleSort(field)}
                      >
                        <div className="flex items-center gap-1.5">
                          {label}
                          <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
                        </div>
                      </button>
                    ))}
                    <div className="px-4 py-3" />
                  </div>
                  <VirtualList
                    height={Math.min(560, filtered.length * 56)}
                    itemCount={filtered.length}
                    itemSize={56}
                    width="100%"
                  >
                    {({ index, style }: { index: number; style: React.CSSProperties }) => {
                      const item = filtered[index];
                      return (
                        <div style={style} className={cn("grid grid-cols-[40px_1fr_140px_120px_140px_80px] border-b", selected.has(item.session_id) && "bg-primary/5")}>
                          <div className="px-4 py-3">
                            <button
                              onClick={() => toggleSelect(item.session_id)}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              aria-label="Select row"
                            >
                              {selected.has(item.session_id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                            </button>
                          </div>
                          <div className="px-4 py-3 text-sm font-medium truncate">{item.repo_name}</div>
                          <div className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </div>
                          <div className="px-4 py-3">
                            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(item.status))}>
                              {item.status}
                            </span>
                          </div>
                          <div className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">{item.ai_provider}</Badge>
                          </div>
                          <div className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onMouseEnter={() => prefetchAnalysis(item.session_id)}
                              asChild
                            >
                              <Link to={`/analysis/${item.session_id}`}>
                                View <ChevronRight className="h-3 w-3" />
                              </Link>
                            </Button>
                          </div>
                        </div>
                      );
                    }}
                  </VirtualList>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-3 w-10">
                        <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Select all">
                          {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </button>
                      </th>
                      {(
                        [
                          { label: "Repository", field: "repo_name" },
                          { label: "Date", field: "created_at" },
                          { label: "Status", field: "status" },
                          { label: "Provider", field: "ai_provider" },
                        ] as { label: string; field: SortField }[]
                      ).map(({ label, field }) => (
                        <th
                          key={field}
                          className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition-colors"
                          onClick={() => toggleSort(field)}
                        >
                          <div className="flex items-center gap-1.5">
                            {label}
                            <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
                          </div>
                        </th>
                      ))}
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <motion.tbody initial="hidden" animate="visible" variants={stagger}>
                    <AnimatePresence>
                      {filtered.map((s) => (
                        <TableRow
                          key={s.session_id}
                          s={s}
                          selected={selected.has(s.session_id)}
                          onToggle={toggleSelect}
                          onPrefetch={prefetchAnalysis}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.tbody>
                </table>
              )}
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {filtered.map((s) => (
            <GridCard
              key={s.session_id}
              s={s}
              selected={selected.has(s.session_id)}
              onToggle={toggleSelect}
              onPrefetch={prefetchAnalysis}
            />
          ))}
        </motion.div>
      )}

      {/* Single delete dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete analysis"
        description="This analysis will be permanently deleted."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      {/* Bulk delete dialog */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selected.size} analyses`}
        description="All selected analyses will be permanently deleted."
        confirmLabel="Delete all"
        onConfirm={() => {
          bulkDeleteMutation.mutate(Array.from(selected));
          setBulkDeleteOpen(false);
        }}
      />
    </div>
  );
}
