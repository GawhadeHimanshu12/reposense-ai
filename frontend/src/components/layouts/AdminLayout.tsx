import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Menu,
  MessageSquare,
  Settings,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/shared/BrandLogo";
import { adminApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const adminNav = [
  { to: "/admin", end: true, icon: BarChart3, label: "Dashboard" },
  { to: "/admin/users", end: false, icon: Users, label: "Users" },
  { to: "/admin/chats", end: false, icon: MessageSquare, label: "Chat Logs" },
  { to: "/admin/ai-settings", end: false, icon: Zap, label: "AI Settings" },
  { to: "/admin/settings", end: false, icon: Settings, label: "System Settings" },
  { to: "/admin/audit", end: false, icon: Activity, label: "Audit Logs" },
];

function Breadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);

  const labels: Record<string, string> = {
    admin: "Admin",
    users: "Users",
    chats: "Chat Logs",
    "ai-settings": "AI Settings",
    settings: "System Settings",
    audit: "Audit Logs",
  };

  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          <span className={cn("capitalize", i === parts.length - 1 ? "text-foreground font-medium" : "")}>
            {labels[part] ?? part}
          </span>
        </span>
      ))}
    </nav>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { data: overview } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: adminApi.getOverview,
    refetchInterval: 30_000,
  });

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-300 shrink-0",
        collapsed ? "w-14" : "w-52",
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-2.5 px-3 py-4 border-b", collapsed && "justify-center px-0")}>
        <BrandMark className="h-8 w-8 shrink-0" />
        {!collapsed && (
          <div>
            <p className="font-semibold text-sm leading-none">Admin</p>
            <p className="text-xs text-muted-foreground mt-0.5">RepoSense AI</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-1.5">
        {adminNav.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors group",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
                collapsed && "justify-center px-2",
              )
            }
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <span className="flex-1 truncate">{label}</span>
                )}
                {!collapsed && label === "Users" && overview?.total_users != null && (
                  <Badge
                    variant={isActive ? "secondary" : "outline"}
                    className="text-xs h-4 px-1 tabular-nums"
                  >
                    {overview.total_users}
                  </Badge>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn("border-t py-3 px-1.5 space-y-0.5", collapsed && "px-1.5")}>
        <Link
          to="/dashboard"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Back to App" : undefined}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {!collapsed && "Back to App"}
        </Link>
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
            collapsed && "justify-center px-2",
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu className="h-4 w-4 shrink-0" />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-5 py-3 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10 shrink-0">
          {/* Mobile menu */}
          <button
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setCollapsed((c) => !c)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <Breadcrumbs />

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" className="text-xs hidden sm:flex">
              <Shield className="h-3 w-3 mr-1" /> Admin
            </Badge>
          </div>
        </header>

        {/* Mobile nav (bottom) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-20 flex">
          {adminNav.slice(0, 5).map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] truncate">{label.split(" ")[0]}</span>
            </NavLink>
          ))}
        </div>

        {/* Page content */}
        <main className="flex-1 p-5 lg:p-7 pb-20 md:pb-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
