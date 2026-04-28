import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Brain,
  Code2,
  Link2,
  MessageSquare,
  Play,
  Sparkles,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandLogo, BrandMark } from "@/components/shared/BrandLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

// ── Animation variants ────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay } }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

// ── Sample code snippet for hero preview ─────────────────────────────────────

const SAMPLE = `{
  "summary": "A production-grade FastAPI backend with async PostgreSQL, JWT auth, and multi-provider AI integration.",
  "tech_stack": ["Python", "FastAPI", "PostgreSQL", "Redis", "Celery", "Docker"],
  "complexity_score": 7,
  "code_quality_score": 8,
  "security_score": 9,
  "recommendations": [
    "Add integration test suite",
    "Implement circuit breaker for AI providers",
    "Add OpenTelemetry tracing"
  ]
}`;

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain,
    title: "Deep Code Analysis",
    desc: "AI reads your entire codebase structure, architecture patterns, dependencies, and key files — not just surface-level metadata.",
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    icon: Sparkles,
    title: "AI-Powered Insights",
    desc: "Powered by Claude Sonnet, GPT-4 Turbo, and Gemini with automatic fallback. Get structured scores and actionable recommendations.",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    icon: MessageSquare,
    title: "Ask Follow-up Questions",
    desc: "Not satisfied with the summary? Ask anything about the codebase. Up to 10 follow-up questions per analysis session.",
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
  },
];

const STEPS = [
  { icon: Link2, label: "Paste GitHub URL", desc: "Any public repository — just the URL." },
  { icon: Bot, label: "AI Analyzes the Repo", desc: "Fetches code, architecture, and metrics in seconds." },
  { icon: MessageSquare, label: "Get Insights & Chat", desc: "Read the analysis, then ask anything you want." },
];

const TECH_LOGOS = ["Python", "TypeScript", "Rust", "Go", "Java", "React", "Next.js", "FastAPI", "Spring", "Django", "Vue", "Svelte", "Node.js", "Deno", "Ruby"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function InViewWrapper({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} variants={stagger} initial="hidden" animate={inView ? "visible" : "hidden"} className={className}>
      {children}
    </motion.div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LandingPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [demoOpen, setDemoOpen] = useState(false);
  const version = import.meta.env.VITE_APP_VERSION ?? "1.0.0";
  const feedbackUrl = import.meta.env.VITE_FEEDBACK_URL ?? "https://github.com/yourusername/reposense-ai/issues/new";

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 border-b glass">
        <div className="container flex h-14 items-center justify-between">
          <BrandLogo compact />
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/dashboard">Dashboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><Link to="/login">Sign in</Link></Button>
                <Button asChild size="sm"><Link to="/login">Get started</Link></Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute top-48 -left-24 w-72 h-72 rounded-full bg-purple-500/10 blur-[80px] pointer-events-none" />
        <div className="absolute top-48 -right-24 w-72 h-72 rounded-full bg-cyan-500/10 blur-[80px] pointer-events-none" />

        <div className="container relative z-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="max-w-3xl mx-auto text-center space-y-6"
          >
            <motion.div variants={fadeUp} custom={0}>
              <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs font-medium">
                <Sparkles className="h-3 w-3 text-indigo-500" />
                Powered by Claude Sonnet · GPT-4 Turbo · Gemini
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={0.05}
              className="text-5xl sm:text-6xl font-black tracking-tight leading-[1.1]"
            >
              Understand Any GitHub
              <br />
              <span className="text-primary">Repository in Seconds</span>
            </motion.h1>

            <motion.p variants={fadeUp} custom={0.1} className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              AI-powered code analysis with conversational insights. Paste a URL, get deep analysis, ask anything.
            </motion.p>

            <motion.div variants={fadeUp} custom={0.15} className="flex items-center justify-center gap-3 pt-2">
              <Button asChild size="lg" className="shadow-glow gap-2 rounded-xl">
                <Link to={isAuthenticated ? "/dashboard" : "/login"}>
                  Start Analyzing <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-xl gap-2"
                onClick={() => setDemoOpen(true)}
              >
                <Play className="h-4 w-4" /> See Demo
              </Button>
            </motion.div>

            <motion.div variants={fadeUp} custom={0.2} className="flex items-center justify-center gap-6 pt-2 text-sm text-muted-foreground">
              {["Free to start", "3 analyses/day", "No credit card"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="status-dot bg-green-500" /> {t}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Code preview card */}
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mt-16 max-w-2xl mx-auto"
          >
            <div className="rounded-2xl border bg-card shadow-glow-lg overflow-hidden">
              {/* Terminal chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="w-3 h-3 rounded-full bg-green-400" />
                <span className="ml-4 text-xs font-mono text-muted-foreground">analysis-result.json</span>
              </div>
              <pre className="p-5 text-sm font-mono leading-relaxed overflow-auto text-foreground/90">
                <TypewriterCode code={SAMPLE} />
              </pre>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section className="py-24 border-t">
        <div className="container">
          <InViewWrapper className="text-center mb-14">
            <motion.p variants={cardVariant} className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Features</motion.p>
            <motion.h2 variants={cardVariant} className="text-3xl sm:text-4xl font-bold tracking-tight">Everything you need to understand code</motion.h2>
          </InViewWrapper>

          <InViewWrapper className="grid md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <motion.div
                key={f.title}
                variants={cardVariant}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group relative rounded-2xl border bg-card p-6 space-y-4 hover:shadow-card-hover transition-shadow cursor-default"
              >
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center", f.bg)}>
                  <f.icon className={cn("h-5 w-5", f.color)} />
                </div>
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </InViewWrapper>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section className="py-24 bg-muted/30 border-y">
        <div className="container">
          <InViewWrapper className="text-center mb-14">
            <motion.p variants={cardVariant} className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Process</motion.p>
            <motion.h2 variants={cardVariant} className="text-3xl sm:text-4xl font-bold tracking-tight">Three steps to understanding</motion.h2>
          </InViewWrapper>

          <InViewWrapper className="grid md:grid-cols-3 gap-8 relative">
            {/* Connector lines (desktop) */}
            <div className="hidden md:block absolute top-10 left-1/3 right-1/3 h-px bg-gradient-to-r from-border via-primary/40 to-border" />

            {STEPS.map((step, i) => (
              <motion.div key={step.label} variants={cardVariant} className="flex flex-col items-center text-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-brand-soft border flex items-center justify-center">
                    <step.icon className="h-8 w-8 text-primary" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow">
                    {i + 1}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1">{step.label}</h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </InViewWrapper>
        </div>
      </section>

      {/* ── Tech stack scroll ────────────────────────────────────────────────── */}
      <section className="py-16 overflow-hidden border-b">
        <div className="container mb-8 text-center">
          <p className="text-sm text-muted-foreground">Analyzes repositories built with any technology</p>
        </div>
        <div className="relative flex overflow-x-hidden">
          <motion.div
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
            className="flex gap-6 whitespace-nowrap"
          >
            {[...TECH_LOGOS, ...TECH_LOGOS].map((tech, i) => (
              <div
                key={`${tech}-${i}`}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card text-sm font-medium text-muted-foreground shrink-0"
              >
                <Code2 className="h-4 w-4 text-primary/60" />
                {tech}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA section ─────────────────────────────────────────────────────── */}
      <section className="py-28">
        <div className="container">
          <InViewWrapper>
            <motion.div
              variants={cardVariant}
              className="max-w-2xl mx-auto text-center space-y-6 bg-gradient-brand-soft rounded-3xl border p-12"
            >
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                Join 100+ developers analyzing code smarter
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Stop guessing what a repo does.<br />
                <span className="text-primary">Ask AI instead.</span>
              </h2>
              <p className="text-muted-foreground">
                Free to start. No setup. Works on any public GitHub repository.
              </p>
              <Button asChild size="lg" className="shadow-glow rounded-xl gap-2">
                <Link to={isAuthenticated ? "/dashboard" : "/login"}>
                  Start for free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
          </InViewWrapper>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t py-10">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <BrandMark className="h-6 w-6 rounded-md" />
            RepoSense AI
          </div>
          <nav className="flex gap-5">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <a href={feedbackUrl} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">Feedback</a>
          </nav>
          <div className="text-center sm:text-right space-y-1">
            <p>&copy; {new Date().getFullYear()} RepoSense AI. All rights reserved.</p>
            <p className="text-xs">Analytics by Plausible (no cookies). v{version}</p>
          </div>
        </div>
      </footer>

      {/* ── Demo modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {demoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDemoOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-card rounded-2xl border shadow-2xl max-w-lg w-full p-8 text-center space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-brand-soft border flex items-center justify-center">
                <Play className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold">See it in action</h3>
              <p className="text-muted-foreground text-sm">
                Sign in to try a live demo — analyze any public GitHub repository for free.
              </p>
              <Button asChild className="w-full rounded-xl">
                <Link to="/login" onClick={() => setDemoOpen(false)}>
                  Try it now <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setDemoOpen(false)}
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Typewriter effect ─────────────────────────────────────────────────────────

function TypewriterCode({ code }: { code: string }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = 0;
    setDisplayed("");
    const timer = setInterval(() => {
      if (indexRef.current < code.length) {
        indexRef.current++;
        setDisplayed(code.slice(0, indexRef.current));
      } else {
        clearInterval(timer);
      }
    }, 14);
    return () => clearInterval(timer);
  }, [code]);

  return (
    <span>
      {displayed}
      {displayed.length < code.length && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle"
        />
      )}
    </span>
  );
}
