import { ArrowLeft, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LINKS = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "History", to: "/history" },
  { label: "Profile", to: "/profile" },
  { label: "About", to: "/about" },
];

export function NotFoundPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    if (!query.trim()) return LINKS;
    return LINKS.filter((l) => l.label.toLowerCase().includes(query.toLowerCase()));
  }, [query]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (matches[0]) navigate(matches[0].to);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 text-center p-8">
      <div className="rounded-full bg-primary/10 p-4">
        <SearchX className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Page not found</h1>
        <p className="text-muted-foreground max-w-sm">The page you're looking for doesn't exist or has been moved.</p>
      </div>
      <form onSubmit={handleSearch} className="w-full max-w-sm space-y-3">
        <Input
          placeholder="Search pages"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search pages"
        />
        <div className="flex flex-wrap justify-center gap-2">
          {matches.map((l) => (
            <Button key={l.to} type="button" variant="outline" size="sm" onClick={() => navigate(l.to)}>
              {l.label}
            </Button>
          ))}
        </div>
      </form>
      <Button asChild>
        <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Go to Dashboard</Link>
      </Button>
    </div>
  );
}
