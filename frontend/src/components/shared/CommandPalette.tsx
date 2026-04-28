import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, History, LayoutDashboard, LogOut, Plus, Search } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useMyAnalyses } from "@/hooks/useAnalysis";
import { useAuthStore } from "@/store/auth";

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  group: string;
  icon?: React.ElementType;
  shortcut?: string;
  onSelect: () => void;
  keywords?: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewAnalysis: () => void;
  onLogout: () => void;
}

export function CommandPalette({ open, onOpenChange, onNewAnalysis, onLogout }: Props) {
  const navigate = useNavigate();
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const { data: analyses } = useMyAnalyses(0, 5);
  const [query, setQuery] = useState("");

  const actions = useMemo<CommandAction[]>(() => {
    const base: CommandAction[] = [
      {
        id: "dashboard",
        label: "Go to Dashboard",
        description: "View overview and run new analysis",
        group: "Navigation",
        icon: LayoutDashboard,
        shortcut: "Ctrl+K",
        onSelect: () => navigate("/dashboard"),
        keywords: ["home", "dashboard"],
      },
      {
        id: "history",
        label: "View History",
        description: "Browse past analyses",
        group: "Navigation",
        icon: History,
        shortcut: "Ctrl+H",
        onSelect: () => navigate("/history"),
        keywords: ["history", "analyses"],
      },
      {
        id: "profile",
        label: "Open Profile",
        description: "Account details and stats",
        group: "Navigation",
        icon: Clock,
        onSelect: () => navigate("/profile"),
        keywords: ["account", "profile"],
      },
      {
        id: "new-analysis",
        label: "New Analysis",
        description: "Paste a GitHub URL",
        group: "Quick Actions",
        icon: Plus,
        shortcut: "Ctrl+N",
        onSelect: onNewAnalysis,
        keywords: ["analyze", "new"],
      },
      {
        id: "logout",
        label: "Log out",
        description: "Sign out of your account",
        group: "User",
        icon: LogOut,
        onSelect: onLogout,
        keywords: ["sign out"],
      },
    ];

    if (isAdmin) {
      base.push({
        id: "admin",
        label: "Open Admin",
        description: "System analytics and settings",
        group: "Navigation",
        icon: LayoutDashboard,
        onSelect: () => navigate("/admin"),
        keywords: ["admin", "settings"],
      });
    }

    if (analyses?.length) {
      analyses.slice(0, 5).forEach((a) => {
        base.push({
          id: `analysis-${a.session_id}`,
          label: a.repo_name,
          description: "Open recent analysis",
          group: "Recent Analyses",
          icon: Clock,
          onSelect: () => navigate(`/analysis/${a.session_id}`),
          keywords: [a.repo_name, "analysis"],
        });
      });
    }

    return base;
  }, [analyses, isAdmin, navigate, onLogout, onNewAnalysis]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => {
      const haystack = [a.label, a.description, ...(a.keywords ?? [])].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [actions, query]);

  const groups = useMemo(() => {
    const map = new Map<string, CommandAction[]>();
    filtered.forEach((action) => {
      if (!map.has(action.group)) map.set(action.group, []);
      map.get(action.group)!.push(action);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-base">Command Palette</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search for actions or pages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              aria-label="Search commands"
            />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto border-t">
          {groups.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No results found.</div>
          ) : (
            groups.map(([group, items]) => (
              <div key={group} className="px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{group}</p>
                <div className="space-y-1">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        item.onSelect();
                        onOpenChange(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                      )}
                    >
                      {item.icon && <item.icon className="h-4 w-4 text-muted-foreground" />}
                      <div className="flex-1">
                        <p className="font-medium">{item.label}</p>
                        {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                      </div>
                      {item.shortcut && <span className="text-xs text-muted-foreground">{item.shortcut}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
