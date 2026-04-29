"use client";

import { cn } from "@/lib/utils";

interface CloseButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Reusable close button with subtle red styling.
 * Usage: <CloseButton onClick={handleClose} />
 */
export function CloseButton({ onClick, disabled, className, size = "md" }: CloseButtonProps) {
  const sizeClasses = size === "sm" ? "w-7 h-7 text-xs" : "w-8 h-8 text-sm";

  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={cn(
        sizeClasses,
        "flex items-center justify-center rounded-full",
        "border border-red-200 bg-white text-red-400",
        "hover:bg-red-500 hover:text-white hover:border-red-500 hover:shadow-lg hover:shadow-red-200/50",
        "transition-all duration-200",
        disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer",
        className
      )}
      aria-label="Đóng"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0">
        <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
