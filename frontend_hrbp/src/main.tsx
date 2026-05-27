import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import { ToastContainer } from "react-toastify";
import { getRouter } from "./router";
import "./styles.css";
import "react-toastify/dist/ReactToastify.css";

const queryClient = new QueryClient();
const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RouterProvider router={router} />
      <ToastContainer position="top-right" autoClose={3000} />
    </AuthProvider>
  </QueryClientProvider>,
);
