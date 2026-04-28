import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminApi } from "@/lib/api";

const PAGE_SIZE = 25;

export function AdminChatsPage() {
  const [page, setPage] = useState(1);
  const skip = (page - 1) * PAGE_SIZE;

  const { data, isLoading } = useQuery({
    queryKey: ["admin-chats", skip],
    queryFn: () => adminApi.listChats({ skip, limit: PAGE_SIZE }),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Chat Logs</h2>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : !data?.items.length ? (
        <EmptyState title="No chat sessions" description="Sessions appear here once users start chatting." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Repository</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell className="text-sm">{s.user_email}</TableCell>
                  <TableCell className="text-sm font-medium">{s.repo_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{s.ai_provider}</Badge></TableCell>
                  <TableCell className="text-sm">{s.message_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === "completed" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      {s.status}
                    </span>
                  </TableCell>
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
