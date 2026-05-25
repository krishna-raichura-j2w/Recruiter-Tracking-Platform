import React from 'react';
import { Check, X, Plus, ChevronDown, CheckSquare } from 'lucide-react';
import { TopBar } from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const MOCK_INBOX = [
  {
    id: 1, initials: "GE", 
    subject: "Sub: Imran; PIP to be initiated",
    preview: "Dear Rubin, Please note that we are going to initiate PIP for Imran starting today effective, a buffer period of 12 days will be used to monitor the same",
    read: false,
  },
  {
    id: 2, initials: "GE",
    subject: "Sub: Imran; PIP to be initiated", 
    preview: "Dear Rubin, Please note that we are going to initiate PIP for Imran starting today effective, a buffer period of 12 days will be used to monitor the same",
    read: true,
  },
  {
    id: 3, initials: "GE",
    subject: "Sub: Imran; PIP to be initiated",
    preview: "Dear Rubin, Please note that we are going to initiate PIP for Imran starting today effective, a buffer period of 12 days will be used to monitor the same",
    read: true,
  },
];

const MOCK_TICKETS = [
  {
    id: "Tckt12002",
    label: "Exit Risk : SOP 2",
    steps: [
      { status: "done" },     // green
      { status: "overdue" },  // red
      { status: "pending" },  // red
      { status: "pending" },  // red
    ],
  },
];

const MOCK_ACTIONS = [
  {
    ticketId: "Tckt12002",
    label: "Exit Risk : SOP 2",
    action: "Call and understand this and that of that and this",
    responseText: "",
  },
];

const MOCK_STATS = {
  ticketsAndActions: "33/12",
  poAtRisk: "12,32,190",
  poRetained: "22,82,127",
};

export default function IncidentEngine() {
  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <TopBar 
        title="Incident Engine" 
        subtitle="Manage and resolve critical incidents across all SOPs."
      />

      <main className="flex-1 p-6 md:p-8 space-y-8">
        
        {/* Stats Row + Inbox Panel */}
        <div className="flex flex-col lg:flex-row gap-6">
          
          {/* Stats Row */}
          <div className="lg:w-[65%] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
              <CardContent className="p-5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Tickets & Action</div>
                <div className="text-3xl font-black text-slate-900 tabular-nums">{MOCK_STATS.ticketsAndActions}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
              <CardContent className="p-5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">PO at Risk</div>
                <div className="text-3xl font-black text-slate-900 tabular-nums">{MOCK_STATS.poAtRisk}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
              <CardContent className="p-5">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">PO Retained</div>
                <div className="text-3xl font-black text-slate-900 tabular-nums">{MOCK_STATS.poRetained}</div>
              </CardContent>
            </Card>
          </div>

          {/* Inbox Panel */}
          <Card className="lg:w-[35%] flex flex-col border-slate-200 shadow-sm overflow-hidden min-h-[160px]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/80">
              <h3 className="text-sm font-semibold text-slate-900">Inbox</h3>
            </div>
            <div className="flex flex-col flex-1 max-h-[300px] overflow-y-auto">
              {MOCK_INBOX.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex items-start p-3 border-b border-slate-100 last:border-b-0 transition-colors ${msg.read ? 'bg-white hover:bg-slate-50/50' : 'bg-sky-50/30 hover:bg-sky-50/60'}`}
                >
                  <div className="flex-shrink-0 mr-3 mt-0.5">
                    <div className="bg-slate-200 text-slate-700 text-xs w-8 h-8 rounded-full flex items-center justify-center font-bold border border-slate-300">
                      {msg.initials}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 mr-2">
                    <div className={`text-sm text-slate-800 ${!msg.read ? 'font-bold' : 'font-medium'} truncate`}>{msg.subject}</div>
                    <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                      {msg.preview}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-sky-600 hover:bg-sky-100 hover:text-sky-700"><Check size={14} strokeWidth={3} /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={14} strokeWidth={3} /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Ticket Engine Section */}
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center px-4 py-3 border-b border-slate-200 bg-slate-50/80">
            <h2 className="text-sm font-semibold text-slate-900">Ticket Engine</h2>
          </div>
          <CardContent className="p-4">
            <textarea 
              placeholder="Paste the description here..."
              className="w-full h-24 resize-none border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 text-slate-700 placeholder:text-slate-400"
            ></textarea>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" size="sm" className="text-slate-700 border-slate-200">Select SOP</Button>
              <Button size="icon" className="h-8 w-8 bg-sky-600 hover:bg-sky-500 text-white shadow-sm"><Plus size={16} /></Button>
              <Button size="sm" className="bg-sky-600 hover:bg-sky-500 text-white shadow-sm">Create Ticket</Button>
            </div>
          </CardContent>
        </Card>

        {/* Bottom Two-Panel Row */}
        <div className="flex flex-col lg:flex-row gap-6 pb-6">
          
          {/* Ticket Panel */}
          <Card className="flex-1 border-slate-200 shadow-sm flex flex-col min-h-[420px] overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 bg-slate-50/80">
              <h2 className="text-sm font-semibold text-slate-900">Ticket</h2>
              <div className="text-xs font-semibold text-slate-500 flex gap-3">
                <button className="text-sky-600 border-b-2 border-sky-600 pb-0.5">Open</button>
                <button className="hover:text-slate-800 transition-colors pb-0.5">Closed</button>
              </div>
            </div>
            
            <CardContent className="p-4 flex flex-col gap-3 flex-1">
              {MOCK_TICKETS.map(ticket => (
                <div key={ticket.id} className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm hover:border-slate-300 transition-colors">
                  <div className="text-sm font-bold text-slate-800 mb-2">
                    <span className="text-slate-500 font-medium">{ticket.id}</span> &nbsp;{ticket.label}
                  </div>
                  <div className="flex gap-2">
                    {ticket.steps.map((step, i) => (
                      <div 
                        key={i} 
                        className={`w-2.5 h-2.5 rounded-full ${step.status === 'done' ? 'bg-emerald-500' : 'bg-red-500'}`}
                      ></div>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Skeleton Placeholders */}
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-slate-100 rounded-lg h-[72px] w-full border border-slate-100 animate-pulse"></div>
              ))}
            </CardContent>
          </Card>

          {/* Action Centre Panel */}
          <Card className="flex-1 border-slate-200 shadow-sm flex flex-col min-h-[420px] overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 bg-slate-50/80">
              <h2 className="text-sm font-semibold text-slate-900">Action Centre</h2>
              <div className="text-xs font-semibold text-slate-400 flex items-center gap-1 cursor-pointer hover:text-slate-600 transition-colors">
                sort by <ChevronDown size={14} />
              </div>
            </div>
            
            <CardContent className="p-4 flex flex-col gap-3 flex-1">
              {MOCK_ACTIONS.map((actionItem, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-white shadow-sm hover:border-slate-300 transition-colors">
                  <div className="text-sm font-bold text-slate-800 mb-1.5">
                    <span className="text-slate-500 font-medium">{actionItem.ticketId}</span> &nbsp;{actionItem.label}
                  </div>
                  <div className="text-[11px] text-slate-500 mb-3 bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="font-semibold text-slate-600">Action:</span> {actionItem.action}
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      placeholder="Add response..."
                      className="flex-1 border border-slate-200 rounded-md px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 placeholder:text-slate-400" 
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-sky-600 hover:bg-sky-50 hover:text-sky-700 shrink-0">
                      <CheckSquare size={16} />
                    </Button>
                  </div>
                </div>
              ))}
              
              {/* Skeleton Placeholders */}
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="bg-slate-100 rounded-lg h-[112px] w-full border border-slate-100 animate-pulse"></div>
              ))}
            </CardContent>
          </Card>
          
        </div>
      </main>
    </div>
  );
}
