import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Code2,
  ExternalLink,
  GitFork,
  Github,
  Layers,
  Loader2,
  MessageSquare,
  Send,
  Shield,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  User,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useChatHistory } from "@/hooks/useChatHistory";
import { chatApi, reposApi } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import type { ChatMessage } from "@/types/chat.types";

// ── Animation helpers ─────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (d = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: d } }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };
const slideIn = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(n: number | null | undefined) {
  if (!n) return "text-muted-foreground";
  if (n >= 8) return "text-green-600 dark:text-green-400";
  if (n >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function CircleScore({ score, label }: { score: number | null | undefined; label: string }) {
  const val = score ?? 0;
  const radius = 32;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (val / 10) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
        <motion.circle
          cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="8"
          strokeDasharray={circ} strokeLinecap="round"
          className={scoreColor(score)}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="text-center -mt-1">
        <p className={cn("text-xl font-bold tabular-nums", scoreColor(score))}>{score ?? "—"}<span className="text-xs font-normal text-muted-foreground">/10</span></p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium tabular-nums", scoreColor(value))}>{value ?? "—"}/10</span>
      </div>
      <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }} style={{ transformOrigin: "left" }}>
        <Progress value={value ? (value / 10) * 100 : 0} className="h-2" />
      </motion.div>
    </div>
  );
}

function PriorityBadge({ label }: { label: string }) {
  const map: Record<string, string> = {
    high:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    low:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  const key = label.toLowerCase();
  return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", map[key] ?? map.low)}>{label}</span>;
}

// ── Typing dots animation ─────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-primary/60"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  function copyContent() {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div
      variants={slideIn}
      className={cn("flex gap-2.5 group", isUser && "flex-row-reverse")}
    >
      {!isUser && (
        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            <Bot className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
      )}
      <div className={cn("max-w-[80%] space-y-1", isUser && "items-end flex flex-col")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted rounded-tl-sm",
          )}
        >
          {msg.content.split("```").map((part, i) =>
            i % 2 === 1 ? (
              <pre key={i} className="mt-2 mb-1 rounded-lg bg-background/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {part}
              </pre>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </div>
        <div className={cn("flex items-center gap-2", isUser && "flex-row-reverse")}>
          <span className="text-[10px] text-muted-foreground">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={copyContent}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <ClipboardCopy className="h-3 w-3" />}
          </button>
        </div>
      </div>
      {isUser && (
        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
          <AvatarFallback className="bg-secondary text-xs">
            <User className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const SUGGESTED = [
  "What are the biggest security risks?",
  "Explain the architecture in simple terms",
  "What would you refactor first?",
  "How production-ready is this?",
];

export function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast, dismiss } = useToast();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [followupCount, setFollowupCount] = useState(0);
  const [progressValue, setProgressValue] = useState(12);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const loadingToastRef = useRef<string | number | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const { data: session, isLoading, error } = useAnalysis(id);
  const { data: history } = useChatHistory(id);

  // Seed local messages from server history
  useEffect(() => {
    if (history?.messages && localMessages.length === 0) {
      setLocalMessages(history.messages);
    }
  }, [history]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, isAiThinking]);

  useEffect(() => {
    if (!session) return;
    if (session.status === lastStatusRef.current) return;
    lastStatusRef.current = session.status;

    if (session.status === "pending" || session.status === "analyzing") {
      if (!loadingToastRef.current) {
        const { id } = toast({
          variant: "loading",
          title: "Analyzing repository...",
        });
        loadingToastRef.current = id;
        toast({
          variant: "info",
          title: "Analysis started",
          description: "This may take 30 seconds.",
        });
      }
    }

    if (session.status === "completed") {
      if (loadingToastRef.current) dismiss(loadingToastRef.current);
      loadingToastRef.current = null;
      toast({ variant: "success", title: "Analysis completed successfully" });
      trackEvent("Analysis Completed");
    }

    if (session.status === "failed") {
      if (loadingToastRef.current) dismiss(loadingToastRef.current);
      loadingToastRef.current = null;
      toast({ variant: "error", title: "Failed to analyze repository" });
      trackEvent("Error Occurred", { type: "analysis_failed" });
    }
  }, [dismiss, session, toast]);

  const deleteMutation = useMutation({
    mutationFn: () => reposApi.deleteAnalysis(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-analyses"] });
      toast({ title: "Analysis deleted" });
      navigate("/history");
    },
  });

  async function sendMessage(text: string) {
    const msg = text.trim();
    if (!msg || isAiThinking || followupCount >= 10) return;
    setChatInput("");

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: id!,
      role: "user",
      content: msg,
      tokens_used: null,
      created_at: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setIsAiThinking(true);

    try {
      const res = await chatApi.sendMessage(id!, msg);
      const aiMsg: ChatMessage = {
        id: res.message_id,
        session_id: id!,
        role: "assistant",
        content: res.response,
        tokens_used: null,
        created_at: new Date().toISOString(),
      };
      setLocalMessages((prev) => [...prev, aiMsg]);
      setFollowupCount(res.followup_count);
      queryClient.invalidateQueries({ queryKey: ["chat-history", id] });
      trackEvent("Follow-up Question Sent");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 429) {
        toast({ variant: "warning", title: "Follow-up limit reached", description: detail });
      } else {
        toast({ variant: "error", title: "Failed to send message" });
        setLocalMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      }
    } finally {
      setIsAiThinking(false);
    }
  }

  // Hooks must be declared before any early returns
  const a = session?.analysis ?? null;
  const r = session?.repo_data
    ? {
        full_name: String(session.repo_data.metadata?.full_name ?? session.repo_name),
        description: typeof session.repo_data.metadata?.description === "string" ? session.repo_data.metadata.description : null,
        language: typeof session.repo_data.metadata?.language === "string" ? session.repo_data.metadata.language : null,
        stars: typeof session.repo_data.metadata?.stars === "number" ? session.repo_data.metadata.stars : null,
        forks: typeof session.repo_data.metadata?.forks === "number" ? session.repo_data.metadata.forks : null,
        topics: Array.isArray(session.repo_data.metadata?.topics) ? session.repo_data.metadata.topics : [],
      }
    : null;
  const techStack = useMemo(() => {
    if (!a?.tech_stack) return [];
    return Object.values(a.tech_stack).flatMap((value) =>
      Array.isArray(value) ? value.map(String) : value ? [String(value)] : [],
    );
  }, [a?.tech_stack]);
  const inProgress = !!(session && (session.status === "pending" || session.status === "analyzing"));
  const remaining = Math.max(0, 10 - followupCount);

  useEffect(() => {
    if (!inProgress) return;
    const interval = setInterval(() => {
      setProgressValue((prev) => (prev >= 90 ? 20 : prev + 7));
    }, 1200);
    return () => clearInterval(interval);
  }, [inProgress]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="space-y-4 page-enter">
      <Skeleton className="h-10 w-64" />
      <div className="grid lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-[600px] rounded-2xl" />
      </div>
    </div>
  );

  if (error || !session) return (
    <Alert variant="destructive">
      <XCircle className="h-4 w-4" />
      <AlertTitle>Failed to load analysis</AlertTitle>
      <AlertDescription>The session may have been deleted or you don't have access.</AlertDescription>
    </Alert>
  );

  return (
    <div className="space-y-5 page-enter">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="flex items-start gap-3">
        <motion.div variants={fadeUp}>
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 -ml-1">
            <Link to="/history"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
        </motion.div>
        <motion.div variants={fadeUp} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-bold text-xl truncate">{session.repo_name}</h1>
            <a href={session.repo_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="h-4 w-4" />
            </a>
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
              session.status === "completed" ? "bg-green-100 text-green-700" :
              session.status === "failed"    ? "bg-red-100 text-red-700" :
              "bg-amber-100 text-amber-700")}>
              {inProgress && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
              {session.status}
            </span>
            <Badge variant="outline" className="text-xs">{session.ai_provider}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(session.created_at).toLocaleString()} {session.completed_at && `· completed ${new Date(session.completed_at).toLocaleString()}`}
          </p>
        </motion.div>
        <motion.div variants={fadeUp} className="flex gap-2 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(window.location.href); toast({ variant: "success", title: "Link copied" }); }}>
            <ClipboardCopy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete analysis" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </motion.div>
      </motion.div>

      {/* ── In-progress state ───────────────────────────────────────────────── */}
      {inProgress && (
        <Card>
          <CardContent className="py-14 flex flex-col items-center gap-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-brand-soft border flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <motion.div className="absolute inset-0 rounded-2xl border-2 border-primary/40" animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2, repeat: Infinity }} />
            </div>
            <div className="text-center">
              <p className="font-semibold">AI is analyzing the repository…</p>
              <p className="text-sm text-muted-foreground mt-1">This usually takes 20–60 seconds</p>
            </div>
            <div className="w-full max-w-sm space-y-2">
              <Progress value={progressValue} className="h-2" />
              <div className="flex justify-center">
                <LoadingSpinner size="sm" brand label="Analyzing" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {inProgress && r && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start gap-3">
              <Github className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold">{r.full_name ?? session.repo_name}</p>
                {r.description && <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              {r.language && <span className="flex items-center gap-1.5"><span className="status-dot bg-indigo-500" />{r.language}</span>}
              {r.stars != null && <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{r.stars.toLocaleString()}</span>}
              {r.forks != null && <span className="flex items-center gap-1"><GitFork className="h-3.5 w-3.5" />{r.forks.toLocaleString()}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {session.status === "failed" && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>{session.error_message ?? "An unexpected error occurred."}</AlertDescription>
        </Alert>
      )}

      {/* ── Completed view ──────────────────────────────────────────────────── */}
      {session.status === "completed" && a && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
          {/* Left column */}
          <div className="space-y-5 min-w-0">
            {/* Repo overview */}
            {r && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <Card>
                  <CardContent className="pt-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <Github className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold">{r.full_name ?? session.repo_name}</p>
                        {r.description && <p className="text-sm text-muted-foreground mt-0.5">{r.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      {r.language && <span className="flex items-center gap-1.5"><span className="status-dot bg-indigo-500" />{r.language}</span>}
                      {r.stars != null && <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{r.stars.toLocaleString()}</span>}
                      {r.forks != null && <span className="flex items-center gap-1"><GitFork className="h-3.5 w-3.5" />{r.forks.toLocaleString()}</span>}
                    </div>
                    {r.topics?.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {r.topics.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Score summary row */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex justify-around flex-wrap gap-6">
                    <CircleScore score={a.complexity_score} label="Complexity" />
                    <CircleScore score={a.code_quality_score} label="Code Quality" />
                    <CircleScore score={a.security_score} label="Security" />
                    <CircleScore score={a.maintainability_score} label="Maintainability" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Tabs */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
              <Tabs defaultValue="summary">
                <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap gap-1 bg-transparent p-0 mb-4">
                  {[
                    { value: "summary",     icon: Sparkles, label: "Summary" },
                    { value: "techstack",   icon: Code2,    label: "Tech Stack" },
                    { value: "architecture",icon: Layers,   label: "Architecture" },
                    { value: "quality",     icon: TrendingUp, label: "Quality" },
                    { value: "recs",        icon: Wrench,   label: "Recommendations" },
                  ].map(({ value, icon: Icon, label }) => (
                    <TabsTrigger key={value} value={value} className="rounded-lg border text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-transparent">
                      <Icon className="h-3.5 w-3.5 mr-1.5" />{label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* Summary */}
                <TabsContent value="summary">
                  <Card><CardContent className="pt-5">
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="text-sm leading-relaxed text-muted-foreground">
                      {a.summary ?? "No summary available."}
                    </motion.p>
                    {a.complexity_explanation && (
                      <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs font-medium mb-1">Complexity note</p>
                        <p className="text-xs text-muted-foreground">{a.complexity_explanation}</p>
                      </div>
                    )}
                  </CardContent></Card>
                </TabsContent>

                {/* Tech stack */}
                <TabsContent value="techstack">
                  <Card><CardContent className="pt-5">
                    {techStack.length ? (
                      <motion.div initial="hidden" animate="visible" variants={stagger} className="flex flex-wrap gap-2">
                        {techStack.map((t) => (
                          <motion.div key={t} variants={fadeUp} whileHover={{ scale: 1.05 }} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 text-sm font-medium">
                            <Code2 className="h-3.5 w-3.5 text-primary/70" />{t}
                          </motion.div>
                        ))}
                      </motion.div>
                    ) : <p className="text-sm text-muted-foreground">No tech stack data.</p>}
                  </CardContent></Card>
                </TabsContent>

                {/* Architecture */}
                <TabsContent value="architecture">
                  <Card><CardContent className="pt-5 space-y-3">
                    {a.architecture ? (
                      Object.entries(a.architecture as Record<string, unknown>).map(([k, v]) => (
                        <ExpandableSection key={k} title={k}>
                          <p className="text-sm text-muted-foreground">{String(v)}</p>
                        </ExpandableSection>
                      ))
                    ) : <p className="text-sm text-muted-foreground">No architecture data.</p>}
                  </CardContent></Card>
                </TabsContent>

                {/* Code quality */}
                <TabsContent value="quality">
                  <Card><CardContent className="pt-5 space-y-5">
                    <div className="space-y-4">
                      <ProgressMetric label="Code Quality"    value={a.code_quality_score} />
                      <ProgressMetric label="Security"        value={a.security_score} />
                      <ProgressMetric label="Maintainability" value={a.maintainability_score} />
                    </div>
                    {a.code_quality && Object.entries(a.code_quality as Record<string, unknown>).length > 0 && (
                      <div className="space-y-2">
                        {Object.entries(a.code_quality as Record<string, unknown>).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                            <span><span className="font-medium">{k}:</span> <span className="text-muted-foreground">{String(v)}</span></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent></Card>
                </TabsContent>

                {/* Recommendations */}
                <TabsContent value="recs">
                  <Card><CardContent className="pt-5">
                    {a.recommendations?.length ? (
                      <motion.ol initial="hidden" animate="visible" variants={stagger} className="space-y-3">
                        {a.recommendations.map((rec: string, i: number) => {
                          const priority = i < 2 ? "high" : i < 4 ? "medium" : "low";
                          return (
                            <motion.li key={i} variants={fadeUp} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                              <span className="text-sm font-bold text-muted-foreground/50 tabular-nums mt-0.5 min-w-[1.5rem]">{String(i + 1).padStart(2, "0")}</span>
                              <p className="flex-1 text-sm">{rec}</p>
                              <PriorityBadge label={priority} />
                            </motion.li>
                          );
                        })}
                      </motion.ol>
                    ) : <p className="text-sm text-muted-foreground">No recommendations.</p>}
                  </CardContent></Card>
                </TabsContent>
              </Tabs>
            </motion.div>
          </div>

          {/* ── Chat sidebar ─────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="lg:sticky lg:top-20 flex flex-col gap-0 rounded-2xl border bg-card shadow-card overflow-hidden"
            style={{ maxHeight: "calc(100vh - 96px)" }}
          >
            {/* Chat header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <div className="h-7 w-7 rounded-lg bg-gradient-brand-soft border flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none">Ask AI</p>
                <p className="text-xs text-muted-foreground mt-0.5">{remaining}/10 questions remaining</p>
              </div>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <div key={i} className={cn("w-1.5 h-1.5 rounded-full", i < remaining ? "bg-primary/60" : "bg-muted-foreground/20")} />
                ))}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
              {localMessages.length === 0 && !isAiThinking && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
                  <div className="w-12 h-12 rounded-xl bg-gradient-brand-soft border flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Ask anything about this repo</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Architecture, security, how to contribute…</p>
                  </div>
                </div>
              )}
              <AnimatePresence initial={false}>
                {localMessages.map((m) => <ChatBubble key={m.id} msg={m} />)}
                {isAiThinking && (
                  <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2.5">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs"><Bot className="h-3.5 w-3.5" /></AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-2xl rounded-tl-sm">
                      <TypingDots />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={chatEndRef} />
            </div>

            {/* Suggested questions */}
            {localMessages.length === 0 && (
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
                {SUGGESTED.slice(0, 2).map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    disabled={isAiThinking || remaining === 0}
                    className="shrink-0 text-xs border rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-3 border-t space-y-2">
              <div className="flex gap-2">
                <Textarea
                  placeholder={remaining === 0 ? "Follow-up limit reached" : "Ask about this repository…"}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(chatInput); } }}
                  disabled={isAiThinking || remaining === 0}
                  className="min-h-[70px] text-sm resize-none"
                  maxLength={1000}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{chatInput.length}/1000</span>
                <Button
                  size="sm"
                  onClick={() => sendMessage(chatInput)}
                  disabled={!chatInput.trim() || isAiThinking || remaining === 0}
                  className="gap-1.5"
                >
                  {isAiThinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Confirm delete ──────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete analysis?"
        description={`This will permanently remove the analysis for "${session.repo_name}" and all chat messages.`}
        confirmLabel="Delete"
        onConfirm={() => { deleteMutation.mutate(); setDeleteOpen(false); }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Expandable section ────────────────────────────────────────────────────────

function ExpandableSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors">
        <span className="capitalize">{title.replace(/_/g, " ")}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t bg-muted/20">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
