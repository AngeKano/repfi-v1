"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, X, LogOut } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "warning" | "danger" | "info";
  confirmIcon?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Attention",
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "warning",
  confirmIcon,
}: ConfirmDialogProps) {
  if (!open) return null;

  const iconColors = {
    warning: "text-[#D4A017]",
    danger: "text-red-500",
    info: "text-[#0077C3]",
  };

  const titleColors = {
    warning: "text-[#D4A017]",
    danger: "text-red-500",
    info: "text-[#0077C3]",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm mx-4 animate-fadeIn">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#335890] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`${iconColors[variant]}`}>
            <AlertTriangle className="w-12 h-12" />
          </div>
        </div>

        {/* Title */}
        <h3
          className={`text-xl font-bold text-center mb-4 ${titleColors[variant]}`}
        >
          {title}
        </h3>

        {/* Message */}
        <p className="text-center text-[#335890] text-sm mb-8">{message}</p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-full px-6 h-10 gap-2 border-[#D0E3F5] text-[#335890]"
          >
            <X className="w-4 h-4" />
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            className="rounded-full px-6 h-10 gap-2 bg-[#EBF5FF] text-[#0077C3] hover:bg-[#D0E3F5] border border-[#D0E3F5]"
            variant="outline"
          >
            {confirmIcon || <LogOut className="w-4 h-4" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
