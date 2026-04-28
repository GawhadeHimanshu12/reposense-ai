import { useState } from "react";
import { LogOut, Trash2, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUserStats } from "@/hooks/useUser";
import { authApi, userApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export function Profile() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const logoutStore = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: stats, isLoading } = useUserStats();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleLogout() {
    if (refreshToken) {
      try { await authApi.logout(refreshToken); } catch { /* ignore */ }
    }
    logoutStore();
    navigate("/");
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await userApi.deleteMe();
      if (refreshToken) {
        try { await authApi.logout(refreshToken); } catch { /* ignore */ }
      }
      logoutStore();
      toast({ variant: "success", title: "Account deleted" });
      navigate("/");
    } catch (err: any) {
      toast({ variant: "error", title: "Failed to delete account", description: err?.response?.data?.detail ?? "Please try again." });
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
      setDeleteStep(1);
      setConfirmText("");
    }
  }

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0].toUpperCase() ?? "?";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2">
          <UserIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account details and security.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user?.avatar_url ?? undefined} alt={user?.name ?? "User avatar"} />
                <AvatarFallback className="text-base">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm text-muted-foreground">Signed in with Google</p>
                <p className="text-lg font-semibold">{user?.name ?? user?.email ?? "Unknown"}</p>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="profile-name">Name</label>
                <Input id="profile-name" value={user?.name ?? ""} readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="profile-email">Email</label>
                <Input id="profile-email" value={user?.email ?? ""} readOnly className="bg-muted/40" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account statistics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-6 w-36" />
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Member since</span>
                  <span className="font-medium">{stats?.member_since ? new Date(stats.member_since).toLocaleDateString() : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total analyses completed</span>
                  <span className="font-medium tabular-nums">{stats?.total_analyses_completed ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total questions asked</span>
                  <span className="font-medium tabular-nums">{stats?.total_questions_asked ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Favorite language</span>
                  <span className="font-medium">{stats?.favorite_language ?? "—"}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" /> Log out
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)} className="gap-2">
            <Trash2 className="h-4 w-4" /> Delete account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) { setDeleteStep(1); setConfirmText(""); } setDeleteOpen(open); }}>
        <DialogContent className="max-w-md">
          {deleteStep === 1 && (
            <>
              <DialogHeader>
                <DialogTitle>Are you sure?</DialogTitle>
                <DialogDescription>This action will disable your account.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
                <Button variant="destructive" onClick={() => setDeleteStep(2)}>Continue</Button>
              </DialogFooter>
            </>
          )}

          {deleteStep === 2 && (
            <>
              <DialogHeader>
                <DialogTitle>Confirm deletion</DialogTitle>
                <DialogDescription>This will delete all your data. Type DELETE to confirm.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  aria-label="Type DELETE to confirm"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteStep(1)}>Back</Button>
                <Button variant="destructive" disabled={confirmText !== "DELETE"} onClick={() => setDeleteStep(3)}>Continue</Button>
              </DialogFooter>
            </>
          )}

          {deleteStep === 3 && (
            <>
              <DialogHeader>
                <DialogTitle>Final confirmation</DialogTitle>
                <DialogDescription>This is your last chance to cancel.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteStep(2)}>Back</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? "Deleting..." : "Delete account"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
