import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { SearchBar } from "@/components/shared/SearchBar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi } from "@/lib/api";

const PAGE_SIZE = 25;

export function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const skip = (page - 1) * PAGE_SIZE;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search, skip],
    queryFn: () => adminApi.listUsers({ search: search || undefined, skip, limit: PAGE_SIZE }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by email or name…" className="w-72" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : !data?.items.length ? (
        <EmptyState title="No users found" description="Try a different search." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Analyses</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{u.name ?? u.email}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {u.is_admin && <Badge variant="default" className="text-xs">Admin</Badge>}
                      {u.is_banned && <Badge variant="destructive" className="text-xs">Banned</Badge>}
                      {!u.is_banned && !u.is_admin && <Badge variant="secondary" className="text-xs">User</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{u.analyses_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination total={data.total} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
