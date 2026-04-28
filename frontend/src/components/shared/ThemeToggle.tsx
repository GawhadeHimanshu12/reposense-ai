import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/shared/ThemeProvider";
import { cn } from "@/lib/utils";

interface Props {
  showLabel?: boolean;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
}

export function ThemeToggle({ showLabel = false, className, variant = "ghost", size = "icon" }: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={toggle}
      className={cn(showLabel && "gap-2", className)}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {showLabel && <span className="text-xs font-medium">{isDark ? "Light" : "Dark"}</span>}
    </Button>
  );
}
