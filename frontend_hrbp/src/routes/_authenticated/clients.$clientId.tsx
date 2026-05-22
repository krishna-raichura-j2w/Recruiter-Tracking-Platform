import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { TopBar } from "@/components/TopBar";
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
import { Search, ArrowLeft } from "lucide-react";
import { getConsultantsApi } from "@/apiService/api";
import type { ConsultantItem } from "@/apiService/types";
import { toast } from "react-toastify";
import { CustomTablePagination } from "@/components/CustomPagination";
import { CustomDateRangePicker } from "@/components/CustomDateRangePicker";
import { format } from "date-fns";
import dayjs, { Dayjs } from "dayjs";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  // Provide an empty loader so HMR doesn't crash if it tries to destructure
  loader: () => ({ client: {} }),
  component: ClientDetail,
});

function ClientDetail() {
  const { clientId } = Route.useParams();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [consultants, setConsultants] = useState<ConsultantItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  useEffect(() => {
    async function fetchConsultants() {
      try {
        setLoading(true);

        let date_from = undefined;
        let date_to = undefined;
        if (dateRange[0] && dateRange[1]) {
          date_from = dateRange[0].format("YYYY-MM-DD");
          date_to = dateRange[1].format("YYYY-MM-DD");
        }

        const res = await getConsultantsApi({
          client_id: Number(clientId),
          page_no: page + 1,
          per_page: rowsPerPage,
          date_from,
          date_to,
        });

        if (res.meta.status) {
          setConsultants(res.data || []);
          setTotalCount(res.meta.total || res.data.length || 0);
        } else {
          toast.error(res.meta.message || "Failed to load consultants");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to load consultants");
      } finally {
        setLoading(false);
      }
    }
    fetchConsultants();
  }, [clientId, page, rowsPerPage, dateRange]);

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

  const filtered = consultants.filter((c) => {
    const searchString = `${c.name || ''} ${c.emp_id || ''} ${c.manager_name || ''} ${c.email || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(q.toLowerCase());
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
        ? c.is_active
        : !c.is_active;
    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "MMM dd, yyyy, hh:mm a");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        title="Client Consultants"
        subtitle="View and manage consultants mapped to this client."
      />
      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <Link to="/clients" className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Clients
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search currently displayed consultants..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
              />
          </div>
          
          <CustomDateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />

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

        <div className="rounded-lg overflow-x-auto border border-slate-200 bg-white shadow-sm">
          <Table className="min-w-max">
            <TableHeader className="bg-[#132246]">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="font-semibold text-white">Employee ID</TableHead>
                <TableHead className="font-semibold text-white">Name</TableHead>
                <TableHead className="font-semibold text-white">Manager Name</TableHead>
                <TableHead className="font-semibold text-white">Email</TableHead>
                <TableHead className="font-semibold text-white">Phone Number</TableHead>
                <TableHead className="text-center font-semibold text-white whitespace-nowrap">Join Date</TableHead>
                <TableHead className="text-center font-semibold text-white whitespace-nowrap">Monthly PO</TableHead>
                <TableHead className="text-center font-semibold text-white whitespace-nowrap">Monthly CTC</TableHead>
                <TableHead className="text-center font-semibold text-white whitespace-nowrap">PO End Date</TableHead>
                <TableHead className="text-center font-semibold text-white whitespace-nowrap">Created At</TableHead>
                <TableHead className="text-center font-semibold text-white whitespace-nowrap">Updated At</TableHead>
                <TableHead className="font-semibold text-white text-right pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center">
                    Loading consultants...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center text-slate-500 font-medium">
                    No Data found!
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-slate-900">{c.emp_id || "-"}</TableCell>
                    <TableCell className="font-medium text-sky-700 hover:underline">
                      <Link to="/consultants/$consultantId" params={{ consultantId: String(c.id) }}>
                        {c.name || "-"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{c.manager_name || "-"}</TableCell>
                    <TableCell className="text-sm text-slate-600">{c.email || "-"}</TableCell>
                    <TableCell className="text-sm text-slate-600">{c.phone || "-"}</TableCell>
                    <TableCell className="text-center text-sm text-slate-600 whitespace-nowrap">{formatDate(c.join_date)}</TableCell>
                    <TableCell className="text-center text-sm text-slate-700 font-medium whitespace-nowrap">{c.monthly_po ? fmtINR(c.monthly_po) : "-"}</TableCell>
                    <TableCell className="text-center text-sm text-slate-700 font-medium whitespace-nowrap">{c.monthly_ctc ? fmtINR(c.monthly_ctc) : "-"}</TableCell>
                    <TableCell className="text-center text-sm text-slate-600 whitespace-nowrap">{formatDate(c.po_end_date)}</TableCell>
                    <TableCell className="text-center text-sm text-slate-600 whitespace-nowrap">{formatDateTime(c.created_at)}</TableCell>
                    <TableCell className="text-center text-sm text-slate-600 whitespace-nowrap">{formatDateTime(c.updated_at)}</TableCell>
                    <TableCell className="text-right pr-6">
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
