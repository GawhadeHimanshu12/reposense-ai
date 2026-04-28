import {
  BarChart3,
  BookOpen,
  ChevronDown,
  Github,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Keyboard,
  Settings,
  Shield,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { ShortcutsHelp } from "@/components/shared/ShortcutsHelp";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/history", icon: History, label: "History" },
  { to: "/profile", icon: User, label: "Profile" },
];

const adminNavItems = [
  { to: "/admin", icon: BarChart3, label: "Overview" },
  { to: "/admin/users", icon: User, label: "Users" },
  { to: "/admin/chats", icon: BookOpen, label: "Chat Logs" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const logout = useAuthStore((s) => s.logout);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const navigate = useNavigate();

  async function handleLogout() {
    if (refreshToken) {
      try { await authApi.logout(refreshToken); } catch { /* ignore */ }
    }
    logout();
    navigate("/");
  }

  function handleNewAnalysis() {
    navigate("/dashboard");
    window.dispatchEvent(new CustomEvent("focus-analysis-input"));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const isCmd = e.metaKey || e.ctrlKey;
      if (!isCmd) return;

      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      if (key === "n") {
        e.preventDefault();
        handleNewAnalysis();
      }
      if (key === "h") {
        e.preventDefault();
        navigate("/history");
      }
      if (key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? "?";

  return (
    <div className="min-h-screen bg-background flex">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:bg-background focus:px-3 focus:py-2 focus:rounded-md focus:shadow">
        Skip to main content
      </a>
      <div id="app-live-region" className="sr-only" aria-live="polite" aria-atomic="true" />
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Primary"
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b">
          <BrandLogo to="/dashboard" compact />
          <button className="lg:hidden text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1" aria-label="Main navigation">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <Separator className="my-2" />
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                Admin
              </p>
              {adminNavItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={({ isActive }) =>
                    cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        {/* User section */}
        <div className="border-t p-3 space-y-2">
          <ThemeToggle showLabel className="w-full justify-start" variant="outline" size="sm" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left overflow-hidden">
                  <p className="font-medium leading-none truncate">{user?.name ?? user?.email}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile"><User className="mr-2 h-4 w-4" /> Profile</Link>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/admin"><Shield className="mr-2 h-4 w-4" /> Admin Panel</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden h-14 border-b flex items-center px-4 gap-3 bg-card sticky top-0 z-30">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">RepoSense AI</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main id="main-content" className="flex-1 p-6 page-enter">
          <Outlet />
        </main>
      </div>

      <button
        onClick={() => setShortcutsOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-lg hover:text-foreground hover:shadow-xl transition"
        aria-label="Show keyboard shortcuts"
      >
        <Keyboard className="h-4 w-4" /> ?
      </button>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNewAnalysis={handleNewAnalysis}
        onLogout={handleLogout}
      />

      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
