import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtINR } from "@/lib/mockData";
import { Search } from "lucide-react";
import { getClientsApi } from "@/apiService/api";
import type { ClientItem } from "@/apiService/types";
import { toast } from "react-toastify";
import { CustomTablePagination } from "@/components/CustomPagination";
import { LottieIcon } from "@/components/LottieIcon";
import { fetchClientsSummary, type ClientsSummary } from "@/apiService/dashboardApi";
import { TableLoader } from "@/components/Loader";

export const Route = createFileRoute("/_authenticated/clients/")({ component: ClientsPage });

function ClientsPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [apiClients, setApiClients] = useState<ClientItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ClientsSummary | null>(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    fetchClientsSummary().then(setSummary).catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchClients() {
      try {
        setLoading(true);
        const res = await getClientsApi({ page_no: page + 1, per_page: rowsPerPage });
        if (res.meta.status) {
          setApiClients(res.data || []);
          setTotalCount(res.meta.total || 0);
        } else {
          toast.error(res.meta.message || "Failed to load clients");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to load clients");
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, [page, rowsPerPage]);

  const handleChangePage = (
    event: React.MouseEvent<HTMLButtonElement> | null,
    newPage: number,
  ) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const filtered = apiClients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.industry.toLowerCase().includes(q.toLowerCase());
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
        ? c.is_active
        : !c.is_active;
    return matchesSearch && matchesStatus;
  });
  return (
    <div className="flex flex-col min-h-screen bg-white text-slate-800">
      <TopBar
        title="Clients"
        subtitle="Manage client engagements, monitor headcount, and track project health."
      />
      <main className="flex-1 p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: "Total Clients",
              value: summary?.total ?? "—",
              color: "text-sky-600",
              src: "/json/successful-business-agreement.json",
            },
            {
              label: "Active",
              value: summary?.active ?? "—",
              color: "text-emerald-600",
              src: "/json/reviewed.json",
            },
            {
              label: "Inactive",
              value: summary?.inactive ?? "—",
              color: "text-slate-500",
              src: "/json/office-drawer.json",
            },
            {
              label: "Total Consultants",
              value: summary?.total_consultants ?? "—",
              color: "text-violet-600",
              src: "/json/employee-colored.json",
            },
          ].map(({ label, value, color, src }) => (
            <Card key={label} className="flex items-center gap-4 p-4 border border-slate-100 shadow-sm bg-white rounded-xl">
              <div className="shrink-0">
                <LottieIcon src={src} size={40} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
              />
            </div>
            <div className="w-[180px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 text-sm border-slate-200 shadow-sm bg-white">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="bg-slate-100 border-b border-slate-200">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">BH Owner</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Headcount</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">PO Value</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Active Incidents</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={7} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No clients found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium">
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: c.id.toString() }}
                        className="text-sky-600 hover:text-sky-700 hover:underline font-semibold"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-medium">{c.industry || "N/A"}</TableCell>
                    <TableCell className="text-center text-xs text-slate-600 font-medium">{c.bh_name || "N/A"}</TableCell>
                    <TableCell className="text-center text-slate-700 font-medium">{c.headcount || 0}</TableCell>
                    <TableCell className="text-center text-slate-500 text-xs font-medium">{fmtINR(c.total_monthly_po || 0)}</TableCell>
                    <TableCell className="text-center text-slate-700 font-medium">0</TableCell>
                    <TableCell>
                      {c.is_active ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200">Active</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200">Inactive</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="flex justify-center mt-4">
          <CustomTablePagination
            rowsPerPageOptions={[5, 10, 25, 50, 100]}
            count={totalCount}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </div>
      </main>
    </div>
  );
}
