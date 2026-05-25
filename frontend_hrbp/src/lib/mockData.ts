export type Cohort =
  | "Star"
  | "High Performer"
  | "Rising"
  | "Bedrock"
  | "New Joiner"
  | "Watch Exit"
  | "Watch Rate Revision"
  | "Watch General"
  | "Rescue/PIP";

export type SOPType =
  | "SOP-2 Resignation"
  | "SOP-3 Contract Renewal"
  | "SOP-4 Conversion"
  | "SOP-5 PIP"
  | "SOP-6 Misconduct"
  | "SOP-7 Absconding"
  | "SOP-8 Medical"
  | "Rate Revision"
  | "Hike Planning";

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type TicketStatus = "Open" | "In Progress" | "Awaiting Approval" | "Resolved" | "Closed";

export interface Client {
  id: string;
  name: string;
  industry: string;
  bhOwner: string;
  headcount: number;
  poValue: number;
  activeIncidents: number;
  kraHealth: "Green" | "Amber" | "Red";
  lastBhCall: string;
  nextDue: string;
}

export interface Consultant {
  id: string;
  empId: string;
  name: string;
  clientId: string;
  manager: string;
  modality: "Onsite" | "Remote" | "Hybrid";
  skill: string;
  poAmount: number;
  ctc: number;
  margin: number;
  tenure: string;
  cohort: Cohort;
  bhFeedback: string;
  nps: number;
  hike: string;
  ldStatus: string;
  riskScore: number;
}

export interface Ticket {
  id: string;
  consultantId: string;
  sopType: SOPType;
  riskLevel: RiskLevel;
  currentStep: string;
  owner: string;
  deadline: string;
  daysOpen: number;
  status: TicketStatus;
  description: string;
  source: string;
  createdAt: string;
  steps: { label: string; done: boolean; due: string }[];
  notes: { author: string; at: string; text: string }[];
  comms: { type: string; subject: string; at: string }[];
}

export interface Signal {
  id: string;
  consultantId: string;
  type: string;
  risk: RiskLevel;
  action: string;
  at: string;
}

export interface ActionItem {
  id: string;
  consultantId: string;
  action: string;
  urgency: RiskLevel;
  ticketId?: string;
  due: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "pip" | "renewal" | "nps" | "bh" | "escalation";
  at: string;
  read: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
}

export const clients: Client[] = [
  {
    id: "c1",
    name: "Acme Financial",
    industry: "BFSI",
    bhOwner: "Priya Mehta",
    headcount: 42,
    poValue: 18500000,
    activeIncidents: 5,
    kraHealth: "Amber",
    lastBhCall: "2026-05-12",
    nextDue: "2026-05-22",
  },
  {
    id: "c2",
    name: "Northwind Health",
    industry: "Healthcare",
    bhOwner: "Rohit Sharma",
    headcount: 28,
    poValue: 12200000,
    activeIncidents: 2,
    kraHealth: "Green",
    lastBhCall: "2026-05-15",
    nextDue: "2026-05-29",
  },
  {
    id: "c3",
    name: "Vertex Cloud",
    industry: "SaaS",
    bhOwner: "Anjali Rao",
    headcount: 64,
    poValue: 28900000,
    activeIncidents: 8,
    kraHealth: "Red",
    lastBhCall: "2026-05-09",
    nextDue: "2026-05-20",
  },
  {
    id: "c4",
    name: "BlueOcean Retail",
    industry: "Retail",
    bhOwner: "Karan Patel",
    headcount: 19,
    poValue: 7400000,
    activeIncidents: 1,
    kraHealth: "Green",
    lastBhCall: "2026-05-14",
    nextDue: "2026-05-28",
  },
  {
    id: "c5",
    name: "Helios Manufacturing",
    industry: "Manufacturing",
    bhOwner: "Priya Mehta",
    headcount: 35,
    poValue: 15600000,
    activeIncidents: 3,
    kraHealth: "Amber",
    lastBhCall: "2026-05-11",
    nextDue: "2026-05-25",
  },
];

const cohortPool: Cohort[] = [
  "Star",
  "High Performer",
  "Rising",
  "Bedrock",
  "New Joiner",
  "Watch Exit",
  "Watch Rate Revision",
  "Watch General",
  "Rescue/PIP",
];

const firstNames = [
  "Aarav",
  "Diya",
  "Vihaan",
  "Ishita",
  "Kabir",
  "Saanvi",
  "Reyansh",
  "Anaya",
  "Arjun",
  "Myra",
  "Aditya",
  "Riya",
  "Vivaan",
  "Kavya",
  "Ayaan",
  "Tara",
  "Ansh",
  "Zara",
  "Dev",
  "Nisha",
  "Rohan",
  "Aanya",
  "Yash",
  "Pari",
  "Karan",
  "Mira",
  "Aryan",
  "Sara",
  "Veer",
  "Ira",
];
const lastNames = [
  "Sharma",
  "Verma",
  "Iyer",
  "Reddy",
  "Khan",
  "Singh",
  "Patel",
  "Kapoor",
  "Nair",
  "Joshi",
  "Menon",
  "Bose",
  "Gupta",
  "Rao",
  "Pillai",
];
const skills = [
  "Java Backend",
  "React Frontend",
  "Data Engineering",
  "DevOps",
  "Salesforce",
  "SAP ABAP",
  "Python ML",
  "QA Automation",
  "iOS Native",
  "Cloud Architect",
];
const managers = ["Priya Mehta", "Rohit Sharma", "Anjali Rao", "Karan Patel", "Suresh Iyer"];

function seed(n: number): Consultant[] {
  const out: Consultant[] = [];
  for (let i = 0; i < n; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const cohort = cohortPool[i % cohortPool.length];
    const client = clients[i % clients.length];
    const po = 80000 + ((i * 7) % 90) * 1000;
    const ctc = po * 0.6;
    out.push({
      id: `u${i + 1}`,
      empId: `J2W${1000 + i}`,
      name: `${fn} ${ln}`,
      clientId: client.id,
      manager: managers[i % managers.length],
      modality: (["Onsite", "Remote", "Hybrid"] as const)[i % 3],
      skill: skills[i % skills.length],
      poAmount: po,
      ctc,
      margin: po - ctc,
      tenure: `${1 + (i % 36)} mo`,
      cohort,
      bhFeedback:
        cohort === "Star"
          ? "Exceptional delivery, client favorite."
          : cohort === "Rescue/PIP"
            ? "Performance concerns flagged, action plan active."
            : "Steady contributor, meeting expectations.",
      nps: cohort === "Star" ? 9 : cohort === "Rescue/PIP" ? 4 : 7,
      hike: i % 4 === 0 ? "Due Q3" : "Not due",
      ldStatus: i % 3 === 0 ? "In Progress" : "Completed",
      riskScore:
        cohort === "Rescue/PIP"
          ? 85
          : cohort.startsWith("Watch")
            ? 60
            : cohort === "Star"
              ? 10
              : 30,
    });
  }
  return out;
}

export const consultants: Consultant[] = seed(48);

const sopSteps: Record<SOPType, string[]> = {
  "SOP-2 Resignation": [
    "Acknowledge resignation",
    "Schedule retention call",
    "Get written withdrawal or confirm",
    "BH approval",
    "Closure",
  ],
  "SOP-3 Contract Renewal": [
    "Renewal flag",
    "BH alignment",
    "Client confirmation",
    "Paperwork",
    "Activation",
  ],
  "SOP-4 Conversion": [
    "Eligibility check",
    "BH approval",
    "Client sign-off",
    "Offer release",
    "Conversion complete",
  ],
  "SOP-5 PIP": [
    "PIP plan drafted",
    "Week 1 review",
    "Week 2 review",
    "Week 3 review",
    "Final outcome",
  ],
  "SOP-6 Misconduct": ["Incident report", "Investigation", "Hearing", "Decision", "Closure"],
  "SOP-7 Absconding": [
    "Initial contact attempt",
    "Family contact",
    "Formal notice",
    "BH escalation",
    "Closure",
  ],
  "SOP-8 Medical": [
    "Medical proof",
    "Leave approval",
    "Coverage plan",
    "Return-to-work",
    "Closure",
  ],
  "Rate Revision": ["Request logged", "Margin analysis", "Client pitch", "Approval", "Activation"],
  "Hike Planning": ["Eligibility", "Manager input", "Recommendation", "Approval", "Communication"],
};

export const tickets: Ticket[] = consultants.slice(0, 22).map((c, i) => {
  const sops = Object.keys(sopSteps) as SOPType[];
  const sop = sops[i % sops.length];
  const steps = sopSteps[sop];
  const stepIdx = i % steps.length;
  const risk: RiskLevel = ["Low", "Medium", "High", "Critical"][i % 4] as RiskLevel;
  const status: TicketStatus = ["Open", "In Progress", "Awaiting Approval", "Resolved", "Closed"][
    i % 5
  ] as TicketStatus;
  return {
    id: `TKT-${2400 + i}`,
    consultantId: c.id,
    sopType: sop,
    riskLevel: risk,
    currentStep: steps[stepIdx],
    owner: managers[i % managers.length],
    deadline: `2026-05-${20 + (i % 10)}`,
    daysOpen: (i * 3) % 18,
    status,
    description: `Auto-generated ${sop} ticket for ${c.name}.`,
    source: ["Email", "Slack", "BH flag", "System signal"][i % 4],
    createdAt: `2026-05-${5 + (i % 14)}`,
    steps: steps.map((s, idx) => ({
      label: s,
      done: idx < stepIdx,
      due: `2026-05-${18 + idx}`,
    })),
    notes: [
      {
        author: "Priya Mehta",
        at: "2026-05-15",
        text: "Initial assessment completed. Risk noted.",
      },
      {
        author: "Rohit Sharma",
        at: "2026-05-17",
        text: "Scheduled retention conversation for tomorrow.",
      },
    ],
    comms: [{ type: "Email", subject: `Re: ${sop}`, at: "2026-05-16" }],
  };
});

export const signals: Signal[] = consultants.slice(0, 15).map((c, i) => ({
  id: `sig-${i + 1}`,
  consultantId: c.id,
  type: ["NPS drop", "Late check-in", "Manager concern", "Client escalation", "Skill gap"][i % 5],
  risk: ["Low", "Medium", "High", "Critical"][i % 4] as RiskLevel,
  action: "Owner alerted, plan in motion.",
  at: `2026-05-${10 + (i % 10)}`,
}));

export const actionQueue: ActionItem[] = consultants.slice(0, 10).map((c, i) => ({
  id: `act-${i + 1}`,
  consultantId: c.id,
  action: [
    "Call to confirm withdrawal",
    "Run PIP week-2 review",
    "BH sign-off pending",
    "Send renewal letter",
    "NPS follow-up call",
  ][i % 5],
  urgency: ["High", "Critical", "Medium", "Low"][i % 4] as RiskLevel,
  ticketId: tickets[i]?.id,
  due: i < 5 ? "Today" : "Tomorrow",
}));

export const notifications: NotificationItem[] = [
  {
    id: "n1",
    title: "Overdue PIP Review",
    message: "Aarav Sharma's week-2 PIP review is 2 days overdue.",
    type: "pip",
    at: "2h ago",
    read: false,
  },
  {
    id: "n2",
    title: "Contract Renewal",
    message: "5 contracts at Vertex Cloud expire in <90 days.",
    type: "renewal",
    at: "4h ago",
    read: false,
  },
  {
    id: "n3",
    title: "Low NPS Alert",
    message: "Diya Verma scored 4 on latest NPS.",
    type: "nps",
    at: "Yesterday",
    read: false,
  },
  {
    id: "n4",
    title: "Pending BH Call",
    message: "Acme Financial weekly BH sync is due today.",
    type: "bh",
    at: "6h ago",
    read: true,
  },
  {
    id: "n5",
    title: "Escalation",
    message: "TKT-2407 escalated to Ops Head — awaiting decision.",
    type: "escalation",
    at: "Yesterday",
    read: true,
  },
];

export const emailTemplates: EmailTemplate[] = [
  {
    id: "t1",
    name: "Retention — Opening",
    subject: "Checking in on your J2W journey",
    body: "Hi {{name}},\n\nI wanted to check in and hear how things are going at {{client}}. Could we find 15 minutes this week?\n\nBest,\nHRBP Team",
    category: "Retention",
  },
  {
    id: "t2",
    name: "PIP — Week 1",
    subject: "Your PIP — Week 1 review",
    body: "Hi {{name}},\n\nGreat work on the first week of your improvement plan. Here are the focus items for week 2...\n\nBest,\nHRBP Team",
    category: "PIP",
  },
  {
    id: "t3",
    name: "Contract Renewal",
    subject: "Contract renewal — next steps",
    body: "Hi {{name}},\n\nYour contract with {{client}} is up for renewal. Please confirm the next steps...\n\nBest,\nHRBP Team",
    category: "Renewal",
  },
  {
    id: "t4",
    name: "Resignation Acknowledgement",
    subject: "Re: Resignation",
    body: "Hi {{name}},\n\nWe have received your note. Before processing, could we schedule a brief conversation?\n\nBest,\nHRBP Team",
    category: "Resignation",
  },
];

export const sentEmails = [
  {
    id: "e1",
    date: "2026-05-17",
    template: "Retention — Opening",
    recipient: "aarav@acme.com",
    subject: "Checking in on your J2W journey",
    status: "Delivered",
  },
  {
    id: "e2",
    date: "2026-05-16",
    template: "PIP — Week 1",
    subject: "Your PIP — Week 1 review",
    recipient: "diya@vertex.com",
    status: "Opened",
  },
  {
    id: "e3",
    date: "2026-05-15",
    template: "Contract Renewal",
    subject: "Contract renewal — next steps",
    recipient: "kabir@northwind.com",
    status: "Delivered",
  },
];

export const kpis = {
  totalConsultants: consultants.length,
  totalClients: clients.length,
  activeIncidents: tickets.filter((t) => t.status !== "Closed" && t.status !== "Resolved").length,
  closedThisMonth: 14,
  rescuePip: consultants.filter((c) => c.cohort === "Rescue/PIP").length,
  starPerformers: consultants.filter((c) => c.cohort === "Star").length,
  watchlist: consultants.filter((c) => c.cohort.startsWith("Watch")).length,
  newJoiners: consultants.filter((c) => c.cohort === "New Joiner").length,
  rateRevisionPending: 7,
  poRenewalsUnder90: 9,
  npsResponsePct: 78,
  revenueProtected: 4250000,
};

export const cohortBadgeStyles: Record<Cohort, string> = {
  Star: "bg-amber-100 text-amber-800 border-amber-200",
  "High Performer": "bg-emerald-100 text-emerald-800 border-emerald-200",
  Rising: "bg-sky-100 text-sky-800 border-sky-200",
  Bedrock: "bg-slate-100 text-slate-700 border-slate-200",
  "New Joiner": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Watch Exit": "bg-orange-100 text-orange-800 border-orange-200",
  "Watch Rate Revision": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Watch General": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  "Rescue/PIP": "bg-red-100 text-red-800 border-red-200",
};

export const riskBadgeStyles: Record<RiskLevel, string> = {
  Low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Medium: "bg-amber-100 text-amber-800 border-amber-200",
  High: "bg-orange-100 text-orange-800 border-orange-200",
  Critical: "bg-red-100 text-red-800 border-red-200",
};

export function fmtINR(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function findConsultant(id: string) {
  return consultants.find((c) => c.id === id);
}
export function findClient(id: string) {
  return clients.find((c) => c.id === id);
}
export function findTicket(id: string) {
  return tickets.find((t) => t.id === id);
}
