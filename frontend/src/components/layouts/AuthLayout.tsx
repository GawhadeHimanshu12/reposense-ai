import { Outlet } from "react-router-dom";

import { BrandLogo } from "@/components/shared/BrandLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      {/* Animated gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-radial opacity-60 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-card border rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <BrandLogo to="/" className="justify-center mb-8" />
          <Outlet />
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          &copy; {new Date().getFullYear()} RepoSense AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
