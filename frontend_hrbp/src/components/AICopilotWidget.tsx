import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  X,
  SendHorizonal,
  Copy,
  Check,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";
import { chatWithAI, type ChatMessage } from "@/apiService/dashboardApi";

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your AI Email Copilot.\n\nI can help you draft, refine, or rewrite HR emails — PO renewals, absconding notices, resignation handling, client updates, and more.\n\nJust tell me what you need.",
};

export function AICopilotWidget() {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 80);
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const history = messages.slice(1);
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "24px";
    setLoading(true);

    try {
      const res = await chatWithAI(text, history);
      setMessages((prev) => [...prev, { role: "assistant", content: res.response }]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "AI request failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function copyMsg(content: string, idx: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  }

  function clearChat() {
    setMessages([WELCOME]);
    setInput("");
  }

  return (
    <>
      {/* Chat popup */}
      {open && (
        <div
          className="fixed bottom-20 right-5 z-50 w-[380px] max-w-[calc(100vw-24px)] flex flex-col bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200 animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{ height: "520px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center shadow-sm shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 leading-none">AI Email Copilot</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Powered by JoulestoWatts</p> 
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={clearChat}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Clear chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {/* AI avatar */}
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}

                {/* Bubble */}
                <div
                  className={`group relative max-w-[78%] rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-sm
                    ${msg.role === "user"
                      ? "bg-sky-600 text-white rounded-br-sm"
                      : "bg-white text-slate-700 rounded-bl-sm border border-slate-200"
                    }`}
                >
                  <pre className="whitespace-pre-wrap font-sans text-[13px]">{msg.content}</pre>

                  {/* Copy on AI responses (not welcome) */}
                  {msg.role === "assistant" && idx > 0 && (
                    <button
                      onClick={() => copyMsg(msg.content, idx)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-500"
                    >
                      {copiedIdx === idx
                        ? <Check className="w-3 h-3 text-emerald-500" />
                        : <Copy className="w-3 h-3" />
                      }
                    </button>
                  )}
                </div>

                {/* User avatar */}
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[9px] font-bold text-sky-700">ME</span>
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-white shrink-0">
            <div className="flex items-end gap-2 border border-slate-200 rounded-xl px-3 py-2 bg-white focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 transition-all">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
                }}
                onKeyDown={onKeyDown}
                placeholder="Draft or refine an email… (Enter to send)"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none leading-relaxed overflow-y-auto"
                style={{ height: "24px", maxHeight: "100px" }}
                disabled={loading}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors shrink-0"
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <SendHorizonal className="w-4 h-4" />
                }
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 px-0.5">
              Shift+Enter for new line · Enter to send
            </p>
          </div>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-5 right-5 z-50 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-200 border ${
          open
            ? "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"
            : "bg-sky-600 border-sky-600 hover:bg-sky-500 hover:scale-105 text-white"
        }`}
        style={{ width: "52px", height: "52px" }}
        title="AI Email Copilot"
      >
        {open
          ? <X className="w-5 h-5" />
          : <Sparkles className="w-5 h-5" />
        }
      </button>
    </>
  );
}
