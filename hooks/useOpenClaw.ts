'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolName = '@google-research' | '@anthropic' | '@perplexity' | string;

export interface ThoughtEntry {
  id: string;
  content: string;
  tool: ToolName | null;
  timestamp: number;
}

export interface ChatEntry {
  id: string;
  type: 'message' | 'error';
  content: string;
  timestamp: number;
}

export interface Artifacts {
  investment_memo: string | null;
  client_memo: string | null;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'running'
  | 'error';

export interface UseOpenClawReturn {
  /** Streaming thought/reasoning lines from the AI */
  thoughts: ThoughtEntry[];
  /** Final assistant messages and errors */
  messages: ChatEntry[];
  /** Generated artifact documents */
  artifacts: Artifacts;
  /** WebSocket + session lifecycle status */
  status: ConnectionStatus;
  /** Tools currently active (used for live badges in the UI) */
  activeTools: Set<ToolName>;
  /** Fire the Startup Architect skill with the supplied traction data */
  trigger: (input: string) => void;
  /** Reset all session state and close the socket */
  clearSession: () => void;
}

// ─── Server message shapes ────────────────────────────────────────────────────

interface ServerThought {
  type: 'thought';
  content: string;
  tool?: ToolName;
}
interface ServerToolUse {
  type: 'tool_use';
  tool: ToolName;
  input?: string;
}
interface ServerToolResult {
  type: 'tool_result';
  tool: ToolName;
}
interface ServerMessage {
  type: 'message' | 'text';
  content: string;
}
interface ServerArtifact {
  type: 'artifact';
  artifactType: 'investment_memo' | 'client_memo';
  content: string;
}
interface ServerArtifactChunk {
  type: 'artifact_chunk';
  artifactType: 'investment_memo' | 'client_memo';
  content: string;
}
interface ServerStatus {
  type: 'status';
  status: 'running' | 'complete' | 'error';
  message?: string;
}
interface ServerError {
  type: 'error';
  message: string;
}

type ServerEvent =
  | ServerThought
  | ServerToolUse
  | ServerToolResult
  | ServerMessage
  | ServerArtifact
  | ServerArtifactChunk
  | ServerStatus
  | ServerError;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOpenClaw(): UseOpenClawReturn {
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [artifacts, setArtifacts] = useState<Artifacts>({
    investment_memo: null,
    client_memo: null,
  });
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [activeTools, setActiveTools] = useState<Set<ToolName>>(new Set());

  const wsRef = useRef<WebSocket | null>(null);
  // Stable ref so handleMessage closure never goes stale
  const statusRef = useRef<ConnectionStatus>('disconnected');

  // Keep ref in sync
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const pushThought = useCallback((content: string, tool: ToolName | null) => {
    setThoughts((prev) => [
      ...prev,
      { id: crypto.randomUUID(), content, tool, timestamp: Date.now() },
    ]);
  }, []);

  const pushMessage = useCallback(
    (content: string, type: 'message' | 'error' = 'message') => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), type, content, timestamp: Date.now() },
      ]);
    },
    [],
  );

  const activateTool = useCallback((tool: ToolName) => {
    setActiveTools((prev) => new Set(prev).add(tool));
  }, []);

  const deactivateTool = useCallback((tool: ToolName) => {
    setActiveTools((prev) => {
      const next = new Set(prev);
      next.delete(tool);
      return next;
    });
  }, []);

  // ── Message handler ───────────────────────────────────────────────────────

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let data: ServerEvent;
      try {
        data = JSON.parse(event.data as string) as ServerEvent;
      } catch {
        // Raw text stream – treat as an un-tagged thought
        pushThought(event.data as string, null);
        return;
      }

      switch (data.type) {
        case 'thought': {
          const tool = data.tool ?? null;
          pushThought(data.content, tool);
          if (tool) activateTool(tool);
          break;
        }

        case 'tool_use': {
          const label = data.input
            ? `${data.tool}: ${data.input}`
            : `Using ${data.tool}`;
          pushThought(label, data.tool);
          activateTool(data.tool);
          break;
        }

        case 'tool_result': {
          deactivateTool(data.tool);
          break;
        }

        case 'message':
        case 'text': {
          pushMessage(data.content);
          break;
        }

        case 'artifact': {
          setArtifacts((prev) => ({
            ...prev,
            [data.artifactType]: data.content,
          }));
          break;
        }

        case 'artifact_chunk': {
          // Accumulate streaming artifact content
          setArtifacts((prev) => ({
            ...prev,
            [data.artifactType]: (prev[data.artifactType] ?? '') + data.content,
          }));
          break;
        }

        case 'status': {
          if (data.status === 'complete') {
            setStatus('connected');
            setActiveTools(new Set());
          } else if (data.status === 'error') {
            setStatus('error');
            pushMessage(data.message ?? 'An error occurred.', 'error');
          } else if (data.status === 'running') {
            setStatus('running');
          }
          break;
        }

        case 'error': {
          setStatus('error');
          pushMessage(data.message, 'error');
          break;
        }
      }
    },
    [pushThought, pushMessage, activateTool, deactivateTool],
  );

  // ── WebSocket lifecycle ───────────────────────────────────────────────────

  const openSocket = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const rawUrl = process.env.NEXT_PUBLIC_RAILWAY_URL;
      if (!rawUrl) {
        reject(new Error('NEXT_PUBLIC_RAILWAY_URL is not configured.'));
        return;
      }

      // Upgrade http(s):// → ws(s)://
      const wsBase = rawUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');

      // Append gateway token if configured
      const token = process.env.NEXT_PUBLIC_GATEWAY_TOKEN;
      const wsUrl = token
        ? `${wsBase}${wsBase.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
        : wsBase;

      setStatus('connecting');

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setStatus('connected');
        resolve(ws);
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
        setStatus('error');
        reject(new Error('WebSocket connection failed. Check NEXT_PUBLIC_RAILWAY_URL.'));
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Only downgrade to disconnected if we weren't already in error
        if (statusRef.current !== 'error') {
          setStatus('disconnected');
        }
      };

      wsRef.current = ws;
    });
  }, [handleMessage]);

  // ── Public API ────────────────────────────────────────────────────────────

  const trigger = useCallback(
    async (input: string) => {
      // Reset session state
      setThoughts([]);
      setMessages([]);
      setArtifacts({ investment_memo: null, client_memo: null });
      setActiveTools(new Set());

      // Reuse open socket or open a fresh one
      let ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        try {
          ws = await openSocket();
        } catch (err) {
          pushMessage(
            err instanceof Error ? err.message : 'Connection failed.',
            'error',
          );
          setStatus('error');
          return;
        }
      }

      setStatus('running');

      ws.send(
        JSON.stringify({
          type: 'run_skill',
          skill: 'startup_architect',
          input: `Run the Startup Architect skill for ${input}`,
        }),
      );
    },
    [openSocket, pushMessage],
  );

  const clearSession = useCallback(() => {
    setThoughts([]);
    setMessages([]);
    setArtifacts({ investment_memo: null, client_memo: null });
    setActiveTools(new Set());
    setStatus('disconnected');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return {
    thoughts,
    messages,
    artifacts,
    status,
    activeTools,
    trigger,
    clearSession,
  };
}
