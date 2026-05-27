import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { AuthProvider } from "@/lib/auth";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  const [anim, setAnim] = useState<object | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}json/finding.json`).then((r) => r.json()).then(setAnim).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="w-64 h-64">
          {anim && <Lottie animationData={anim} loop autoplay />}
        </div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">404</p>
        <h1 className="text-xl font-bold text-slate-800 mt-1">Page not found</h1>
        <p className="text-sm text-slate-500 mt-2">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold px-5 py-2.5 transition-colors shadow-sm"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [anim, setAnim] = useState<object | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}json/business-problem-solving.json`).then((r) => r.json()).then(setAnim).catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="w-64 h-64">
          {anim && <Lottie animationData={anim} loop autoplay />}
        </div>
        <h1 className="text-xl font-bold text-slate-800 mt-1">Something went wrong</h1>
        <p className="text-sm text-slate-500 mt-2">
          An unexpected error occurred. Try refreshing the page or go back to the dashboard.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold px-5 py-2.5 transition-colors shadow-sm"
          >
            Try again
          </button>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold px-5 py-2.5 transition-colors shadow-sm"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "J2W's HRBP System" },
      {
        name: "description",
        content: "Internal HRBP operations platform for consultant lifecycle management.",
      },
    ],
    links: [
      { rel: "icon", href: "/J2W_Logo.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <ToastContainer position="top-right" autoClose={3000} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
