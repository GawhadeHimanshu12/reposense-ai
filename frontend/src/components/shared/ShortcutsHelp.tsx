import { Keyboard } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SHORTCUTS = [
  { keys: "Ctrl/Cmd + K", action: "Open command palette" },
  { keys: "Ctrl/Cmd + N", action: "New analysis" },
  { keys: "Ctrl/Cmd + H", action: "Go to history" },
  { keys: "Ctrl/Cmd + /", action: "Show shortcuts" },
  { keys: "Esc", action: "Close modals" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHelp({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2">
              <Keyboard className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{s.action}</span>
              <kbd className="rounded-md border bg-muted px-2 py-1 text-xs font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
