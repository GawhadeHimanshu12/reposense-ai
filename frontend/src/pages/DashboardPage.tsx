import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Github,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, memo } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useMyAnalyses, useRateLimit } from "@/hooks/useAnalysis";
import { reposApi } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import type { AnalysisSessionSummary } from "@/types/analysis.types";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

function statusColor(s: string) {
  if (s === "completed") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (s === "failed")    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (s === "analyzing") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
}

const StatCard = memo(function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", color)}>
            <Icon className="h-4 w-4" />
          </div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
});

const AnalysisCard = memo(function AnalysisCard({ s }: { s: AnalysisSessionSummary }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function prefetch() {
    await queryClient.prefetchQuery({
      queryKey: ["analysis", s.session_id],
      queryFn: () => reposApi.getAnalysis(s.session_id),
      staleTime: 60_000,
    });
  }

  return (
    <motion.div variants={fadeUp} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      <Card className="group hover:shadow-card-hover transition-all duration-200 h-full flex flex-col">
        <CardContent className="pt-5 flex-1 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Github className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-tight truncate">{s.repo_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusColor(s.status))}>
              {(s.status === "analyzing" || s.status === "pending") && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
              {s.status}
            </span>
            <Badge variant="outline" className="text-xs">{s.ai_provider}</Badge>
          </div>
          <div className="mt-auto">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-xs group-hover:bg-primary/10 group-hover:text-primary transition-colors"
              onMouseEnter={prefetch}
              onClick={() => navigate(`/analysis/${s.session_id}`)}
            >
                View details <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

function CardSkeleton() {
  return (
    <Card><CardContent className="pt-5 space-y-3">
      <div className="flex gap-2"><Skeleton className="h-4 w-4 rounded mt-0.5" /><div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-24" /></div></div>
      <div className="flex gap-2"><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></div>
      <Skeleton className="h-8 w-full rounded-lg" />
    </CardContent></Card>
  );
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { toast, dismiss } = useToast();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [validated, setValidated] = useState<boolean | null>(null);
  const [validating, setValidating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadingToastRef = useRef<string | number | null>(null);
  const warnedRef = useRef(false);

  const { data: analyses, isLoading } = useMyAnalyses(0, 9);
  const { data: rateLimit } = useRateLimit();

  const analyzeMutation = useMutation({
    mutationFn: (u: string) => reposApi.analyze(u),
    onMutate: () => {
      const { id } = toast({
        variant: "loading",
        title: "Analyzing repository...",
      });
      loadingToastRef.current = id;
      trackEvent("Analysis Started");
    },
    onSuccess: (data) => {
      if (loadingToastRef.current) dismiss(loadingToastRef.current);
      queryClient.invalidateQueries({ queryKey: ["my-analyses"] });
      queryClient.invalidateQueries({ queryKey: ["rate-limit"] });
      toast({ variant: "info", title: "Analysis started", description: "This may take 30 seconds." });
      navigate(`/analysis/${data.session_id}`);
    },
    onError: (err: any) => {
      if (loadingToastRef.current) dismiss(loadingToastRef.current);
      const detail = err?.response?.data?.detail;
      toast({ variant: "error", title: err?.response?.status === 429 ? "Rate limit reached" : "Analysis failed", description: detail ?? "Please try again." });
      trackEvent("Error Occurred", { type: "analysis_start" });
    },
  });

  function handleValidate() {
    if (!url.trim()) return;
    setValidating(true);
    setValidated(null);
    setTimeout(() => {
      const ok = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/.test(url.trim());
      setValidated(ok);
      setValidating(false);
      if (!ok) toast({ variant: "destructive", title: "Invalid URL", description: "Enter a valid github.com repository URL." });
    }, 400);
  }

  useEffect(() => {
    function handleFocus() {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("focus-analysis-input", handleFocus);
    return () => window.removeEventListener("focus-analysis-input", handleFocus);
  }, []);

  const rl = rateLimit?.repo_analysis;
  const greeting = user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  useEffect(() => {
    if (rl?.remaining === 1 && !warnedRef.current) {
      warnedRef.current = true;
      toast({ variant: "warning", title: "Rate limit", description: "1 analysis remaining today." });
    }
  }, [rl?.remaining, toast]);

  return (
    <div className="space-y-8 page-enter">
      {/* Header */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <motion.div variants={fadeUp}>
          <h1 className="text-2xl font-bold">Welcome back, {greeting}! 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{analyses?.length ?? 0} analyses so far</p>
        </motion.div>
        {rl && (
          <motion.div variants={fadeUp} className="bg-card border rounded-xl px-4 py-3 space-y-1.5 min-w-[200px]">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground font-medium">Daily analyses</span>
              <span className="font-semibold">{rl.used}/{rl.limit}</span>
            </div>
            <Progress value={(rl.used / rl.limit) * 100} className="h-1.5" />
          </motion.div>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BarChart3}     label="Total analyses"  value={analyses?.length ?? 0}                                                   color="bg-indigo-500/10 text-indigo-500" />
        <StatCard icon={CheckCircle2}  label="Completed"       value={analyses?.filter(a => a.status === "completed").length ?? 0}              color="bg-green-500/10 text-green-500" />
        <StatCard icon={MessageSquare} label="In progress"     value={analyses?.filter(a => ["analyzing","pending"].includes(a.status)).length ?? 0} color="bg-blue-500/10 text-blue-500" />
        <StatCard icon={Zap}           label="Remaining today" value={rl?.remaining ?? "—"}                                                    color="bg-amber-500/10 text-amber-500" />
      </motion.div>

      {/* New analysis */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45 }}>
        <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-brand-soft border flex items-center justify-center">
                <Plus className="h-4 w-4 text-primary" />
              </div>
              New Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9"
                  placeholder="https://github.com/owner/repository"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setValidated(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) handleValidate(); }}
                  disabled={analyzeMutation.isPending}
                  ref={inputRef}
                />
                <AnimatePresence>
                  {validated === true && (
                    <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <Button variant="outline" onClick={handleValidate} disabled={!url.trim() || validating || analyzeMutation.isPending} className="shrink-0" aria-label="Validate repository URL">
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <Button onClick={() => analyzeMutation.mutate(url.trim())} disabled={!url.trim() || analyzeMutation.isPending || rl?.remaining === 0} className="w-full gap-2 shadow-glow-sm">
              {analyzeMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</> : <><Sparkles className="h-4 w-4" />Analyze Repository</>}
            </Button>
            {rl?.remaining === 0 && <p className="text-xs text-center text-amber-600">Daily limit reached. Resets at midnight UTC.</p>}
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent analyses */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base">Recent analyses</h2>
          {(analyses?.length ?? 0) > 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/history">View all <ChevronRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          )}
        </div>
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}</div>
        ) : !analyses?.length ? (
          <EmptyState icon={Github} title="No analyses yet" description="Enter a GitHub repository URL above to get started." />
        ) : (
          <motion.div initial="hidden" animate="visible" variants={stagger} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analyses.map((s) => <AnalysisCard key={s.session_id} s={s} />)}
          </motion.div>
        )}
      </div>
    </div>
  );
}
