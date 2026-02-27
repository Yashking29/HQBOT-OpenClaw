'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOpenClaw, type ToolName, type ConnectionStatus } from '@/hooks/useOpenClaw';

// ─── Tool badge config ────────────────────────────────────────────────────────

const TOOL_STYLES: Record<
  string,
  { ring: string; bg: string; text: string; pulse: string }
> = {
  '@google-research': {
    ring: 'ring-blue-500/40',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    pulse: 'bg-blue-400',
  },
  '@anthropic': {
    ring: 'ring-violet-500/40',
    bg: 'bg-violet-500/15',
    text: 'text-violet-400',
    pulse: 'bg-violet-400',
  },
  '@perplexity': {
    ring: 'ring-cyan-500/40',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-400',
    pulse: 'bg-cyan-400',
  },
};

const FALLBACK_STYLE = {
  ring: 'ring-slate-500/40',
  bg: 'bg-slate-500/15',
  text: 'text-slate-400',
  pulse: 'bg-slate-400',
};

function getToolStyle(tool: ToolName | null) {
  if (!tool) return FALLBACK_STYLE;
  return TOOL_STYLES[tool] ?? FALLBACK_STYLE;
}

// ─── Small primitives ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: ConnectionStatus }) {
  const map: Record<ConnectionStatus, string> = {
    disconnected: 'bg-slate-600',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-emerald-500',
    running: 'bg-emerald-400 animate-pulse',
    error: 'bg-red-500',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${map[status]}`}
    />
  );
}

function ToolBadge({
  tool,
  live = false,
}: {
  tool: ToolName;
  live?: boolean;
}) {
  const s = getToolStyle(tool);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${s.ring} ${s.bg} ${s.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${s.pulse} ${live ? 'animate-pulse' : ''}`}
      />
      {tool}
    </span>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-flex items-end gap-[3px] ml-1 h-3">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-0.5 h-2.5 bg-emerald-500/70 rounded-sm animate-pulse"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function EmptyPane({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 select-none py-16">
      <span className="text-4xl opacity-30">{icon}</span>
      <p className="text-xs tracking-wide">{label}</p>
    </div>
  );
}

// ─── Markdown renderer (shared styles) ───────────────────────────────────────

function MemoContent({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none
      prose-headings:text-emerald-400 prose-headings:font-semibold prose-headings:tracking-tight
      prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
      prose-p:text-slate-300 prose-p:leading-relaxed
      prose-li:text-slate-300
      prose-strong:text-slate-100
      prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline
      prose-code:text-emerald-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
      prose-pre:bg-slate-800/60 prose-pre:border prose-pre:border-slate-700/60 prose-pre:rounded-lg
      prose-blockquote:border-l-emerald-500/50 prose-blockquote:text-slate-400
      prose-hr:border-slate-700/60
      prose-table:text-xs prose-th:text-emerald-400 prose-td:text-slate-300 prose-td:border-slate-700/60 prose-th:border-slate-700/60">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ArchitectAIPage() {
  const [inputText, setInputText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { thoughts, messages, artifacts, status, activeTools, trigger, clearSession } =
    useOpenClaw();

  const hasArtifacts =
    artifacts.investment_memo !== null || artifacts.client_memo !== null;

  const isRunning = status === 'running';
  const canTrigger = inputText.trim().length > 0 && !isRunning;

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thoughts, messages]);

  // ── File upload ─────────────────────────────────────────────────────────

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setInputText((ev.target?.result as string) ?? '');
    };
    reader.readAsText(file);
  }, []);

  const clearFile = useCallback(() => {
    setUploadedFileName(null);
    setInputText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ── Textarea auto-resize ─────────────────────────────────────────────────

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  // ── Trigger ──────────────────────────────────────────────────────────────

  const handleTrigger = useCallback(() => {
    if (!canTrigger) return;
    trigger(inputText.trim());
  }, [canTrigger, trigger, inputText]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleTrigger();
      }
    },
    [handleTrigger],
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="h-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-slate-700/70 bg-slate-900/95 backdrop-blur-md shrink-0 z-10">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="w-4 h-4 text-slate-900"
            >
              <path
                d="M2 14 L8 2 L14 14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 10 L12 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tracking-widest uppercase">
              Architect<span className="text-emerald-400">AI</span>
            </span>
            <span className="text-[10px] text-slate-500 border border-slate-700/80 rounded px-1.5 py-0.5 font-normal tracking-normal">
              Startup Architect
            </span>
          </div>
        </div>

        {/* Right: active tools + status */}
        <div className="flex items-center gap-3">
          {/* Live tool badges */}
          {activeTools.size > 0 && (
            <div className="flex items-center gap-2">
              {Array.from(activeTools).map((tool) => (
                <ToolBadge key={tool} tool={tool} live />
              ))}
            </div>
          )}

          <div className="w-px h-4 bg-slate-700/80" />

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <StatusDot status={status} />
            <span className="capitalize tabular-nums">{status}</span>
          </div>

          {(thoughts.length > 0 || messages.length > 0) && (
            <button
              onClick={clearSession}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded border border-slate-700/80 hover:border-slate-500"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: Terminal panel ──────────────────────────────────────── */}
        <div
          className={`flex flex-col min-h-0 border-r border-slate-700/60 transition-[width] duration-300 ease-in-out ${
            hasArtifacts ? 'w-[52%]' : 'w-full'
          }`}
        >
          {/* Titlebar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/40 bg-slate-800/30 shrink-0">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
            </div>
            <span className="text-[11px] text-slate-500 ml-1 tracking-wide">
              architect-ai — startup_architect
            </span>
            {isRunning && (
              <div className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-400">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                Streaming
              </div>
            )}
          </div>

          {/* Stream body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1.5 text-[12px] leading-5">
            {thoughts.length === 0 && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600 select-none py-20">
                <span className="text-5xl opacity-20">◈</span>
                <p className="text-xs tracking-widest uppercase">
                  Awaiting traction data
                </p>
                <p className="text-[11px] text-slate-700">
                  Upload a file or paste metrics below, then hit Run
                </p>
              </div>
            ) : null}

            {thoughts.map((t) => {
              const s = getToolStyle(t.tool);
              return (
                <div key={t.id} className="flex gap-3 items-start group">
                  {/* Timestamp */}
                  <span className="text-slate-700 text-[10px] mt-0.5 shrink-0 tabular-nums w-[55px]">
                    {new Date(t.timestamp).toLocaleTimeString('en-US', {
                      hour12: false,
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>

                  <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
                    {t.tool && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0 rounded shrink-0 ${s.bg} ${s.text}`}
                      >
                        <span className={`w-1 h-1 rounded-full ${s.pulse}`} />
                        {t.tool}
                      </span>
                    )}
                    <span
                      className={
                        t.tool ? 'text-slate-300' : 'text-slate-500'
                      }
                    >
                      {t.content}
                    </span>
                  </div>
                </div>
              );
            })}

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 items-start ${
                  m.type === 'error' ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                <span className="text-slate-700 text-[10px] mt-0.5 shrink-0 tabular-nums w-[55px]">
                  {new Date(m.timestamp).toLocaleTimeString('en-US', {
                    hour12: false,
                  })}
                </span>
                <span className="text-[11px] font-bold shrink-0 mt-0.5">
                  {m.type === 'error' ? '✗' : '✓'}
                </span>
                <span>{m.content}</span>
              </div>
            ))}

            {isRunning && (
              <div className="flex gap-3 items-center pl-[67px]">
                <StreamingCursor />
              </div>
            )}

            <div ref={terminalEndRef} />
          </div>

          {/* ── Input dock ─────────────────────────────────────────────── */}
          <div className="border-t border-slate-700/60 bg-slate-800/30 p-4 space-y-3 shrink-0">
            {/* File chip */}
            {uploadedFileName && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-1.5">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0">
                  <path d="M9 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6L9 1zm0 1.5L13.5 6H9V2.5z"/>
                </svg>
                <span className="truncate flex-1">{uploadedFileName}</span>
                <button
                  onClick={clearFile}
                  className="text-slate-500 hover:text-slate-300 transition-colors ml-auto"
                  aria-label="Remove file"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Text row */}
            <div className="flex gap-2">
              {/* Upload button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-slate-400 border border-slate-600/80 rounded-md hover:border-emerald-500/50 hover:text-emerald-400 transition-colors shrink-0"
                title="Upload traction data file"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M8 1L3 7h3v5h4V7h3L8 1z"/>
                  <path d="M2 13h12v1H2z"/>
                </svg>
                <span>Upload</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.md,.json,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  resizeTextarea();
                }}
                onKeyDown={handleKeyDown}
                placeholder="Paste startup traction data, metrics, or describe your business..."
                rows={1}
                className="flex-1 bg-slate-800/50 border border-slate-600/80 rounded-md px-3 py-2 text-[12px] text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 transition-colors leading-5"
                style={{ minHeight: '38px', maxHeight: '140px' }}
              />
            </div>

            {/* Trigger button */}
            <button
              onClick={handleTrigger}
              disabled={!canTrigger}
              className="
                w-full py-3 px-6 rounded-lg font-bold text-sm tracking-wide
                transition-all duration-150 active:scale-[0.985]
                flex items-center justify-center gap-2.5
                disabled:cursor-not-allowed
                bg-emerald-500 hover:bg-emerald-400 text-slate-900
                disabled:bg-slate-800 disabled:text-slate-600
                shadow-[0_0_0_0_#10b981] hover:shadow-[0_0_20px_2px_rgba(16,185,129,0.25)]
              "
            >
              {isRunning ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="3"
                      className="opacity-25"
                    />
                    <path
                      d="M4 12a8 8 0 018-8"
                      stroke="currentColor" strokeWidth="3"
                      strokeLinecap="round"
                      className="opacity-75"
                    />
                  </svg>
                  Analyzing startup data…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                    <path d="M3 2l11 6-11 6V2z"/>
                  </svg>
                  Run Startup Architect
                </>
              )}
            </button>

            <p className="text-[10px] text-slate-700 text-center tracking-wide">
              ⌘↵ to trigger · Powered by OpenClaw
            </p>
          </div>
        </div>

        {/* ── Right: Split-screen artifacts ────────────────────────────── */}
        {hasArtifacts && (
          <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-slate-900/50">
            {/* Artifacts header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/40 bg-slate-800/30 shrink-0">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
              </div>
              <span className="text-[11px] text-slate-500 ml-1 tracking-wide">
                generated artifacts — split view
              </span>
            </div>

            {/* Two-pane split */}
            <div className="flex-1 flex min-h-0 divide-x divide-slate-700/60">

              {/* ── Investment Memo ───────────────────────────────────── */}
              <div className="flex flex-col flex-1 min-h-0 min-w-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/40 bg-slate-800/20 shrink-0">
                  <span className="text-emerald-500 text-xs">◆</span>
                  <span className="text-[11px] font-semibold text-slate-300 tracking-wide uppercase">
                    Investment Memo
                  </span>
                  {artifacts.investment_memo && (
                    <span className="ml-auto w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  {artifacts.investment_memo ? (
                    <MemoContent content={artifacts.investment_memo} />
                  ) : (
                    <EmptyPane icon="◆" label="Investment memo generating…" />
                  )}
                </div>
              </div>

              {/* ── Client Memo ───────────────────────────────────────── */}
              <div className="flex flex-col flex-1 min-h-0 min-w-0">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/40 bg-slate-800/20 shrink-0">
                  <span className="text-violet-400 text-xs">◆</span>
                  <span className="text-[11px] font-semibold text-slate-300 tracking-wide uppercase">
                    Client Memo
                  </span>
                  {artifacts.client_memo && (
                    <span className="ml-auto w-1.5 h-1.5 bg-violet-400 rounded-full" />
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  {artifacts.client_memo ? (
                    <MemoContent content={artifacts.client_memo} />
                  ) : (
                    <EmptyPane icon="◆" label="Client memo generating…" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
