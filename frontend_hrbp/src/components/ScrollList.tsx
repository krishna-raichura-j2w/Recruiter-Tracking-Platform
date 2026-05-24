import type { ReactNode } from "react";

interface ScrollListProps {
  children: ReactNode;
  maxHeight?: string;
  className?: string;
  divided?: boolean;
}

export function ScrollList({
  children,
  maxHeight = "320px",
  className = "",
  divided = true,
}: ScrollListProps) {
  return (
    <div
      className={`overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent ${divided ? "divide-y divide-slate-50" : ""} ${className}`}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}
