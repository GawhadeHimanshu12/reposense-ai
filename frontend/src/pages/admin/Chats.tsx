import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Download,
  ExternalLink,
  Github,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AdminChatSessionSummary } from "@/types/admin.types";

const PAGE_SIZE = 50;

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  openai: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  gemini: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Conversation Viewer ───────────────────────────────────────────────────────

function ConversationPanel({
  session,
  onClose,
}: {
  session: AdminChatSessionSummary;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-chat-detail", session.session_id],
    queryFn: () => adminApi.getChatDetail(session.session_id),
  });

  const messages: any[] = (data as any)?.messages ?? [];
  const tokensUsed: number = (data as any)?.total_tokens ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function exportConversation() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${session.session_id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Conversation exported" });
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-background border-l shadow-2xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b shrink-0">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-sm">{session.user_email[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{session.user_name ?? session.user_email}</p>
          <p className="text-xs text-muted-foreground truncate">{session.user_email}</p>
          <div className="flex items-center gap-2 mt-1">
            <Github className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{session.repo_name}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                <Skeleton className="h-16 w-64 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : !messages.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">No messages</p>
        ) : (
          messages.map((msg: any, i: number) => {
            const isUser = msg.role === "user";
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={cn("flex", isUser ? "justify-end" : "justify-start")}
                title={msg.created_at ? new Date(msg.created_at).toLocaleString() : ""}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm",
                  )}
                >
                  {msg.content?.includes("```") ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono overflow-x-auto">{msg.content}</pre>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t shrink-0 flex items-center justify-between gap-3 bg-muted/30">
        <p className="text-xs text-muted-foreground">
          {tokensUsed > 0 && `${tokensUsed.toLocaleString()} tokens used`}
        </p>
        <Button variant="outline" size="sm" onClick={exportConversation} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export JSON
        </Button>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Chats() {
  const { toast } = useToast();

  const [searchEmail, setSearchEmail] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    searchEmail: "",
    providerFilter: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [page, setPage] = useState(1);
  const [activeSession, setActiveSession] = useState<AdminChatSessionSummary | null>(null);
  const [exporting, setExporting] = useState(false);

  const skip = (page - 1) * PAGE_SIZE;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-chats", appliedFilters, skip],
    queryFn: () =>
      adminApi.listChats({
        skip,
        limit: PAGE_SIZE,
        ai_provider: appliedFilters.providerFilter !== "all" ? appliedFilters.providerFilter : undefined,
        date_from: appliedFilters.dateFrom || undefined,
        date_to: appliedFilters.dateTo || undefined,
      }),
  });

  function applyFilters() {
    setAppliedFilters({ searchEmail, providerFilter, dateFrom, dateTo });
    setPage(1);
  }

  function resetFilters() {
    setSearchEmail("");
    setProviderFilter("all");
    setDateFrom("");
    setDateTo("");
    setAppliedFilters({ searchEmail: "", providerFilter: "all", dateFrom: "", dateTo: "" });
    setPage(1);
  }

  async function handleExport(fmt: "json" | "csv") {
    setExporting(true);
    try {
      const blob = await adminApi.exportChats(fmt, {
        ai_provider: appliedFilters.providerFilter !== "all" ? appliedFilters.providerFilter : undefined,
        date_from: appliedFilters.dateFrom || undefined,
        date_to: appliedFilters.dateTo || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chats-export-${Date.now()}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported as ${fmt.toUpperCase()}` });
    } catch {
      toast({ variant: "destructive", title: "Export failed" });
    } finally {
      setExporting(false);
    }
  }

  const items = data?.items ?? [];
  const filteredItems = searchEmail
    ? items.filter((s) => s.user_email.toLowerCase().includes(searchEmail.toLowerCase()))
    : items;

  return (
    <div className="space-y-5 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Chat Logs</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("json")} disabled={exporting} className="gap-1.5">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={exporting} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Search email</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 h-8 w-52 text-sm"
                placeholder="user@example.com"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Provider</Label>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                <SelectItem value="anthropic">Claude</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" className="h-8 text-sm w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" className="h-8 text-sm w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={applyFilters} className="h-8">Apply</Button>
            <Button size="sm" variant="outline" onClick={resetFilters} className="h-8">Reset</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : !filteredItems.length ? (
        <EmptyState title="No chat sessions" description="Sessions appear here once users start chatting." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["User", "Repository", "Messages", "Provider", "Date", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <motion.tbody initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}>
                {filteredItems.map((s) => (
                  <motion.tr
                    key={s.session_id}
                    variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setActiveSession(s)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs">{s.user_email[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{s.user_email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Github className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate max-w-[180px]">{s.repo_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums">{s.message_count}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          PROVIDER_COLORS[s.ai_provider] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {s.ai_provider}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {relativeTime(s.created_at)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setActiveSession(s)}
                      >
                        View
                      </Button>
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

      {/* Conversation panel overlay */}
      <AnimatePresence>
        {activeSession && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setActiveSession(null)}
            />
            <ConversationPanel
              session={activeSession}
              onClose={() => setActiveSession(null)}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
