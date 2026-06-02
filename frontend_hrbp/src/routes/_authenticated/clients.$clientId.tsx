import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { TopBar } from "@/components/TopBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtINR } from "@/lib/mockData";
import { Search, Download, Upload, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { getConsultantsApi, downloadConsultantTemplateApi, bulkUpsertConsultantsApi, deleteConsultantApi } from "@/apiService/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { ConsultantItem } from "@/apiService/types";
import { toast } from "react-toastify";
import { CustomTablePagination } from "@/components/CustomPagination";
import { CustomDateRangePicker } from "@/components/CustomDateRangePicker";
import { format } from "date-fns";
import dayjs, { Dayjs } from "dayjs";
import { LottieIcon } from "@/components/LottieIcon";
import { fetchConsultantsSummary, type ConsultantsSummary } from "@/apiService/dashboardApi";
import { TableLoader } from "@/components/Loader";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  // Provide an empty loader so HMR doesn't crash if it tries to destructure
  loader: () => ({ client: {} }),
  component: ClientDetail,
});

type BulkResult = { inserted: number; updated: number; errors: { row: number; error: string }[] };

function ClientDetail() {
  const { clientId } = Route.useParams();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [consultants, setConsultants] = useState<ConsultantItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [summary, setSummary] = useState<ConsultantsSummary | null>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    try {
      const res = await deleteConsultantApi(id);
      if (res.meta.status) {
        toast.success("Consultant deleted successfully");
        setConsultants((prev) => prev.filter((c) => c.id !== id));
        setTotalCount((prev) => prev - 1);
      } else {
        toast.error(res.meta.message || "Delete failed");
      }
    } catch {
      toast.error("Delete failed");
    }
  }

  // Bulk upload dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState<1 | 2>(1);
  const [downloading, setDownloading] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openBulkDialog() {
    setBulkOpen(true);
    setBulkStep(1);
    setBulkFile(null);
    setBulkResult(null);
  }

  async function handleDownloadTemplate() {
    try {
      setDownloading(true);
      const blob = await downloadConsultantTemplateApi(Number(clientId));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Consultants_Bulk_Upload_Template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template");
    } finally {
      setDownloading(false);
    }
  }

  async function handleBulkUpload() {
    if (!bulkFile) return;
    try {
      setUploading(true);
      const res = await bulkUpsertConsultantsApi(bulkFile);
      if (res.meta.status) {
        setBulkResult(res.data);
        // Refresh consultant list
        setPage(0);
      } else {
        toast.error(res.meta.message || "Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    fetchConsultantsSummary(Number(clientId)).then(setSummary).catch(() => {});
  }, [clientId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

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

        const isActive =
          statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined;

        const res = await getConsultantsApi({
          client_id: Number(clientId),
          page_no: page + 1,
          per_page: rowsPerPage,
          date_from,
          date_to,
          search: debouncedQ || undefined,
          is_active: isActive,
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
  }, [clientId, page, rowsPerPage, dateRange, debouncedQ, statusFilter]);

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
    <div className="flex flex-col h-full bg-white text-slate-800">
      <TopBar
        title="Client Consultants"
        subtitle="View and manage consultants mapped to this client."
      />
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <BackButton to="/clients" label="Back to Clients" />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              label: "Total Consultants",
              value: summary?.total ?? "—",
              color: "text-sky-600",
              src: "/json/employee-colored.json",
            },
            {
              label: "Active",
              value: summary?.active ?? "—",
              color: "text-emerald-600",
              src: "/json/reviewed.json",
            },
            {
              label: "Contract Closure Status",
              value: summary?.expiring_soon ?? "—",
              color: "text-amber-600",
              src: "/json/helpful-tips-for-business.json",
            },
            {
              label: "PO at Risk",
              value: summary?.po_at_risk ?? "—",
              color: "text-rose-600",
              src: "/json/the-boy-is-holding-a-dollar-coin.json",
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

        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, emp ID, manager or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-10 border-slate-200 shadow-sm bg-white"
            />
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <CustomDateRangePicker
              value={dateRange}
              onChange={setDateRange}
            />
            <div className="w-[160px]">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
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
            <Button variant="outline" size="sm" className="h-10 gap-2" onClick={openBulkDialog}>
              <Upload className="h-4 w-4" />
              Bulk Upload
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={deleteId !== null}
          onOpenChange={(o) => { if (!o) setDeleteId(null); }}
          title="Delete Consultant"
          description="Are you sure you want to delete this consultant? This action cannot be undone."
          confirmText="Delete"
          variant="destructive"
          onConfirm={() => { if (deleteId !== null) handleDelete(deleteId); }}
        />

        {/* Bulk Upload Dialog */}
        <Dialog open={bulkOpen} onOpenChange={(o) => { setBulkOpen(o); if (!o) { setBulkStep(1); setBulkFile(null); setBulkResult(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Bulk Upload Consultants</DialogTitle>
            </DialogHeader>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-2">
              {([1, 2] as const).map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${bulkStep >= s ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-400"}`}>{s}</div>
                  <span className={`text-xs ${bulkStep >= s ? "text-sky-700 font-medium" : "text-slate-400"}`}>{s === 1 ? "Download Template" : "Upload Data"}</span>
                  {s < 2 && <div className="w-8 h-px bg-slate-200 mx-1" />}
                </div>
              ))}
            </div>

            {bulkStep === 1 && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Download the pre-filled template with your client and HRBP details. Fill in the consultant data, then proceed to upload.
                </p>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Before you fill the template
                  </div>
                  <ul className="text-xs text-amber-800 space-y-1.5 pl-6 list-disc">
                    <li>Enter all dates in <span className="font-semibold">MM/DD/YYYY</span> format (e.g. 06/15/2025).</li>
                    <li>The <span className="font-semibold">client_id</span> and <span className="font-semibold">hrbp_id</span> columns are pre-filled — use the same values for every row.</li>
                    <li>Do not rename, reorder, or remove any columns.</li>
                    <li>Save the file as <span className="font-semibold">.xlsx</span> before uploading.</li>
                  </ul>
                </div>

                <Button variant="outline" className="w-full gap-2" onClick={handleDownloadTemplate} disabled={downloading}>
                  <Download className="h-4 w-4" />
                  {downloading ? "Downloading…" : "Download Template"}
                </Button>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setBulkStep(2)}>Next →</Button>
                </div>
              </div>
            )}

            {bulkStep === 2 && !bulkResult && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">Select the filled template (.xlsx) to upload.</p>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center cursor-pointer hover:border-sky-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  {bulkFile ? (
                    <p className="text-sm text-sky-700 font-medium">{bulkFile.name}</p>
                  ) : (
                    <p className="text-sm text-slate-500">Click to select an .xlsx file</p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setBulkStep(1)}>← Back</Button>
                  <Button size="sm" onClick={handleBulkUpload} disabled={!bulkFile || uploading}>
                    {uploading ? "Uploading…" : "Upload"}
                  </Button>
                </div>
              </div>
            )}

            {bulkStep === 2 && bulkResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium text-sm">Upload complete</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Inserted", value: bulkResult.inserted, color: "text-emerald-600" },
                    { label: "Updated", value: bulkResult.updated, color: "text-sky-600" },
                    { label: "Errors", value: bulkResult.errors.length, color: "text-rose-600" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-lg border border-slate-100 p-3">
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                {bulkResult.errors.length > 0 && (
                  <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 space-y-1 max-h-40 overflow-y-auto">
                    {bulkResult.errors.map((e) => (
                      <div key={e.row} className="flex items-start gap-2 text-xs text-rose-700">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Row {e.row}: {e.error}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setBulkOpen(false)}>Done</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="rounded-lg overflow-x-auto border border-slate-200 bg-white shadow-sm">
          <Table className="min-w-max">
            <TableHeader className="bg-slate-100 border-b border-slate-200">
              <TableRow className="hover:bg-transparent border-0">
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Employee ID</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Manager Name</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone Number</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">Join Date</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">Monthly PO</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">Monthly CTC</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">PO End Date</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">Created At</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">Updated At</TableHead>
                <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right pr-6">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableLoader colSpan={12} />
              ) : consultants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center text-slate-500 font-medium">
                    No Data found!
                  </TableCell>
                </TableRow>
              ) : (
                consultants.map((c) => (
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
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        onClick={() => setDeleteId(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
