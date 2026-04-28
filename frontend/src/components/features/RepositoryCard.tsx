import { GitFork, Lock, Star, Tag } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Repository } from "@/types";

export function RepositoryCard({ repo }: { repo: Repository }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-base">
            <Link to={`/repositories/${repo.id}`} className="hover:text-primary transition-colors">
              {repo.full_name}
            </Link>
          </CardTitle>
          {repo.is_private && (
            <Badge variant="outline" className="gap-1">
              <Lock className="h-3 w-3" /> Private
            </Badge>
          )}
        </div>
        {repo.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{repo.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {repo.language && (
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-primary/60" />
              {repo.language}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3" /> {repo.stars.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <GitFork className="h-3 w-3" /> {repo.forks.toLocaleString()}
          </span>
        </div>
        {repo.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {repo.topics.slice(0, 4).map((t) => (
              <Badge key={t} variant="secondary" className="text-xs gap-1">
                <Tag className="h-2.5 w-2.5" /> {t}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
