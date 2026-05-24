import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  to: string;
  params?: Record<string, string>;
  label: string;
}

export function BackButton({ to, params, label }: BackButtonProps) {
  return (
    <Link
      to={to as any}
      params={params as any}
      className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}
