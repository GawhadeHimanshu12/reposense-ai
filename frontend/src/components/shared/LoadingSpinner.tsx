import { BrandMark } from "@/components/shared/BrandLogo";
import { cn } from "@/lib/utils";

interface Props {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
  brand?: boolean;
}

const sizes = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10", xl: "h-16 w-16" };
const brandSizes = { sm: "h-5 w-5", md: "h-7 w-7", lg: "h-10 w-10", xl: "h-14 w-14" };

export function LoadingSpinner({ size = "md", className, label, brand = false }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="relative">
        <svg
          className={cn("animate-spin text-primary", sizes[size])}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {brand && (
          <BrandMark className={cn("absolute inset-0 m-auto", brandSizes[size])} />
        )}
      </div>
      {label && <p className="text-sm text-muted-foreground animate-pulse">{label}</p>}
    </div>
  );
}

export function FullPageSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
      <LoadingSpinner size="lg" label={label} />
    </div>
  );
}
