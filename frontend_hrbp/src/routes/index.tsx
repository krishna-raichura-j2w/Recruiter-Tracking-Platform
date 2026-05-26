import { createFileRoute, Navigate } from "@tanstack/react-router";

function RootRedirect() {
  if (typeof window !== "undefined") {
    const raw = localStorage.getItem("j2w_user");
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u.role === "admin") return <Navigate to="/admin" />;
      } catch {}
    }
  }
  return <Navigate to="/dashboard" />;
}

export const Route = createFileRoute("/")({
  component: RootRedirect,
});
