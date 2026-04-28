import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

import { announce } from "@/lib/a11y";

export type ToastVariant = "success" | "error" | "warning" | "info" | "loading" | "destructive" | "default";

interface ToastInput {
  title?: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

function resolveMessage(input: ToastInput): { message: ReactNode; description?: ReactNode } | null {
  if (input.title || input.description) {
    return {
      message: input.title ?? input.description ?? "",
      description: input.title ? input.description : undefined,
    };
  }
  return null;
}

function toast(input: ToastInput) {
  const payload = resolveMessage(input);
  if (!payload) return { id: "" };

  const messageText = typeof payload.message === "string" ? payload.message : "Notification";
  announce(messageText);

  const variant = input.variant ?? "default";
  const duration = input.duration;

  if (variant === "loading") {
    const id = sonnerToast.loading(payload.message, {
      description: payload.description,
      duration: duration ?? Infinity,
    });
    return { id };
  }

  if (variant === "success") {
    const id = sonnerToast.success(payload.message, {
      description: payload.description,
      duration: duration ?? 4000,
    });
    return { id };
  }

  if (variant === "warning") {
    const id = sonnerToast.warning(payload.message, {
      description: payload.description,
      duration: duration ?? 4000,
    });
    return { id };
  }

  if (variant === "info") {
    const id = sonnerToast.info(payload.message, {
      description: payload.description,
      duration: duration ?? 4000,
    });
    return { id };
  }

  if (variant === "error" || variant === "destructive") {
    const id = sonnerToast.error(payload.message, {
      description: payload.description,
      duration: duration ?? 6000,
    });
    return { id };
  }

  const id = sonnerToast(payload.message, {
    description: payload.description,
    duration: duration ?? 4000,
  });
  return { id };
}

function useToast() {
  return {
    toast,
    dismiss: sonnerToast.dismiss,
  };
}

export { toast, useToast };
