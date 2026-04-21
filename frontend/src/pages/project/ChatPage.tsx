import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Sparkles, SendHorizontal, Square, Plus, Loader2, MessageSquare, BookOpen, X, ChevronRight, Trash2, AlertCircle
} from 'lucide-react';

interface ChatSession {
  id: string;
  project_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface CitedSource {
  index: number;
  paper_id: string | null;
  document_id: string | null;
  arxiv_id: string | null;
  title: string | null;
}

interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  cited_sources: CitedSource[] | null;
  created_at: string;
}

// Preprocess markdown to fix formatting issues before passing to ReactMarkdown
const preprocessMarkdown = (content: string): string => {
  let result = content;
  // Fix broken numbered lists: "1.\n**Bold:**" → "1. **Bold:**"
  result = result.replaceAll(/(\d+)\.[^\S\n]*\n+[^\S\n]*\*\*/g, '$1. **');
  // Convert \[...\] block math → $$...$$
  result = result.replaceAll(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `$$${inner}$$`);
  // Convert \(...\) inline math → $...$
  result = result.replaceAll(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner}$`);
  // Convert ( \latex_content ) bare-parenthesis notation → $...$
  // Only when content contains a LaTeX marker (\cmd, _, ^) to avoid false positives on normal English
  result = result.replaceAll(
    /\(\s*((?:[^()]*(?:\\[a-zA-Z]+|[_^])[^()]*)+)\s*\)/g,
    (_m, inner) => `$${inner.trim()}$`,
  );
  // Convert citation markers [N] into links so they render as styled badges
  result = result.replaceAll(/\[(\d+)\]/g, '[$1](#cite-$1)');
  return result;
};

// Render markdown content
const renderMarkdown = (content: string, citations?: CitedSource[] | null) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      p: ({ children }) => (
        <p className="mb-4 last:mb-0 leading-7 text-zinc-200">{children}</p>
      ),
      strong: ({ children }) => (
        <strong className="font-semibold text-white">{children}</strong>
      ),
      em: ({ children }) => (
        <em className="italic text-zinc-300">{children}</em>
      ),
      ul: ({ children }) => (
        <ul className="mb-4 pl-6 space-y-1.5 list-disc list-outside">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="mb-4 pl-6 space-y-1.5 list-decimal list-outside">{children}</ol>
      ),
      li: ({ children }) => (
        <li className="leading-7 text-zinc-200">{children}</li>
      ),
      h1: ({ children }) => (
        <h2 className="mt-6 mb-2 text-base font-semibold text-white leading-7 first:mt-0">{children}</h2>
      ),
      h2: ({ children }) => (
        <h2 className="mt-6 mb-2 text-base font-semibold text-white leading-7 first:mt-0">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-4 mb-1.5 text-[15px] font-semibold text-white leading-7 first:mt-0">{children}</h3>
      ),
      code: ({ children, className }) => {
        const isBlock = className?.includes('language-');
        return isBlock ? (
          <pre className="my-4 rounded-xl border border-[#212c43] bg-[#0d1117] overflow-x-auto">
            <code className="block p-4 text-sm text-zinc-300 font-mono leading-6">{children}</code>
          </pre>
        ) : (
          <code className="bg-surface_container_lowest px-1.5 py-0.5 rounded text-[13px] text-indigo-300 border border-[#212c43] font-mono">{children}</code>
        );
      },
      blockquote: ({ children }) => (
        <blockquote className="my-4 border-l-2 border-zinc-600 pl-4 text-zinc-400 italic">{children}</blockquote>
      ),
      a: ({ href, children }) => {
        if (href?.startsWith('#cite-')) {
          const citeNum = parseInt(href.replace('#cite-', ''), 10);
          const source = citations?.find(s => s.index === citeNum);
          const tooltip = source?.title || `Source ${citeNum}`;
          return (
            <span className="relative group/cite inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mx-0.5 text-[11px] font-semibold text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 rounded cursor-default align-top leading-none transition-colors">
              {children}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-zinc-800 border border-[#212c43] rounded-lg shadow-xl whitespace-normal max-w-[280px] w-max opacity-0 invisible group-hover/cite:opacity-100 group-hover/cite:visible transition-all duration-150 pointer-events-none z-50 leading-snug text-center font-normal">
                {tooltip}
              </span>
            </span>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{children}</a>
        );
      },
      hr: () => <hr className="my-6 border-[#212c43]" />,
      table: ({ children }) => (
        <div className="my-4 overflow-x-auto rounded-lg border border-[#212c43]">
          <table className="w-full text-sm border-collapse">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="px-3 py-2 text-left font-semibold text-white border-b border-[#212c43] bg-surface_container_high">{children}</th>
      ),
      td: ({ children }) => (
        <td className="px-3 py-2 text-zinc-300 border-b border-[#212c43] last:border-b-0">{children}</td>
      ),
    }}
  >
    {preprocessMarkdown(content)}
  </ReactMarkdown>
);

function processSSELine(
  line: string,
  onChunk: (content: string) => void,
  onCitations: (sources: CitedSource[]) => void,
  onReplace: (content: string) => void,
): void {
  if (!line.startsWith('data: ')) return;
  const jsonStr = line.slice(6).trim();
  if (!jsonStr) return;
  try {
    const event = JSON.parse(jsonStr) as { type: string; content?: string; sources?: CitedSource[]; message?: string };
    if (event.type === 'chunk') onChunk(event.content ?? '');
    else if (event.type === 'replace') onReplace(event.content ?? '');
    else if (event.type === 'citations') onCitations(event.sources ?? []);
    else if (event.type === 'error') { console.error('SSE error:', event.message); onChunk(`\n\n*Error: ${event.message}*`); }
  } catch { /* ignore parse errors */ }
}

export default function ChatPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { getToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  useEffect(() => { document.title = 'Chat | ResearchHub'; }, []);

  // Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  // Messages state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Input state
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingForSessionId, setStreamingForSessionId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<CitedSource[]>([]);

  // True only when the *active* session is the one currently being streamed
  const isStreamingThisSession = isStreaming && streamingForSessionId === activeSessionId;

  // Session delete state
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Error state
  const [chatError, setChatError] = useState<string | null>(null);

  // UI state
  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 768);
  const [showCitations, setShowCitations] = useState(false);
  const [selectedMessageCitations, setSelectedMessageCitations] = useState<CitedSource[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [inputValue]);

  // Fetch sessions
  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoadingSessions(true);
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
        }
      } catch (err) {
        console.error('Failed to fetch sessions', err);
      } finally {
        setIsLoadingSessions(false);
      }
    };
    if (projectId) fetchSessions();
  }, [projectId, getToken, apiUrl]);

  // Track sessions created inline (first message) to skip re-fetching over optimistic messages
  const inlineCreatedSessionRef = useRef<string | null>(null);


  // Fetch messages when session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    // Skip fetch for sessions just created inline — we already have the optimistic message
    if (inlineCreatedSessionRef.current === activeSessionId) {
      inlineCreatedSessionRef.current = null;
      return;
    }
    const fetchMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions/${activeSessionId}/messages?limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to fetch messages', err);
      } finally {
        setIsLoadingMessages(false);
      }
    };
    fetchMessages();
  }, [activeSessionId, projectId, getToken, apiUrl]);

  // Create new session
  const handleNewSession = async () => {
    setChatError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: null })
      });
      if (res.status === 429) {
        const data = await res.json();
        setChatError(data.detail ?? 'Daily session limit reached (5 per day)');
        return;
      }
      if (res.ok) {
        const session = await res.json();
        setSessions(prev => [session, ...prev]);
        setActiveSessionId(session.id);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to create session', err);
    }
  };

  // Create a session inline (used when sending first message without an active session)
  const createNewSession = async (): Promise<string | null> => {
    setChatError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: null })
      });
      if (res.status === 429) {
        const data = await res.json();
        setChatError(data.detail ?? 'Daily session limit reached (5 per day)');
        return null;
      }
      if (res.ok) {
        const session = await res.json();
        setSessions(prev => [session, ...prev]);
        inlineCreatedSessionRef.current = session.id;
        setActiveSessionId(session.id);
        return session.id;
      }
      return null;
    } catch (err) {
      console.error('Failed to create session', err);
      return null;
    }
  };

  // Parse SSE stream into full content and citations
  const processStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<{ fullContent: string; citations: CitedSource[] }> => {
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let citations: CitedSource[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        processSSELine(
          line,
          (content) => { fullContent += content; setStreamingContent(fullContent); },
          (sources) => { citations = sources; setStreamingCitations(sources); },
          (replacement) => { fullContent = replacement; setStreamingContent(replacement); },
        );
      }
    }

    return { fullContent, citations };
  };

  // Send message with SSE streaming
  const handleSendMessage = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = await createNewSession();
      if (!sessionId) return;
    }

    const userMessage = inputValue.trim();
    setInputValue('');
    setChatError(null);
    setIsStreaming(true);
    setStreamingForSessionId(sessionId);
    setStreamingContent('');
    setStreamingCitations([]);

    // Add optimistic user message
    const optimisticUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content: userMessage,
      cited_sources: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticUserMsg]);

    try {
      const token = await getToken();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content: userMessage }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const data = await res.json();
        setChatError(data.detail ?? 'Message limit reached (20 per session)');
        setMessages(prev => prev.filter(m => m.id !== optimisticUserMsg.id));
        setIsStreaming(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const { fullContent, citations } = await processStream(reader);

      // Finalize: add assistant message to list
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        session_id: sessionId,
        role: 'assistant',
        content: fullContent,
        cited_sources: citations.length > 0 ? citations : null,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setStreamingContent('');
      setStreamingCitations([]);

      // Update session title in sidebar if this was the first message
      const sessionToUpdate = sessions.find(s => s.id === sessionId);
      if (sessionToUpdate && !sessionToUpdate.title) {
        setSessions(prev => prev.map(s =>
          s.id === sessionId ? { ...s, title: userMessage.slice(0, 80) } : s
        ));
      }
    } catch (err: unknown) {
      // Ignore user-initiated aborts
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Failed to send message', err);
      setStreamingContent('');
    } finally {
      setIsStreaming(false);
      setStreamingForSessionId(null);
      inputRef.current?.focus();
    }
  };

  // Stop streaming and commit partial response
  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    if (streamingContent) {
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        session_id: activeSessionId || '',
        role: 'assistant',
        content: streamingContent,
        cited_sources: streamingCitations.length > 0 ? streamingCitations : null,
        created_at: new Date().toISOString(),
      }]);
    }
    setStreamingContent('');
    setStreamingCitations([]);
  };

  // Handle textarea key events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Deduplicate citations by paper/document identity, preserving backend indices
  const deduplicateCitations = (citations: CitedSource[]): CitedSource[] => {
    const seen = new Map<string, CitedSource>();
    for (const source of citations) {
      const key = source.paper_id || source.document_id || source.arxiv_id || source.title || '';
      if (key && seen.has(key)) continue;
      seen.set(key || `_${seen.size}`, source);
    }
    return Array.from(seen.values());
  };

  // Show citations for a message
  const handleShowCitations = (citations: CitedSource[]) => {
    setSelectedMessageCitations(deduplicateCitations(citations));
    setShowCitations(true);
  };

  // Delete a session
  const handleDeleteSession = async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok || res.status === 204) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          setActiveSessionId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('Failed to delete session', err);
    } finally {
      setDeletingSessionId(null);
      setSessionToDelete(null);
    }
  };

  // Sessions sidebar content
  let sessionsListContent: React.ReactNode;
  if (isLoadingSessions) {
    sessionsListContent = (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-zinc-500" />
      </div>
    );
  } else if (sessions.length === 0) {
    sessionsListContent = (
      <div className="text-center py-8 px-4">
        <MessageSquare className="text-zinc-600 mx-auto mb-2" size={24} />
        <p className="text-xs text-zinc-500">No conversations yet</p>
      </div>
    );
  } else {
    sessionsListContent = sessions.map(session => (
      <button
        type="button"
        key={session.id}
        onClick={() => { setActiveSessionId(session.id); if (window.innerWidth < 768) setShowSidebar(false); }}
        className={`group/session w-full text-left p-3 rounded-xl text-sm transition-all cursor-pointer ${
          activeSessionId === session.id
            ? 'bg-surface_container_high text-white font-medium'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface_container'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <MessageSquare size={14} className="flex-shrink-0" />
            <span className="truncate">{session.title || 'New Conversation'}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setSessionToDelete(session.id); }}
            className="opacity-0 group-hover/session:opacity-100 p-1 text-zinc-500 hover:text-red-400 rounded transition-all flex-shrink-0"
            aria-label="Delete conversation"
          >
            <Trash2 size={12} />
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 mt-1 pl-5">
          {new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </p>
      </button>
    ));
  }

  return (
    <div className="relative flex h-[calc(100dvh-7.5rem)] gap-0 animate-in fade-in duration-300">
      {/* Sessions Sidebar */}
      {showSidebar && (
        <>
          {/* Mobile backdrop */}
          <div
            className="md:hidden fixed inset-0 z-20 bg-black/50"
            onClick={() => setShowSidebar(false)}
          />
          <div className="absolute md:relative z-30 md:z-auto h-full w-64 flex-shrink-0 bg-surface_container_low border-r border-[#161f33] flex flex-col md:rounded-l-2xl overflow-hidden">
            <div className="h-16 px-3 border-b border-[#161f33] flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleNewSession}
                className="flex-1 flex items-center justify-center gap-2 bg-primary-gradient text-white py-1.5 px-4 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all text-sm"
              >
                <Plus size={16} strokeWidth={2.5} />
                New Chat
              </button>
              <button
                onClick={() => setShowSidebar(false)}
                aria-label="Close sidebar"
                className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-surface_container_high transition-colors flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1">
              {sessionsListContent}
            </div>
          </div>
        </>
      )}

      {/* Chat Main Area */}
      <div className={`flex-1 flex flex-col bg-surface_container overflow-hidden min-w-0 ${showSidebar ? 'rounded-r-2xl md:rounded-l-none' : 'rounded-2xl'}`}>
        {/* Chat header */}
        <div className="h-16 border-b border-[#161f33] flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label="Toggle conversation sidebar"
              className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-surface_container_high transition-colors"
            >
              <MessageSquare size={16} />
            </button>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-400" />
              <span className="text-sm font-medium text-white">AI Research Assistant</span>
            </div>
          </div>
          {showCitations && (
            <button
              onClick={() => setShowCitations(false)}
              className="text-zinc-400 hover:text-white text-xs px-3 py-1 rounded-lg hover:bg-surface_container_high transition-colors flex items-center gap-1"
            >
              <X size={14} />
              Close Sources
            </button>
          )}
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Messages area */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {messages.length === 0 && !isStreamingThisSession && !isLoadingMessages ? (
                /* Welcome state */
                <div className="flex flex-col items-center justify-center min-h-full py-12 px-4 text-center animate-in fade-in duration-500">
                  <div className="p-4 bg-primary/10 rounded-2xl mb-5 border border-primary/20 shadow-[0_0_32px_-8px_rgba(167,165,255,0.2)]">
                    <Sparkles size={28} className="text-primary" />
                  </div>
                  <h2 className="text-lg font-semibold text-white mb-2">Research Assistant</h2>
                  <p className="text-zinc-400 text-sm max-w-sm mb-8 leading-relaxed">
                    Ask questions about your indexed papers and documents. I'll find and cite relevant sources.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                    {[
                      'List all the papers in my knowledge base',
                      'What are the main results and conclusions from each paper?',
                      'What methods and techniques are proposed in the papers?',
                      'What future work is suggested in the papers?',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => { setInputValue(suggestion); inputRef.current?.focus(); }}
                        className="text-left px-4 py-3 bg-surface_container_high hover:bg-surface_bright border border-[#161f33] hover:border-primary/20 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 transition-all leading-relaxed"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                  {isLoadingMessages ? (
                    <div className="flex justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-zinc-500" />
                    </div>
                  ) : (
                    messages.map(msg => (
                      msg.role === 'user' ? (
                        <div key={msg.id} className="message-animate flex justify-end">
                          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-sm bg-primary-gradient text-white text-base leading-relaxed">
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          </div>
                        </div>
                      ) : (
                        <div key={msg.id} className="message-animate flex gap-3">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Sparkles size={13} className="text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-base leading-relaxed text-zinc-200">
                              {renderMarkdown(msg.content, msg.cited_sources)}
                            </div>
                            {msg.cited_sources && msg.cited_sources.length > 0 && (() => {
                              const unique = deduplicateCitations(msg.cited_sources);
                              return (
                                <button
                                  onClick={() => handleShowCitations(msg.cited_sources!)}
                                  className="flex items-center gap-2 mt-3 px-3 py-2 text-sm text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 rounded-xl transition-colors"
                                >
                                  <BookOpen size={14} />
                                  <span className="font-medium">{unique.length === 1 ? '1 source cited' : `${unique.length} sources cited`}</span>
                                  <ChevronRight size={14} />
                                </button>
                              );
                            })()}
                          </div>
                        </div>
                      )
                    ))
                  )}

                  {/* Streaming message */}
                  {isStreamingThisSession && streamingContent && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles size={13} className="text-primary animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-base leading-relaxed text-zinc-200 streaming-cursor">
                          {renderMarkdown(streamingContent, streamingCitations)}
                        </div>
                        {streamingCitations.length > 0 && (() => {
                          const unique = deduplicateCitations(streamingCitations);
                          return (
                            <button
                              onClick={() => handleShowCitations(streamingCitations)}
                              className="flex items-center gap-2 mt-3 px-3 py-2 text-sm text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 rounded-xl transition-colors"
                            >
                              <BookOpen size={14} />
                              <span className="font-medium">{unique.length === 1 ? '1 source cited' : `${unique.length} sources cited`}</span>
                              <ChevronRight size={14} />
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Thinking indicator — before first chunk arrives */}
                  {isStreamingThisSession && !streamingContent && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <Sparkles size={13} className="text-primary animate-pulse" />
                      </div>
                      <div className="flex items-center gap-1.5 pt-1.5">
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                        <span className="thinking-dot" />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
              {/* Scroll anchor for welcome state */}
              {messages.length === 0 && <div ref={messagesEndRef} />}
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 px-4 pb-4 pt-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              {chatError && (
                <div className="max-w-3xl mx-auto flex items-center gap-2 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  {chatError}
                </div>
              )}
              <div className="max-w-3xl mx-auto">
                <form onSubmit={handleSendMessage}>
                  <div className="flex items-center gap-2 bg-surface_container_high border border-[#161f33] rounded-2xl px-4 py-3 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-lg">
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask about your research..."
                      rows={1}
                      className="flex-1 bg-transparent text-white placeholder-zinc-500 focus:outline-none text-sm leading-5 resize-none overflow-y-auto self-center"
                      style={{ minHeight: '20px', maxHeight: '160px' }}
                    />
                    {isStreamingThisSession ? (
                      <button
                        type="button"
                        onClick={handleStopStreaming}
                        className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-surface_container border border-zinc-600 text-zinc-300 hover:text-white hover:border-zinc-400 rounded-lg transition-all"
                        aria-label="Stop generating"
                      >
                        <Square size={14} />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={!inputValue.trim()}
                        aria-label="Send message"
                        className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-primary-gradient text-white rounded-lg shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all disabled:opacity-40"
                      >
                        <SendHorizontal size={15} />
                      </button>
                    )}
                  </div>
                </form>
                <p className="text-[10px] text-zinc-500 mt-2 text-center">
                  AI answers are based on your indexed papers · Shift+Enter for new line
                </p>
              </div>
            </div>
          </div>

          {/* Delete Session Confirmation Modal */}
          {sessionToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-surface_container border border-[#161f33] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                <div className="p-6">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <Trash2 className="text-red-500" size={24} />
                  </div>
                  <h2 className="text-lg font-bold text-white mb-2">Delete Conversation</h2>
                  <p className="text-zinc-400 text-sm">
                    Are you sure? This will permanently delete this conversation and all its messages.
                  </p>
                </div>
                <div className="p-4 border-t border-[#161f33] bg-surface_container_high flex justify-end gap-3">
                  <button
                    onClick={() => setSessionToDelete(null)}
                    disabled={deletingSessionId === sessionToDelete}
                    className="px-4 py-2 bg-surface_container hover:bg-surface_container_highest border border-[#161f33] text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleDeleteSession(sessionToDelete)}
                    disabled={deletingSessionId === sessionToDelete}
                    className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium shadow-[0_0_16px_rgba(239,68,68,0.2)] transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {deletingSessionId === sessionToDelete ? <Loader2 size={16} className="animate-spin" /> : null}
                    {deletingSessionId === sessionToDelete ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Citations Panel */}
          {showCitations && selectedMessageCitations.length > 0 && (
            <div className="absolute md:relative right-0 top-0 bottom-0 z-30 md:z-auto w-72 border-l border-[#161f33] bg-surface_container_low flex-shrink-0 overflow-y-auto scrollbar-hide">
              <div className="p-4 border-b border-[#161f33]">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <BookOpen size={14} className="text-indigo-400" />
                  Sources
                </h3>
              </div>
              <div className="p-3 space-y-2">
                {selectedMessageCitations.map((source) => (
                  <div
                    key={source.index}
                    className="p-3 bg-surface_container_high rounded-xl border border-[#161f33]"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                        [{source.index}]
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white leading-snug">{source.title || 'Untitled'}</p>
                        {source.arxiv_id && (
                          <p className="text-[10px] text-zinc-500 mt-1">arXiv: {source.arxiv_id}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
