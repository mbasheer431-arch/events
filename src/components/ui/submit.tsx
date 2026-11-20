"use client";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cn(className)}>
      {pending ? pendingText || "Saving…" : children}
    </button>
  );
}

export function ConfirmButton({ children, message, className = "btn-danger btn-sm" }: { children: React.ReactNode; message: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}
      onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {pending ? "Working…" : children}
    </button>
  );
}
