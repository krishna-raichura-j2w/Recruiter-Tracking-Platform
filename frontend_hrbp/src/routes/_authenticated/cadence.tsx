import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback } from "react";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { consultants } from "@/lib/mockData";
import {
  Calendar as CalendarIcon,
  Clock,
  ArrowLeft,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Check,
  X,
  History,
  Download,
  Loader2,
  FileSpreadsheet,
  Building2,
  User,
  MoreVertical,
  HelpCircle,
  Undo2,
  Lock,
  AlertCircle,
  TicketPlus,
} from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "@/lib/auth";
import {
  getClientsApi,
  getConsultantsApi,
  createCadenceScheduleApi,
  getCadenceSessionsApi,
  getCadenceSessionsSummaryApi,
  updateCadenceSessionApi,
  getCadenceScheduleSessionsApi,
  exportCadenceSessionsApi,
} from "@/apiService/api";
import {
  CADENCE_FREQUENCY_OPTIONS,
  getCadenceFrequencyLabel,
  type CadenceSessionItem,
  type ClientItem,
  type ConsultantItem,
} from "@/apiService/types";
import React from "react";
import { LottieIcon } from "@/components/LottieIcon";
import { ScrollContainer } from "@/components/ScrollList";
import { CustomTablePagination } from "@/components/CustomPagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CustomDateRangePicker } from "@/components/CustomDateRangePicker";
import { CustomDatePicker } from "@/components/CustomDatePicker";
import { CustomTimePicker } from "@/components/CustomTimePicker";
import { CustomSelect } from "@/components/CustomSelect";
import { SearchableSelect } from "@/components/SearchableSelect";
import dayjs, { Dayjs } from "dayjs";
import { SectionLoader } from "@/components/Loader";

export const Route = createFileRoute("/_authenticated/cadence")({
  validateSearch: (search: Record<string, unknown>) => ({
    create: search.create === "true" || search.create === true,
  }),
  component: CadenceSchedulerPage,
});

interface CadenceCheckIn {
  date: string;
  rag: "Green" | "Amber" | "Red";
  comment: string;
}

interface Cadence {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "10:30 am"
  client: string;
  project: string;
  consultant: string;
  duration: string;
  isRecurring: boolean;
  tillDate?: string;
  frequencyWeeks?: number;
  rag: "Green" | "Amber" | "Red" | null;
  comment: string;
  rcaStatus?: string;
  status: "today" | "pending" | "completed";
  history: CadenceCheckIn[];
  scheduleId?: number;
  sessionId?: number;
  bhId?: number | null;
  clientId?: number;
  consultantId?: number;
}

const clientList = [
  "Acme Financial",
  "Northwind Health",
  "Vertex Cloud",
  "BlueOcean Retail",
  "Helios Manufacturing",
];

const generateMockCadences = (): Cadence[] => {
  const list: Cadence[] = [];

  // Seed Today's active cadences (3 pending, 1 completed)
  list.push({
    id: "cad-t1",
    date: "2026-05-20",
    time: "10:30 am",
    client: "Acme Financial",
    project: "Migration Alpha",
    consultant: "Aarav Sharma",
    duration: "30 mins",
    isRecurring: false,
    rag: null,
    comment: "",
    status: "today",
    history: [
      { date: "2026-05-13", rag: "Green", comment: "Consultant is happy, project is on schedule." },
      { date: "2026-05-06", rag: "Amber", comment: "Minor issues with equipment access resolved." },
    ],
  });
  list.push({
    id: "cad-t2",
    date: "2026-05-20",
    time: "11:30 am",
    client: "Vertex Cloud",
    project: "Billing Engine",
    consultant: "Diya Verma",
    duration: "30 mins",
    isRecurring: true,
    tillDate: "2026-08-20",
    rag: null,
    comment: "",
    status: "today",
    history: [
      {
        date: "2026-05-13",
        rag: "Green",
        comment: "Performing well, manager gave positive review.",
      },
    ],
  });
  list.push({
    id: "cad-t3",
    date: "2026-05-20",
    time: "02:00 pm",
    client: "Northwind Health",
    project: "Patient Portal",
    consultant: "Vihaan Iyer",
    duration: "1 hr",
    isRecurring: false,
    rag: null,
    comment: "",
    status: "today",
    history: [],
  });
  list.push({
    id: "cad-t4",
    date: "2026-05-20",
    time: "09:30 am",
    client: "BlueOcean Retail",
    project: "Loyalty App",
    consultant: "Ishita Reddy",
    duration: "15 mins",
    isRecurring: false,
    rag: "Green",
    comment: "Check-in completed. Project on track.",
    status: "completed",
    rcaStatus: "Satisfactory",
    history: [{ date: "2026-05-13", rag: "Green", comment: "Monthly check-in was successful." }],
  });

  // Seed 27 other pending cadences (dates ranging from 2026-05-21 to 2026-05-28)
  const projects = [
    "Cloud Migration",
    "ERP Integration",
    "SAP Support",
    "DevOps Pipeline",
    "UI/UX Redesign",
  ];

  for (let i = 0; i < 27; i++) {
    const consultantObj = consultants[i % consultants.length];
    const clientName = clientList[i % clientList.length];
    const project = projects[i % projects.length];
    const day = 21 + (i % 8); // Spread across next week
    list.push({
      id: `cad-p${i}`,
      date: `2026-05-${day}`,
      time: `${9 + (i % 8)}:00 am`,
      client: clientName,
      project: project,
      consultant: consultantObj.name,
      duration: i % 2 === 0 ? "30 mins" : "1 hr",
      isRecurring: i % 3 === 0,
      tillDate: i % 3 === 0 ? "2026-08-30" : undefined,
      rag: null,
      comment: "",
      status: "pending",
      history:
        i % 4 === 0
          ? [{ date: "2026-05-14", rag: "Green", comment: "Monthly check-in was successful." }]
          : [],
    });
  }

  // Seed 20 other completed cadences (dates from 2026-05-01 to 2026-05-19)
  const comments = [
    "Consultant performs well, client pleased.",
    "Small billing issue sorted last week.",
    "High performance, project extension likely.",
    "Standard check-in. No escalations.",
    "Completed onboarding survey review.",
  ];

  for (let i = 0; i < 20; i++) {
    const consultantObj = consultants[(i + 15) % consultants.length];
    const clientName = clientList[(i + 2) % clientList.length];
    const project = projects[(i + 3) % projects.length];
    const day = 1 + (i % 18);
    const ragVal = (["Green", "Amber", "Red"] as const)[i % 3];
    list.push({
      id: `cad-c${i}`,
      date: `2026-05-${day < 10 ? "0" + day : day}`,
      time: `${10 + (i % 6)}:30 am`,
      client: clientName,
      project: project,
      consultant: consultantObj.name,
      duration: "30 mins",
      isRecurring: false,
      rag: ragVal,
      comment: comments[i % comments.length],
      status: "completed",
      rcaStatus:
        ragVal === "Red" ? "Resource issues" : ragVal === "Amber" ? "Slight delay" : "Satisfactory",
      history: [],
    });
  }

  return list;
};

const TODAY_DATE_STR = dayjs().format("YYYY-MM-DD");
const YESTERDAY_DATE_STR = dayjs().subtract(1, "day").format("YYYY-MM-DD");

const getDaysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

const getMonthDateRange = (year: number, month: number) => {
  const monthStr = String(month + 1).padStart(2, "0");
  const days = getDaysInMonth(year, month);
  return {
    dateFrom: `${year}-${monthStr}-01`,
    dateTo: `${year}-${monthStr}-${String(days).padStart(2, "0")}`,
  };
};

const tableFilterToApiStatus = (
  filter: "all" | "pending" | "completed",
): string | undefined => {
  if (filter === "pending") return "not_started";
  if (filter === "completed") return "completed";
  return undefined;
};

const formatRagStatus = (rcaStatus: string | null): "Green" | "Amber" | "Red" | null => {
  if (!rcaStatus) return null;
  const lower = rcaStatus.toLowerCase();
  if (lower === "green") return "Green";
  if (lower === "amber") return "Amber";
  if (lower === "red") return "Red";
  return null;
};

type RcaValue = "" | "green" | "amber" | "red";

const getRcaSelectValue = (cadence: Cadence): RcaValue => {
  if (cadence.rag === "Green") return "green";
  if (cadence.rag === "Amber") return "amber";
  if (cadence.rag === "Red") return "red";
  const lower = (cadence.rcaStatus || "").toLowerCase();
  if (lower === "green" || lower === "amber" || lower === "red") return lower;
  return "";
};

const scheduleSessionsToHistory = (
  sessions: CadenceSessionItem[],
  currentSessionId?: number,
): CadenceCheckIn[] =>
  sessions
    .filter((s) => s.id !== currentSessionId)
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
    .map((s) => ({
      date: s.scheduled_date,
      rag: formatRagStatus(s.rca_status) || "Green",
      comment: s.comments || "No comments entered.",
    }));

const formatHistoryDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
};

function RcaSelect({
  value,
  onChange,
  className = "",
}: {
  value: RcaValue;
  onChange: (value: RcaValue) => void;
  className?: string;
}) {
  return (
    <CustomSelect
      value={value}
      onChange={(v) => onChange(v as RcaValue)}
      placeholder="Select RAG"
      options={[
        { value: "green", label: "Green" },
        { value: "amber", label: "Amber" },
        { value: "red", label: "Red" },
      ]}
      className={className}
      triggerClassName="h-7 py-1 px-2 text-[10px] w-[100px]"
    />
  );
}

function ConsultantInitialsBadge({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`rounded-full bg-white flex items-center justify-center font-bold shrink-0 cursor-default ${className}`}
          aria-label={name}
        >
          {initials}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-slate-900 text-white px-2.5 py-1.5 rounded shadow-md border border-slate-800"
      >
        <p className="font-semibold text-xs">{name}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function CadenceHistoryTimeline({
  entries,
  loading,
}: {
  entries: CadenceCheckIn[];
  loading?: boolean;
}) {
  if (loading) {
    return <SectionLoader />;
  }
  if (entries.length === 0) {
    return <div className="text-center text-xs text-slate-400 py-3">No history available.</div>;
  }

  return (
    <div className="mt-2 space-y-3 bg-white p-3 rounded-lg border border-slate-200">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">History</h4>
      <div className="relative border-l border-slate-200 ml-16 space-y-4">
        {entries.map((h, idx) => (
          <div key={idx} className="relative">
            <span className="absolute -left-[4.25rem] top-0.5 text-[11px] font-bold text-slate-600 w-14 text-right">
              {formatHistoryDate(h.date)}
            </span>
            <span
              className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${h.rag === "Green"
                ? "bg-emerald-500"
                : h.rag === "Amber"
                  ? "bg-amber-500"
                  : "bg-red-500"
                }`}
            />
            <p className="pl-6 text-[11px] text-slate-500 italic">{h.comment}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const getCadenceTag = (
  bhId: number | null | undefined,
  currentUserId: number | undefined,
  role: string | undefined,
): "my_cadence" | "team_cadence" | null => {
  if (role !== "bh") return null;
  if (bhId && bhId === currentUserId) return "my_cadence";
  return "team_cadence";
};

const mapSessionToCadence = (item: any, todayDateStr: string): Cadence => {
  // Determine UI status
  let uiStatus: "today" | "pending" | "completed" = "pending";
  if (item.status === "completed") {
    uiStatus = "completed";
  } else if (item.scheduled_date === todayDateStr) {
    uiStatus = "today";
  }

  const ragVal = formatRagStatus(item.rca_status);

  // Fallback for duration and time
  const durationStr = item.duration_minutes
    ? `${item.duration_minutes} mins`
    : "30 mins";

  const formatTime12Hour = (tStr: string): string => {
    if (!tStr) return "10:00 am";
    const parts = tStr.split(":");
    const hours = parseInt(parts[0], 10);
    const minutes = parts[1] || "00";
    const ampm = hours >= 12 ? "pm" : "am";
    const dispHrs = hours % 12 || 12;
    return `${dispHrs}:${minutes} ${ampm}`;
  };

  const timeStr = item.meeting_time
    ? formatTime12Hour(item.meeting_time)
    : "10:00 am";

  return {
    id: `session-${item.id}`,
    date: item.scheduled_date,
    time: timeStr,
    client: item.client_name || "GE Healthcare",
    project: item.project_name || "General",
    consultant: item.consultant_name || "Aruna L K",
    duration: durationStr,
    isRecurring: item.meeting_type === "recurring",
    tillDate: undefined,
    frequencyWeeks: item.frequency_weeks,
    rag: ragVal,
    comment: item.comments || "",
    rcaStatus: item.rca_status || undefined,
    status: uiStatus,
    history: [],
    scheduleId: item.schedule_id,
    sessionId: item.id,
    bhId: item.bh_id ?? null,
    clientId: item.client_id,
    consultantId: item.consultant_id,
  };
};

function CadenceSchedulerPage() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { create: openCreate } = Route.useSearch();

  function handleRaiseTicket(c: Cadence) {
    const comment = checkInComments[c.id] || c.comment || "";
    sessionStorage.setItem(
      "raise_ticket_from_cadence",
      JSON.stringify({
        clientId: c.clientId,
        consultantId: c.consultantId,
        bhId: c.bhId ?? null,
        description: comment,
      }),
    );
    navigate({ to: "/tickets" });
  }
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [summaryPendingCount, setSummaryPendingCount] = useState<number | null>(null);
  const [summaryCompletedCount, setSummaryCompletedCount] = useState<number | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Dialog/Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  useEffect(() => { if (openCreate) setShowCreateModal(true); }, [openCreate]);
  const [modalDate, setModalDate] = useState("");
  const [modalTime, setModalTime] = useState("30 mins");
  const [modalMeetingTime, setModalMeetingTime] = useState("10:30");
  const [modalCustomDuration, setModalCustomDuration] = useState("");
  const [modalProject, setModalProject] = useState("");
  const [modalRecurring, setModalRecurring] = useState(false);
  const [modalTillDate, setModalTillDate] = useState("");
  const [modalFrequencyWeeks, setModalFrequencyWeeks] = useState<number>(2);

  // API Client & Consultant lists
  const [apiClients, setApiClients] = useState<ClientItem[]>([]);
  const [apiConsultants, setApiConsultants] = useState<ConsultantItem[]>([]);
  const [modalClientId, setModalClientId] = useState<number | "">("");
  const [modalConsultantId, setModalConsultantId] = useState<number | "">("");
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingConsultants, setLoadingConsultants] = useState(false);
  const [creatingCadence, setCreatingCadence] = useState(false);

  // BH tagging in create modal
  const [modalAddBh, setModalAddBh] = useState(false);
  const [modalBhId, setModalBhId] = useState<number | null>(null);
  const [modalBhName, setModalBhName] = useState<string>("");

  // Post-creation success notice
  const [showSuccessNotice, setShowSuccessNotice] = useState(false);
  const [successMeetLink, setSuccessMeetLink] = useState<string | null>(null);

  // BH cadence tag filter (for BH role view): "all" | "my_cadence" | "team_cadence"
  const [cadenceTagFilter, setCadenceTagFilter] = useState<"all" | "my_cadence" | "team_cadence">("all");

  // Search, Table & Timeline filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [tableFilter, setTableFilter] = useState<"all" | "pending" | "completed">("all");
  const [currentYear, setCurrentYear] = useState(() => dayjs().year());
  const [currentMonth, setCurrentMonth] = useState(() => dayjs().month()); // 0-indexed
  const [timelineSessions, setTimelineSessions] = useState<CadenceSessionItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Cadence Registry (tabular listing)
  const [registrySessions, setRegistrySessions] = useState<CadenceSessionItem[]>([]);
  const [registryPage, setRegistryPage] = useState(1);
  const [registryPerPage, setRegistryPerPage] = useState(10);
  const [registryTotal, setRegistryTotal] = useState(0);
  const [registryTotalPages, setRegistryTotalPages] = useState(1);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [registryDateRange, setRegistryDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [registryRefreshKey, setRegistryRefreshKey] = useState(0);
  const refreshRegistry = useCallback(() => setRegistryRefreshKey((k) => k + 1), []);

  // Edit/Checkin temp states
  const [checkInComments, setCheckInComments] = useState<Record<string, string>>({});
  const [checkInRcas, setCheckInRcas] = useState<Record<string, "green" | "amber" | "red">>({});
  const [checkInStatuses, setCheckInStatuses] = useState<Record<string, string>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [loadingCardHistoryId, setLoadingCardHistoryId] = useState<string | null>(null);

  // Registry Row Expansion
  const [registryExpandedRowId, setRegistryExpandedRowId] = useState<number | null>(null);
  const [registryHistorySessions, setRegistryHistorySessions] = useState<CadenceSessionItem[]>([]);
  const [loadingRegistryHistory, setLoadingRegistryHistory] = useState(false);
  const [exporting, setExporting] = useState(false);

  const refreshCadenceSummary = useCallback(async () => {
    try {
      const summaryRes = await getCadenceSessionsSummaryApi();
      if (summaryRes.meta.status && summaryRes.data) {
        setSummaryPendingCount(summaryRes.data.pending);
        setSummaryCompletedCount(summaryRes.data.completed);
      }
    } catch {
      // Keep existing counts if summary refresh fails
    }
  }, []);

  // Fetch clients on mount or when user changes
  useEffect(() => {
    const fetchClients = async () => {
      const storedId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
      const resolvedId = user?.id || (storedId ? Number(storedId) : 1);
      setLoadingClients(true);
      try {
        const res = await getClientsApi({ hrbp_id: resolvedId, per_page: -1 });
        if (res.meta.status && res.data) {
          setApiClients(res.data);
          if (res.data.length > 0) {
            setModalClientId(res.data[0].id);
          }
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to fetch clients");
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, [user?.id]);

  // Auto-fill BH from the selected client
  useEffect(() => {
    if (!modalClientId) {
      setModalBhId(null);
      setModalBhName("");
      setModalAddBh(false);
      return;
    }
    const client = apiClients.find((c) => c.id === Number(modalClientId));
    if (client?.bh_id) {
      setModalBhId(client.bh_id);
      setModalBhName(client.bh_name || `BH #${client.bh_id}`);
    } else {
      setModalBhId(null);
      setModalBhName("");
      setModalAddBh(false);
    }
  }, [modalClientId, apiClients]);

  // Fetch consultants when client selection changes
  useEffect(() => {
    const fetchConsultants = async () => {
      if (!modalClientId) {
        setApiConsultants([]);
        setModalConsultantId("");
        return;
      }
      const storedId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
      const resolvedId = user?.id || (storedId ? Number(storedId) : 1);
      setLoadingConsultants(true);
      try {
        const res = await getConsultantsApi({ hrbp_id: resolvedId, client_id: Number(modalClientId) });
        if (res.meta.status && res.data) {
          setApiConsultants(res.data);
          if (res.data.length > 0) {
            setModalConsultantId(res.data[0].id);
          } else {
            setModalConsultantId("");
          }
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to fetch consultants");
      } finally {
        setLoadingConsultants(false);
      }
    };
    fetchConsultants();
  }, [modalClientId, user?.id]);

  // Fetch cadence sessions (Today, Pending, Completed) and Summary statistics
  useEffect(() => {
    const fetchSessionsAndSummary = async () => {
      setLoadingSessions(true);
      try {
        // Fetch Today, Pending, and Completed sessions, and the Summary
        const [todayRes, pendingRes, completedRes, summaryRes] = await Promise.all([
          getCadenceSessionsApi({ scheduled_date: TODAY_DATE_STR }),
          getCadenceSessionsApi({ status: "not_started", date_to: YESTERDAY_DATE_STR }),
          getCadenceSessionsApi({ status: "completed" }),
          getCadenceSessionsSummaryApi().catch(() => null),
        ]);

        const allMapped: Cadence[] = [];
        const seenIds = new Set<number>();

        // Process Today's sessions
        if (todayRes.meta.status && todayRes.data) {
          todayRes.data.forEach((item) => {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              allMapped.push(mapSessionToCadence(item, TODAY_DATE_STR));
            }
          });
        }

        // Process Pending sessions
        if (pendingRes.meta.status && pendingRes.data) {
          pendingRes.data.forEach((item) => {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              allMapped.push(mapSessionToCadence(item, TODAY_DATE_STR));
            }
          });
        }

        // Process Completed sessions
        if (completedRes.meta.status && completedRes.data) {
          completedRes.data.forEach((item) => {
            if (!seenIds.has(item.id)) {
              seenIds.add(item.id);
              allMapped.push(mapSessionToCadence(item, TODAY_DATE_STR));
            }
          });
        }

        setCadences(allMapped);

        // Process Summary
        if (summaryRes && summaryRes.meta.status && summaryRes.data) {
          setSummaryPendingCount(summaryRes.data.pending);
          setSummaryCompletedCount(summaryRes.data.completed);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to fetch cadence sessions");
      } finally {
        setLoadingSessions(false);
      }
    };

    fetchSessionsAndSummary();
  }, [user?.id]);

  // Fetch Month Timeline sessions for the visible month
  useEffect(() => {
    const fetchTimelineSessions = async () => {
      const { dateFrom, dateTo } = getMonthDateRange(currentYear, currentMonth);

      setLoadingTimeline(true);
      try {
        const res = await getCadenceSessionsApi({
          status: "not_started",
          date_from: dateFrom,
          date_to: dateTo,
        });

        if (res.meta.status && res.data) {
          setTimelineSessions(res.data);
        } else {
          setTimelineSessions([]);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to fetch timeline sessions");
        setTimelineSessions([]);
      } finally {
        setLoadingTimeline(false);
      }
    };

    fetchTimelineSessions();
  }, [currentYear, currentMonth, user?.id]);

  // Reset registry page when month, status, or tag filter changes
  useEffect(() => {
    setRegistryPage(1);
  }, [tableFilter, cadenceTagFilter, currentYear, currentMonth]);

  // Fetch Cadence Registry table (paginated, month date range, optional status)
  useEffect(() => {
    const fetchRegistrySessions = async () => {
      let dateFrom, dateTo;
      if (registryDateRange[0] && registryDateRange[1]) {
        dateFrom = registryDateRange[0].format("YYYY-MM-DD");
        dateTo = registryDateRange[1].format("YYYY-MM-DD");
      } else {
        const monthRange = getMonthDateRange(currentYear, currentMonth);
        dateFrom = monthRange.dateFrom;
        dateTo = monthRange.dateTo;
      }

      const statusParam = tableFilterToApiStatus(tableFilter);

      setLoadingRegistry(true);
      try {
        const res = await getCadenceSessionsApi({
          page_no: registryPage,
          per_page: registryPerPage,
          date_from: dateFrom,
          date_to: dateTo,
          ...(statusParam ? { status: statusParam } : {}),
          ...(cadenceTagFilter !== "all" ? { cadence_tag: cadenceTagFilter } : {}),
        });

        if (res.meta.status && res.data) {
          setRegistrySessions(res.data);
          setRegistryTotal(res.meta.total ?? res.data.length);
          setRegistryTotalPages(res.meta.total_pages ?? 1);
        } else {
          setRegistrySessions([]);
          setRegistryTotal(0);
          setRegistryTotalPages(1);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to fetch cadence registry");
        setRegistrySessions([]);
        setRegistryTotal(0);
        setRegistryTotalPages(1);
      } finally {
        setLoadingRegistry(false);
      }
    };

    fetchRegistrySessions();
  }, [user?.id, currentYear, currentMonth, tableFilter, cadenceTagFilter, registryPage, registryPerPage, registryDateRange, registryRefreshKey]);

  // Stats
  const pendingCount = useMemo(
    () =>
      summaryPendingCount !== null
        ? summaryPendingCount
        : cadences.filter((c) => c.status !== "completed").length,
    [cadences, summaryPendingCount],
  );
  const completedCount = useMemo(
    () =>
      summaryCompletedCount !== null
        ? summaryCompletedCount
        : cadences.filter((c) => c.status === "completed").length,
    [cadences, summaryCompletedCount],
  );
  const todayCount = useMemo(
    () => cadences.filter((c) => c.status === "today").length,
    [cadences],
  );

  // Month navigation
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };
  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const daysInMonth = useMemo(
    () => getDaysInMonth(currentYear, currentMonth),
    [currentYear, currentMonth],
  );

  // Group API timeline sessions by day for the visible month
  const timelineByDay = useMemo(() => {
    const map: Record<number, CadenceSessionItem[]> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      map[d] = [];
    }
    timelineSessions.forEach((session) => {
      const parts = session.scheduled_date.split("-");
      if (parts.length !== 3) return;
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (y === currentYear && m === currentMonth && map[d]) {
        map[d].push(session);
      }
    });
    return map;
  }, [timelineSessions, currentYear, currentMonth, daysInMonth]);

  // Handle cadence creation
  const handleCreateCadence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalClientId) {
      toast.error("Please select a client partner");
      return;
    }
    if (!modalConsultantId) {
      toast.error("Please select a consultant");
      return;
    }
    if (!modalDate) {
      toast.error("Please select a start date");
      return;
    }
    if (!modalProject.trim()) {
      toast.error("Please enter a project name");
      return;
    }
    if (modalRecurring && !modalTillDate) {
      toast.error("Please select till date for recurring cadence");
      return;
    }
    if (modalRecurring && !modalFrequencyWeeks) {
      toast.error("Please select a cadence frequency");
      return;
    }

    let durationMinutes = 30;
    if (modalTime === "15 mins") {
      durationMinutes = 15;
    } else if (modalTime === "30 mins") {
      durationMinutes = 30;
    } else if (modalTime === "1 hr") {
      durationMinutes = 60;
    } else if (modalTime === "Custom") {
      const customVal = parseInt(modalCustomDuration, 10);
      if (isNaN(customVal) || customVal <= 0) {
        toast.error("Please enter a valid custom duration in minutes");
        return;
      }
      durationMinutes = customVal;
    }

    let formattedTime = modalMeetingTime || "10:30:00";
    if (formattedTime.split(":").length === 2) {
      formattedTime += ":00";
    }

    setCreatingCadence(true);
    try {
      const payload = {
        client_id: Number(modalClientId),
        consultant_id: Number(modalConsultantId),
        meeting_type: modalRecurring ? "recurring" : "one_time",
        project_name: modalProject.trim(),
        meeting_time: formattedTime,
        duration_minutes: durationMinutes,
        start_date: modalDate,
        end_date: modalRecurring ? modalTillDate : undefined,
        frequency_weeks: modalRecurring ? modalFrequencyWeeks : undefined,
        supporting_documents: [],
        bh_id: modalAddBh && modalBhId ? modalBhId : null,
      };

      const res = await createCadenceScheduleApi(payload);

      if (res.meta.status && res.data) {
        const selectedClientObj = apiClients.find((c) => c.id === Number(modalClientId));
        const selectedConsultantObj = apiConsultants.find(
          (c) => c.id === Number(modalConsultantId),
        );

        // Helper to format 12 hour display time
        const formatTime12Hour = (tStr: string): string => {
          const parts = tStr.split(":");
          const hours = parseInt(parts[0], 10);
          const minutes = parts[1] || "00";
          const ampm = hours >= 12 ? "pm" : "am";
          const dispHrs = hours % 12 || 12;
          return `${dispHrs}:${minutes} ${ampm}`;
        };

        const isToday = modalDate === TODAY_DATE_STR;
        const newCadenceId = `cad-${res.data.id || Date.now()}`;
        const scheduleId = res.data.id;
        const newCadence: Cadence = {
          id: newCadenceId,
          date: res.data.start_date,
          time: formatTime12Hour(modalMeetingTime || "10:30"),
          client: selectedClientObj?.name || "Acme Financial",
          project: res.data.project_name || modalProject.trim(),
          consultant: selectedConsultantObj?.name || "Aarav Sharma",
          duration: modalTime === "Custom" ? `${durationMinutes} mins` : modalTime,
          isRecurring: res.data.meeting_type === "recurring",
          tillDate: res.data.end_date,
          frequencyWeeks: res.data.frequency_weeks,
          rag: null,
          comment: "",
          status: isToday ? "today" : "pending",
          history: [],
          scheduleId,
        };

        setCadences([newCadence, ...cadences]);

        // Fetch the first session for this schedule to get the sessionId,
        // so that check-ins on the newly created cadence persist to the DB.
        getCadenceScheduleSessionsApi(scheduleId)
          .then((sessionsRes) => {
            if (sessionsRes.meta.status && sessionsRes.data?.length > 0) {
              const targetSession =
                (sessionsRes.data as any[]).find((s) => s.scheduled_date === modalDate) ??
                sessionsRes.data[0];
              setCadences((prev) =>
                prev.map((c) =>
                  c.id === newCadenceId
                    ? { ...c, sessionId: (targetSession as any).id }
                    : c
                )
              );
            }
          })
          .catch(() => {});

        const { dateFrom, dateTo } = getMonthDateRange(currentYear, currentMonth);
        if (modalDate >= dateFrom && modalDate <= dateTo) {
          const statusParam = tableFilterToApiStatus(tableFilter);
          getCadenceSessionsApi({
            status: "not_started",
            date_from: dateFrom,
            date_to: dateTo,
          })
            .then((res) => {
              if (res.meta.status && res.data) setTimelineSessions(res.data);
            })
            .catch(() => { });
          getCadenceSessionsApi({
            page_no: registryPage,
            per_page: registryPerPage,
            date_from: dateFrom,
            date_to: dateTo,
            ...(statusParam ? { status: statusParam } : {}),
          })
            .then((res) => {
              if (res.meta.status && res.data) {
                setRegistrySessions(res.data);
                setRegistryTotal(res.meta.total ?? res.data.length);
                setRegistryTotalPages(res.meta.total_pages ?? 1);
              }
            })
            .catch(() => { });
        }

        setShowCreateModal(false);
        setModalProject("");
        setModalRecurring(false);
        setModalFrequencyWeeks(2);
        setModalTillDate("");
        setModalMeetingTime("10:30");
        setModalCustomDuration("");
        setModalTime("30 mins");
        setModalAddBh(false);
        setSuccessMeetLink(res.data.google_meet_link ?? null);
        setShowSuccessNotice(true);
        await refreshCadenceSummary();
      } else {
        toast.error(res.meta.message || "Failed to create cadence");
      }
    } catch (err: any) {
      toast.error(err.message || "Error creating cadence");
    } finally {
      setCreatingCadence(false);
    }
  };

  // Handle RAG check-in submission
  const handleCheckInSubmit = async (id: string) => {
    const comment = checkInComments[id] || "";
    const rca = checkInRcas[id];
    const status = checkInStatuses[id] || "not_started";

    const cadence = cadences.find((c) => c.id === id);
    if (!cadence) return;

    if (cadence.scheduleId && cadence.sessionId) {
      try {
        const storedId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
        const resolvedId = user?.id || (storedId ? Number(storedId) : 1);
        await updateCadenceSessionApi(cadence.scheduleId, cadence.sessionId, {
          comments: comment,
          rca_status: rca,
          status: status,
          completed_by: resolvedId,
        });
        toast.success("Cadence session updated in DB");
      } catch (err: any) {
        toast.error(err.message || "Failed to update session");
        return;
      }
    }

    setCadences((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            rag: rca === "green" ? "Green" : rca === "amber" ? "Amber" : rca === "red" ? "Red" : null,
            comment: comment.trim(),
            status: status === "completed" ? "completed" : c.status,
            rcaStatus: rca,
          };
        }
        return c;
      }),
    );
    await refreshCadenceSummary();
    refreshRegistry();
    toast.success("Cadence check-in logged successfully");
  };

  const handleCompletedRcaChange = async (id: string, rca: RcaValue) => {
    if (!rca) return;

    const cadence = cadences.find((c) => c.id === id);
    if (!cadence) return;

    if (cadence.scheduleId && cadence.sessionId) {
      try {
        await updateCadenceSessionApi(cadence.scheduleId, cadence.sessionId, {
          rca_status: rca,
        });
      } catch (err: any) {
        toast.error(err.message || "Failed to update RCA");
        return;
      }
    }

    setCadences((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const rag =
          rca === "green" ? "Green" : rca === "amber" ? "Amber" : rca === "red" ? "Red" : null;
        return { ...c, rag, rcaStatus: rca };
      }),
    );
    await refreshCadenceSummary();
    refreshRegistry();
    toast.success("RAG status updated");
  };

  const handleToggleCardHistory = async (cadence: Cadence) => {
    if (expandedHistoryId === cadence.id) {
      setExpandedHistoryId(null);
      return;
    }

    setExpandedHistoryId(cadence.id);

    if (cadence.history.length > 0 || !cadence.scheduleId) return;

    setLoadingCardHistoryId(cadence.id);
    try {
      const res = await getCadenceScheduleSessionsApi(cadence.scheduleId);
      if (res.meta.status && res.data) {
        const history = scheduleSessionsToHistory(res.data, cadence.sessionId);
        setCadences((prev) =>
          prev.map((c) => (c.id === cadence.id ? { ...c, history } : c)),
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch history");
    } finally {
      setLoadingCardHistoryId(null);
    }
  };

  // Client-side search on current registry page
  const filteredRegistrySessions = useMemo(() => {
    if (!searchTerm.trim()) return registrySessions;
    const q = searchTerm.toLowerCase();
    return registrySessions.filter(
      (s) =>
        s.consultant_name.toLowerCase().includes(q) ||
        s.client_name.toLowerCase().includes(q) ||
        (s.project_name?.toLowerCase().includes(q) ?? false),
    );
  }, [registrySessions, searchTerm]);

  // Export excel
  const handleExportExcel = async () => {
    try {
      setExporting(true);

      let dateFrom, dateTo;
      if (registryDateRange[0] && registryDateRange[1]) {
        dateFrom = registryDateRange[0].format("YYYY-MM-DD");
        dateTo = registryDateRange[1].format("YYYY-MM-DD");
      } else {
        const monthRange = getMonthDateRange(currentYear, currentMonth);
        dateFrom = monthRange.dateFrom;
        dateTo = monthRange.dateTo;
      }

      const statusParam = tableFilterToApiStatus(tableFilter);

      const res = await exportCadenceSessionsApi({
        date_from: dateFrom,
        date_to: dateTo,
        ...(statusParam ? { status: statusParam } : {}),
      });

      if (res.meta.status && res.data?.url) {
        toast.success(res.meta.message || "Excel exported successfully");
        // Open the download URL
        window.open(res.data.url, "_blank");
      } else {
        toast.error(res.meta.message || "Failed to export Excel");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to export Excel");
    } finally {
      setExporting(false);
    }
  };

  const handleToggleRegistryRow = async (scheduleId: number, sessionId: number) => {
    if (registryExpandedRowId === sessionId) {
      setRegistryExpandedRowId(null);
      return;
    }
    setRegistryExpandedRowId(sessionId);
    setLoadingRegistryHistory(true);
    try {
      const res = await getCadenceScheduleSessionsApi(scheduleId);
      if (res.meta.status && res.data) {
        setRegistryHistorySessions(res.data);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch cadence history");
    } finally {
      setLoadingRegistryHistory(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-white text-slate-800">
        <TopBar
          title="Cadence Scheduler"
          subtitle="Manage recurring client check-ins, record RAG health, and log RAG statuses."
        />

        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          <div className="space-y-4">
            {/* KPI Cards + Create Button in one row */}
            <div className="flex items-center gap-4">
              <div className="flex gap-4 flex-1">
                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex-1">
                  <div className="shrink-0"><LottieIcon src="/json/business-meeting.json" size={44} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Today's Sessions</p>
                    <p className="text-3xl font-bold leading-tight text-sky-600">{todayCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex-1">
                  <div className="shrink-0"><LottieIcon src="/json/helpful-tips-for-business.json" size={44} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Pending</p>
                    <p className="text-3xl font-bold leading-tight text-amber-600">{pendingCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex-1">
                  <div className="shrink-0"><LottieIcon src="/json/reviewed.json" size={44} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Completed</p>
                    <p className="text-3xl font-bold leading-tight text-emerald-600">{completedCount}</p>
                  </div>
                </div>
              </div>
              {can("cadence", "create") && (
                <Button
                  onClick={() => {
                    setModalDate(TODAY_DATE_STR);
                    setShowCreateModal(true);
                  }}
                  className="bg-sky-600 hover:bg-sky-500 text-white font-semibold gap-1.5 shadow-sm shrink-0"
                >
                  <Plus className="w-4 h-4" /> Create Cadence
                </Button>
              )}
            </div>
          </div>

          {/* Kanban Section */}
          <ScrollContainer className="flex gap-4 -mx-1 px-1 mb-8">
            {/* TODAY Column */}
            <div className="flex flex-1 min-w-[320px] flex-col rounded-xl border border-slate-200 bg-muted/30 h-[580px]">
              <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-200 px-3 py-2.5 bg-blue-50/80 min-h-[52px]">
                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <h3 className="text-sm font-semibold text-foreground flex-1">Today</h3>
                {can("cadence", "create") && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setModalDate(TODAY_DATE_STR);
                      setShowCreateModal(true);
                    }}
                    className="h-8 w-8 hover:bg-slate-100 text-muted-foreground"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {cadences
                  .filter((c) => c.date === TODAY_DATE_STR && c.status !== "completed")
                  .map((c) => (
                    <div
                      key={c.id}
                      className="block rounded-lg border border-slate-200 bg-card p-3 shadow-sm transition-shadow hover:border-slate-400 hover:shadow-md space-y-3"
                    >
                      {/* Item Header */}
                      <div>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <span className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-sky-100 text-sky-800">
                            {c.client}
                          </span>
                          {user?.role === "bh" && getCadenceTag(c.bhId, user?.id, user?.role) === "my_cadence" && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
                              My Cadence
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold leading-snug text-foreground">
                          {c.project}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                          {c.consultant}
                        </p>
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground pt-2 border-t border-slate-200">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Today at {c.time}</span>
                        </div>
                      </div>

                      {/* Log Area — only shown for roles that can update cadence */}
                      {can("cadence", "update") && (
                        <div className="space-y-2 pt-1 border-t border-slate-100">
                          <textarea
                            placeholder="Enter comments here..."
                            value={checkInComments[c.id] || ""}
                            onChange={(e) =>
                              setCheckInComments({ ...checkInComments, [c.id]: e.target.value })
                            }
                            className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 resize-none h-14"
                          />
                          <div className="flex items-center gap-2">
                              <RcaSelect
                                value={checkInRcas[c.id] || ""}
                                onChange={(rca) => {
                                  if (rca) {
                                    setCheckInRcas({ ...checkInRcas, [c.id]: rca });
                                  }
                                }}
                              />
                              <CustomSelect
                                value={checkInStatuses[c.id] || ""}
                                onChange={(v) => setCheckInStatuses({ ...checkInStatuses, [c.id]: v })}
                                placeholder="Select Status"
                                options={[
                                  { value: "not_started", label: "Not Started" },
                                  { value: "completed", label: "Completed" },
                                  { value: "cancelled", label: "Cancelled" },
                                ]}
                                className="w-[118px]"
                                triggerClassName="h-7 py-1 px-2 text-[10px]"
                              />
                            <Button
                              size="icon"
                              onClick={() => handleCheckInSubmit(c.id)}
                              className="h-8 w-8 shrink-0 bg-sky-600 hover:bg-sky-500 text-white rounded-md shadow-sm"
                              title="Submit check-in"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {c.scheduleId != null && (
                        <div className="pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleToggleCardHistory(c)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                          >
                            <History className="w-3.5 h-3.5" />
                            {expandedHistoryId === c.id ? "Hide History" : "Show History"}
                            {c.history.length > 0 && ` (${c.history.length})`}
                          </button>
                          {expandedHistoryId === c.id && (
                            <CadenceHistoryTimeline
                              entries={c.history}
                              loading={loadingCardHistoryId === c.id}
                            />
                          )}
                        </div>
                      )}

                      {/* Raise Ticket */}
                      <div className="pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleRaiseTicket(c)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-md transition-colors w-full justify-center border border-red-200 hover:border-red-300"
                        >
                          <TicketPlus className="w-3.5 h-3.5" />
                          Raise Ticket
                        </button>
                      </div>
                    </div>
                  ))}
                {cadences.filter((c) => c.date === TODAY_DATE_STR && c.status !== "completed")
                  .length === 0 && (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 bg-white rounded-lg border border-dashed border-slate-200 min-h-[150px]">
                      <Check className="w-6 h-6 text-emerald-500 mb-2" />
                      <p className="text-xs font-semibold text-slate-600">All catch-ups completed today!</p>
                    </div>
                  )}
              </div>
            </div>

            {/* PENDING Column */}
            <div className="flex flex-1 min-w-[320px] flex-col rounded-xl border border-slate-200 bg-muted/30 h-[580px]">
              <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-200 px-3 py-2.5 bg-amber-50/80 min-h-[52px]">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <h3 className="text-sm font-semibold text-foreground flex-1">Pending Catch-ups</h3>
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-background/80 px-1.5 text-xs font-medium text-muted-foreground">
                  {cadences.filter((c) => c.date < TODAY_DATE_STR && c.status !== "completed").length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {cadences
                  .filter((c) => c.date < TODAY_DATE_STR && c.status !== "completed")
                  .map((c) => (
                    <div
                      key={c.id}
                      className="block rounded-lg border border-slate-200 bg-card p-3 shadow-sm transition-shadow hover:border-slate-400 hover:shadow-md space-y-3"
                    >
                      {/* Item Header */}
                      <div>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <span className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800">
                            {c.client}
                          </span>
                          {user?.role === "bh" && getCadenceTag(c.bhId, user?.id, user?.role) === "my_cadence" && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
                              My Cadence
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold leading-snug text-foreground">
                          {c.project}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                          {c.consultant}
                        </p>
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground pt-2 border-t border-slate-200">
                          <CalendarIcon className="h-3 w-3 shrink-0" />
                          <span>{c.date} at {c.time}</span>
                        </div>
                      </div>

                      {/* Log Area — only shown for roles that can update cadence */}
                      {can("cadence", "update") && (
                        <div className="space-y-2 pt-1 border-t border-slate-100">
                          <textarea
                            placeholder="Enter comments here..."
                            value={checkInComments[c.id] || ""}
                            onChange={(e) =>
                              setCheckInComments({ ...checkInComments, [c.id]: e.target.value })
                            }
                            className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 resize-none h-14"
                          />
                          <div className="flex items-center gap-2">
                              <RcaSelect
                                value={checkInRcas[c.id] || ""}
                                onChange={(rca) => {
                                  if (rca) {
                                    setCheckInRcas({ ...checkInRcas, [c.id]: rca });
                                  }
                                }}
                              />
                              <CustomSelect
                                value={checkInStatuses[c.id] || ""}
                                onChange={(v) => setCheckInStatuses({ ...checkInStatuses, [c.id]: v })}
                                placeholder="Select Status"
                                options={[
                                  { value: "not_started", label: "Not Started" },
                                  { value: "completed", label: "Completed" },
                                  { value: "cancelled", label: "Cancelled" },
                                ]}
                                className="w-[118px]"
                                triggerClassName="h-7 py-1 px-2 text-[10px]"
                              />
                            <Button
                              size="icon"
                              onClick={() => handleCheckInSubmit(c.id)}
                              className="h-8 w-8 shrink-0 bg-sky-600 hover:bg-sky-500 text-white rounded-md shadow-sm"
                              title="Submit check-in"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {c.scheduleId != null && (
                        <div className="pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleToggleCardHistory(c)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                          >
                            <History className="w-3.5 h-3.5" />
                            {expandedHistoryId === c.id ? "Hide History" : "Show History"}
                            {c.history.length > 0 && ` (${c.history.length})`}
                          </button>
                          {expandedHistoryId === c.id && (
                            <CadenceHistoryTimeline
                              entries={c.history}
                              loading={loadingCardHistoryId === c.id}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* COMPLETED Column */}
            <div className="flex flex-1 min-w-[320px] flex-col rounded-xl border border-slate-200 bg-muted/30 h-[580px]">
              <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-200 px-3 py-2.5 bg-emerald-50/80 min-h-[52px]">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-semibold text-foreground flex-1">Completed</h3>
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-background/80 px-1.5 text-xs font-medium text-muted-foreground">
                  {cadences.filter((c) => c.status === "completed").length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2 overflow-y-auto min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {cadences
                  .filter((c) => c.status === "completed")
                  .map((c) => (
                    <div
                      key={c.id}
                      className="block rounded-lg border border-slate-200 bg-card p-3 shadow-sm transition-shadow hover:border-slate-400 hover:shadow-md space-y-3"
                    >
                      {/* Header */}
                      <div>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <span className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-800">
                            {c.client}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                          {user?.role === "bh" && getCadenceTag(c.bhId, user?.id, user?.role) === "my_cadence" && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">
                              My Cadence
                            </span>
                          )}
                          <div
                            className={`h-4 w-4 rounded-full shrink-0 border ${c.rag === "Green"
                              ? "bg-emerald-500 border-emerald-600"
                              : c.rag === "Amber"
                                ? "bg-amber-500 border-amber-600"
                                : "bg-red-500 border-red-600"
                              }`}
                          />
                          </div>
                        </div>
                        <p className="text-sm font-semibold leading-snug text-foreground">
                          {c.project}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                          {c.consultant}
                        </p>
                        <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground pt-2 border-t border-slate-200">
                          <CalendarIcon className="h-3 w-3 shrink-0" />
                          <span>{c.date}</span>
                        </div>
                      </div>

                      {/* Logged Comment */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                        <p className="text-slate-600 italic leading-relaxed">
                          "{c.comment || "No comments entered."}"
                        </p>
                      </div>

                      {can("cadence", "update") && (
                        <div className="pt-2 border-t border-slate-100">
                          <RcaSelect
                            value={getRcaSelectValue(c)}
                            onChange={(rca) => handleCompletedRcaChange(c.id, rca)}
                          />
                        </div>
                      )}

                      {c.scheduleId != null && (
                        <div className="pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleToggleCardHistory(c)}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                          >
                            <History className="w-3.5 h-3.5" />
                            {expandedHistoryId === c.id ? "Hide History" : "Show History"}
                            {c.history.length > 0 && ` (${c.history.length})`}
                          </button>
                          {expandedHistoryId === c.id && (
                            <CadenceHistoryTimeline
                              entries={c.history}
                              loading={loadingCardHistoryId === c.id}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </ScrollContainer>

          {/* Calendar Timeline Section */}
          <div className="space-y-6 mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 gap-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-sky-500" /> Month Timeline
                </h3>
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handlePrevMonth}
                    className="h-7 w-7 text-slate-500 hover:text-slate-800"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-bold text-slate-700 min-w-[100px] text-center">
                    {monthNames[currentMonth]} {currentYear}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleNextMonth}
                    className="h-7 w-7 text-slate-500 hover:text-slate-800"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Timeline Horizontal Day Grid — one column per calendar day in the month */}
              <ScrollContainer>
                {loadingTimeline ? (
                  <div className="flex items-center justify-center py-8 text-sm text-slate-400 font-medium">
                    Loading timeline…
                  </div>
                ) : (
                  <div
                    className="flex divide-x divide-slate-100 border border-slate-200 rounded-xl overflow-hidden"
                    style={{ minWidth: `${Math.max(daysInMonth * 52, 320)}px` }}
                  >
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const dayNum = i + 1;
                      const daySessions = timelineByDay[dayNum] || [];
                      const todayParts = TODAY_DATE_STR.split("-");
                      const isToday =
                        currentYear === Number(todayParts[0]) &&
                        currentMonth === Number(todayParts[1]) - 1 &&
                        dayNum === Number(todayParts[2]);

                      return (
                        <div
                          key={dayNum}
                          className={`flex-1 min-w-[52px] p-2 text-center flex flex-col items-center justify-between min-h-[140px] transition-colors bg-white ${isToday ? "ring-2 ring-inset ring-sky-400/60" : "hover:bg-white"
                            }`}
                        >
                          <span
                            className={`text-xs font-bold tracking-tight px-1.5 py-0.5 rounded-full ${isToday
                              ? "bg-sky-600 text-white font-extrabold shadow-sm"
                              : "text-slate-400"
                              }`}
                          >
                            {dayNum}
                          </span>

                          <div className="flex flex-col gap-1 w-full mt-2 justify-center items-center">
                            {daySessions.slice(0, 3).map((session) => {
                              const consultantName = session.consultant_name || "Unknown";
                              const isSessionToday = session.scheduled_date === TODAY_DATE_STR;

                              return (
                                <Tooltip key={session.id}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className={`h-5 w-5 rounded-full border flex items-center justify-center text-[8px] font-black text-white shadow-sm shrink-0 cursor-default ${isSessionToday
                                        ? "bg-sky-500 border-sky-600 animate-pulse"
                                        : "bg-amber-500 border-amber-600"
                                        }`}
                                      aria-label={consultantName}
                                    >
                                      {getInitials(consultantName)}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="bg-slate-900 text-white px-2.5 py-1.5 rounded shadow-md border border-slate-800"
                                  >
                                    <p className="font-semibold text-xs">{consultantName}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                            {daySessions.length > 3 && (
                              <span className="text-[9px] font-bold text-slate-400">
                                +{daySessions.length - 3}
                              </span>
                            )}
                            {daySessions.length === 0 && (
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-200 mt-2" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollContainer>
          </div>

          {/* Tabular Column / Grid listing */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-500" /> Cadence Registry
              </h3>

              <div className="flex flex-wrap items-center gap-3">
                {/* Cadence Tag filter — BH only */}
                {user?.role === "bh" && (
                  <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                    {(["all", "my_cadence", "team_cadence"] as const).map((tag) => (
                      <Button
                        key={tag}
                        size="sm"
                        variant={cadenceTagFilter === tag ? "secondary" : "ghost"}
                        onClick={() => setCadenceTagFilter(tag)}
                        className={`h-7 px-2.5 text-xs font-semibold ${
                          cadenceTagFilter === tag
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {tag === "all" ? "All" : tag === "my_cadence" ? "My Cadence" : "Team Cadence"}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Search */}
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search consultant, client..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-md pl-9 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400"
                  />
                </div>

                {/* Date Range Picker */}
                <CustomDateRangePicker
                  value={registryDateRange}
                  onChange={(newValue) => setRegistryDateRange(newValue)}
                />

                {/* Filters */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                  <Button
                    size="sm"
                    variant={tableFilter === "all" ? "secondary" : "ghost"}
                    onClick={() => setTableFilter("all")}
                    className={`h-7 px-2.5 text-xs font-semibold ${tableFilter === "all"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                      }`}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={tableFilter === "pending" ? "secondary" : "ghost"}
                    onClick={() => setTableFilter("pending")}
                    className={`h-7 px-2.5 text-xs font-semibold ${tableFilter === "pending"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                      }`}
                  >
                    Pending
                  </Button>
                  <Button
                    size="sm"
                    variant={tableFilter === "completed" ? "secondary" : "ghost"}
                    onClick={() => setTableFilter("completed")}
                    className={`h-7 px-2.5 text-xs font-semibold ${tableFilter === "completed"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                      }`}
                  >
                    Completed
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  disabled={exporting || loadingRegistry}
                  className="gap-1.5 text-sm border-slate-200 text-slate-700 hover:bg-slate-50"
                  title="Export to Excel"
                >
                  {exporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {exporting ? "Exporting…" : "Export"}
                </Button>
              </div>
            </div>

            {/* Grid Table */}
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm mt-4">
              <Table>
                <TableHeader className="bg-slate-100 border-b border-slate-200">
                  <TableRow className="hover:bg-transparent border-0">
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Project</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Consultant</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Cadence Status</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">RAG</TableHead>
                    {user?.role === "bh" && (
                      <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Tag</TableHead>
                    )}
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Comment / Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingRegistry ? (
                    <TableRow>
                      <TableCell colSpan={user?.role === "bh" ? 8 : 7} className="h-24 text-center text-slate-400">
                        Loading registry…
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {filteredRegistrySessions.map((session) => {
                        const rag = formatRagStatus(session.rca_status);
                        return (
                          <React.Fragment key={session.id}>
                            <TableRow
                              className="hover:bg-slate-50 transition-colors cursor-pointer"
                              onClick={() => handleToggleRegistryRow(session.schedule_id, session.id)}
                            >
                              <TableCell className="font-semibold text-slate-900">
                                {session.scheduled_date}
                              </TableCell>
                              <TableCell>{session.client_name}</TableCell>
                              <TableCell className="text-slate-500">
                                {session.project_name || "—"}
                              </TableCell>
                              <TableCell className="font-semibold text-slate-900">
                                {session.consultant_name}
                              </TableCell>
                              <TableCell className="capitalize text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${session.status === "completed"
                                  ? "bg-sky-50 text-sky-600 border border-sky-200"
                                  : session.status === "cancelled"
                                    ? "bg-slate-100 text-slate-500 border border-slate-200"
                                    : "bg-amber-50 text-amber-600 border border-amber-200"
                                  }`}>
                                  {session.status.replace("_", " ")}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                {rag ? (
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${rag.toLowerCase() === "green"
                                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                      : rag.toLowerCase() === "amber"
                                        ? "bg-amber-50 text-amber-600 border border-amber-200"
                                        : "bg-red-50 text-red-600 border border-red-200"
                                      }`}
                                  >
                                    {rag}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic font-semibold">
                                    Pending
                                  </span>
                                )}
                              </TableCell>
                              {user?.role === "bh" && (() => {
                                const tag = getCadenceTag(session.bh_id, user?.id, user?.role);
                                return (
                                  <TableCell className="text-center">
                                    {tag === "my_cadence" ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200">
                                        My Cadence
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                                        Team Cadence
                                      </span>
                                    )}
                                  </TableCell>
                                );
                              })()}
                              <TableCell className="max-w-[250px] truncate text-slate-500 italic">
                                {session.comments || "N/A"}
                              </TableCell>
                            </TableRow>
                            {registryExpandedRowId === session.id && (
                              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                                <TableCell colSpan={user?.role === "bh" ? 8 : 7} className="p-4 border-t border-slate-100">
                                  {loadingRegistryHistory ? (
                                    <div className="text-center text-xs text-slate-400 p-4">Loading timeline...</div>
                                  ) : registryHistorySessions.length > 0 ? (
                                    <div className="space-y-4 max-w-2xl">
                                      <h4 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">History Timeline</h4>
                                      <div className="relative border-l border-slate-200 ml-3 space-y-4">
                                        {registryHistorySessions.map((histSession, idx) => {
                                          const hRag = formatRagStatus(histSession.rca_status);
                                          return (
                                            <div key={idx} className="relative pl-6">
                                              <span
                                                className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white ${hRag?.toLowerCase() === "green"
                                                  ? "bg-emerald-500"
                                                  : hRag?.toLowerCase() === "amber"
                                                    ? "bg-amber-500"
                                                    : hRag?.toLowerCase() === "red"
                                                      ? "bg-red-500"
                                                      : "bg-slate-300"
                                                  }`}
                                              />
                                              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="flex items-center justify-between font-bold text-slate-700 text-[11px] mb-1">
                                                  <span>{histSession.scheduled_date}</span>
                                                  <span className="text-slate-400 font-medium capitalize">
                                                    Status: {histSession.status.replace("_", " ")}
                                                  </span>
                                                </div>
                                                <p className="text-slate-600 text-xs italic mt-1">
                                                  {histSession.comments || "No comments entered."}
                                                </p>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-center text-xs text-slate-400 p-4">No history available for this cadence.</div>
                                  )}
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {!loadingRegistry && filteredRegistrySessions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={user?.role === "bh" ? 8 : 7} className="h-24 text-center text-slate-400">
                            No cadences matching filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex justify-center mt-4">
              <CustomTablePagination
                rowsPerPageOptions={[5, 10, 25, 50, 100]}
                count={registryTotal}
                page={registryPage - 1}
                onPageChange={(e: any, newPage: number) => setRegistryPage(newPage + 1)}
                rowsPerPage={registryPerPage}
                onRowsPerPageChange={(e: any) => {
                  setRegistryPerPage(parseInt(e.target.value, 10));
                  setRegistryPage(1);
                }}
              />
            </div>
          </div>
        </main>

        {/* CREATE CADENCE POPUP MODAL DIALOG */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-sky-500" /> New catch-up Cadence
                </h3>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowCreateModal(false)}
                  className="h-8 w-8 hover:bg-slate-200 rounded-lg text-slate-400"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleCreateCadence} className="p-6 space-y-4 text-xs font-semibold">
                <div className="space-y-1">
                  <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                    Client Partner
                  </label>
                  {loadingClients ? (
                    <div className="text-xs text-slate-400 p-2 italic">Loading clients...</div>
                  ) : (
                    <SearchableSelect
                      value={String(modalClientId)}
                      onChange={(v) => setModalClientId(v ? Number(v) : "")}
                      options={apiClients.map((cl) => ({
                        value: String(cl.id),
                        label: `${cl.name} (${cl.industry})`,
                      }))}
                      placeholder="Select a Client"
                      searchPlaceholder="Search clients..."
                      triggerClassName="h-10"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                    Project Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Migration Phase 2"
                    value={modalProject}
                    onChange={(e) => setModalProject(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                    Consultant
                  </label>
                  {loadingConsultants ? (
                    <div className="text-xs text-slate-400 p-2 italic">Loading consultants...</div>
                  ) : (
                    <SearchableSelect
                      value={String(modalConsultantId)}
                      onChange={(v) => setModalConsultantId(v ? Number(v) : "")}
                      options={apiConsultants.map((c) => ({
                        value: String(c.id),
                        label: `${c.name} (${c.emp_id})`,
                      }))}
                      placeholder={!modalClientId ? "Select a client first" : "Search consultants..."}
                      searchPlaceholder="Type name or emp ID..."
                      disabled={!modalClientId}
                      triggerClassName="h-10"
                    />
                  )}
                </div>

                {/* BH Tagging — optional, only shown when the client has a BH assigned */}
                {modalBhId && (
                  <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                    <div>
                      <p className="text-xs font-bold text-slate-800">Add BH to this cadence?</p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {modalBhName} — will appear as "My Cadence" in their view
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={modalAddBh}
                      onChange={(e) => setModalAddBh(e.target.checked)}
                      className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                      Date
                    </label>
                    <CustomDatePicker
                      value={modalDate ? dayjs(modalDate) : null}
                      onChange={(d) => setModalDate(d ? d.format("YYYY-MM-DD") : "")}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                      Meeting Time
                    </label>
                    <CustomTimePicker
                      value={modalMeetingTime}
                      onChange={(t) => setModalMeetingTime(t)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                      Duration
                    </label>
                    <CustomSelect
                      value={modalTime}
                      onChange={setModalTime}
                      options={[
                        { value: "15 mins", label: "15 minutes" },
                        { value: "30 mins", label: "30 minutes" },
                        { value: "1 hr", label: "1 hour" },
                        { value: "Custom", label: "Custom slot" },
                      ]}
                      triggerClassName="h-10 text-xs"
                    />
                  </div>

                  {modalTime === "Custom" ? (
                    <div className="space-y-1 animate-in zoom-in-95 duration-200">
                      <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                        Duration (mins)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 45"
                        value={modalCustomDuration}
                        onChange={(e) => setModalCustomDuration(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 font-semibold"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1 opacity-50 select-none">
                      <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                        Duration (mins)
                      </label>
                      <input
                        type="text"
                        disabled
                        value={modalTime === "15 mins" ? "15" : modalTime === "30 mins" ? "30" : "60"}
                        className="w-full bg-white border border-slate-200 rounded-md p-2.5 text-xs text-slate-400 font-semibold cursor-not-allowed opacity-60"
                      />
                    </div>
                  )}
                </div>

                {/* Recurring Switch */}
                <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Recurring catch-up cadence</p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      Auto-generate catch-ups on a recurring schedule
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalRecurring}
                    onChange={(e) => setModalRecurring(e.target.checked)}
                    className="h-4 w-4 rounded text-sky-600 focus:ring-sky-500"
                  />
                </div>

                {modalRecurring && (
                  <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-1">
                      <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                        Frequency
                      </label>
                      <CustomSelect
                        value={String(modalFrequencyWeeks)}
                        onChange={(v) => setModalFrequencyWeeks(Number(v))}
                        options={CADENCE_FREQUENCY_OPTIONS.map((opt) => ({
                          value: String(opt.value),
                          label: opt.label,
                        }))}
                        triggerClassName="h-10 text-xs"
                      />
                      <p className="text-[10px] text-slate-400 font-medium">
                        {getCadenceFrequencyLabel(modalFrequencyWeeks)} schedule
                      </p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                        End Date (Till Date)
                      </label>
                      <CustomDatePicker
                        value={modalTillDate ? dayjs(modalTillDate) : null}
                        onChange={(d) => setModalTillDate(d ? d.format("YYYY-MM-DD") : "")}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-150">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creatingCadence}
                    className="text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={creatingCadence}
                    className="bg-sky-600 hover:bg-sky-500 text-white font-bold"
                  >
                    {creatingCadence ? "Scheduling..." : "Schedule Catch-up"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Cadence Created Success Notice ───────────────────────────── */}
        {showSuccessNotice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Green top bar */}
              <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 to-teal-500" />

              <div className="p-6 text-center">
                {/* Icon */}
                <div className="mx-auto mb-4 flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100">
                  <Check className="w-7 h-7 text-emerald-500" />
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-1">Cadence Scheduled!</h3>
                <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                  The cadence has been created and invites have been sent to all participants.
                </p>

                {/* Channels */}
                <div className="space-y-2.5 mb-5 text-left">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center">
                      <CalendarIcon className="w-3.5 h-3.5 text-sky-500" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Google Calendar</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        A calendar invite with the joining link has been added to your Google Calendar and all participants'.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Email</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        A confirmation email with meeting details has been sent from support@joulestowatts.com.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Meet link CTA */}
                {successMeetLink && (
                  <a
                    href={successMeetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-4 mb-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    Join Google Meet
                  </a>
                )}

                <button
                  onClick={() => setShowSuccessNotice(false)}
                  className="w-full py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ─────────────────────────────────────────────────────────────── */}

      </div>
    </TooltipProvider>
  );
}
