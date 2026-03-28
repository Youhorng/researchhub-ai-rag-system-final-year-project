import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import {
  Sparkles, Send, Plus, Loader2, MessageSquare, BookOpen, X, ChevronRight
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

export default function ChatPage() {
  const { project } = useOutletContext<{ project: any }>();
  const { projectId } = useParams<{ projectId: string }>();
  const { getToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

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
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<CitedSource[]>([]);

  // UI state
  const [showSidebar, setShowSidebar] = useState(true);
  const [showCitations, setShowCitations] = useState(false);
  const [selectedMessageCitations, setSelectedMessageCitations] = useState<CitedSource[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

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

  // Fetch messages when session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
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
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title: null })
      });
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

  // Send message with SSE streaming
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isStreaming) return;

    // Create session if none active
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title: null })
        });
        if (res.ok) {
          const session = await res.json();
          setSessions(prev => [session, ...prev]);
          sessionId = session.id;
          setActiveSessionId(session.id);
        }
      } catch (err) {
        console.error('Failed to create session', err);
        return;
      }
    }

    const userMessage = inputValue.trim();
    setInputValue('');
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingCitations([]);

    // Add optimistic user message
    const optimisticUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId!,
      role: 'user',
      content: userMessage,
      cited_sources: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticUserMsg]);

    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ content: userMessage })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Parse SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

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
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'chunk') {
              fullContent += event.content;
              setStreamingContent(fullContent);
            } else if (event.type === 'citations') {
              citations = event.sources || [];
              setStreamingCitations(citations);
            } else if (event.type === 'error') {
              console.error('SSE error:', event.message);
              fullContent += `\n\n*Error: ${event.message}*`;
              setStreamingContent(fullContent);
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      // Finalize: add assistant message to list
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        session_id: sessionId!,
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
    } catch (err) {
      console.error('Failed to send message', err);
      setStreamingContent('');
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  };

  // Handle textarea key events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // Show citations for a message
  const handleShowCitations = (citations: CitedSource[]) => {
    setSelectedMessageCitations(citations);
    setShowCitations(true);
  };

  // Format message content with citation markers
  const formatContent = (content: string) => {
    // Replace [N] with styled citation markers
    return content.replace(/\[(\d+)\]/g, (_, num) => `[${num}]`);
  };

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-0 animate-in fade-in duration-300">
      {/* Sessions Sidebar */}
      {showSidebar && (
        <div className="w-64 flex-shrink-0 bg-surface_container_low border-r border-[#161f33] flex flex-col rounded-l-2xl overflow-hidden">
          <div className="p-3 border-b border-[#161f33]">
            <button
              onClick={handleNewSession}
              className="w-full flex items-center justify-center gap-2 bg-primary-gradient text-white py-2.5 px-4 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all text-sm"
            >
              <Plus size={16} strokeWidth={2.5} />
              New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1">
            {isLoadingSessions ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-zinc-500" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="text-zinc-600 mx-auto mb-2" size={24} />
                <p className="text-xs text-zinc-500">No conversations yet</p>
              </div>
            ) : (
              sessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`w-full text-left p-3 rounded-xl text-sm transition-all truncate ${
                    activeSessionId === session.id
                      ? 'bg-surface_container_high text-white font-medium'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface_container'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={14} className="flex-shrink-0" />
                    <span className="truncate">{session.title || 'New Conversation'}</span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1 pl-5">
                    {new Date(session.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Chat Main Area */}
      <div className="flex-1 flex flex-col bg-surface_container rounded-r-2xl overflow-hidden min-w-0">
        {/* Chat header */}
        <div className="h-12 border-b border-[#161f33] flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
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
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {!activeSessionId && messages.length === 0 && !isStreaming ? (
                /* Welcome state */
                <div className="flex-1 flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="p-4 bg-primary/10 rounded-2xl mb-6 border border-primary/20">
                    <Sparkles size={32} className="text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">Research Assistant</h2>
                  <p className="text-zinc-400 text-sm max-w-md mb-8">
                    Ask questions about the papers and documents in your knowledge base.
                    I'll search through your indexed content and provide sourced answers.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                    {[
                      'What are the key findings across my papers?',
                      'Summarize the main methodologies used',
                      'What research gaps exist in this topic?',
                      'Compare the approaches in my papers',
                    ].map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setInputValue(suggestion);
                          inputRef.current?.focus();
                        }}
                        className="text-left p-3 bg-surface_container_high hover:bg-surface_bright border border-[#161f33] rounded-xl text-xs text-zinc-300 hover:text-white transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {isLoadingMessages ? (
                    <div className="flex justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-zinc-500" />
                    </div>
                  ) : (
                    messages.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                            <Sparkles size={14} className="text-primary" />
                          </div>
                        )}
                        <div className={`max-w-[75%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                          <div
                            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-primary-gradient text-white rounded-br-md'
                                : 'bg-surface_container_high text-zinc-200 rounded-bl-md'
                            }`}
                          >
                            <div className="whitespace-pre-wrap">{formatContent(msg.content)}</div>
                          </div>
                          {msg.role === 'assistant' && msg.cited_sources && msg.cited_sources.length > 0 && (
                            <button
                              onClick={() => handleShowCitations(msg.cited_sources!)}
                              className="flex items-center gap-1.5 mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              <BookOpen size={12} />
                              {msg.cited_sources.length} source{msg.cited_sources.length !== 1 ? 's' : ''}
                              <ChevronRight size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {/* Streaming message */}
                  {isStreaming && streamingContent && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <Sparkles size={14} className="text-primary animate-pulse" />
                      </div>
                      <div className="max-w-[75%]">
                        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-surface_container_high text-zinc-200 text-sm leading-relaxed">
                          <div className="whitespace-pre-wrap">{formatContent(streamingContent)}</div>
                        </div>
                        {streamingCitations.length > 0 && (
                          <button
                            onClick={() => handleShowCitations(streamingCitations)}
                            className="flex items-center gap-1.5 mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            <BookOpen size={12} />
                            {streamingCitations.length} source{streamingCitations.length !== 1 ? 's' : ''}
                            <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Streaming indicator without content yet */}
                  {isStreaming && !streamingContent && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <Sparkles size={14} className="text-primary animate-pulse" />
                      </div>
                      <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-surface_container_high">
                        <div className="flex items-center gap-2 text-zinc-400 text-sm">
                          <Loader2 size={14} className="animate-spin" />
                          Thinking...
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-[#161f33] flex-shrink-0">
              <form onSubmit={handleSendMessage} className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your research..."
                    rows={1}
                    className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-3 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm transition-colors resize-none max-h-32 overflow-y-auto"
                    style={{ minHeight: '44px' }}
                    disabled={isStreaming}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isStreaming || !inputValue.trim()}
                  className="p-3 bg-primary-gradient text-white rounded-xl shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all disabled:opacity-50 flex-shrink-0"
                >
                  {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </form>
              <p className="text-[10px] text-zinc-600 mt-2 text-center">
                AI answers are based on your indexed papers and documents. Always verify important claims.
              </p>
            </div>
          </div>

          {/* Citations Panel */}
          {showCitations && selectedMessageCitations.length > 0 && (
            <div className="w-72 border-l border-[#161f33] bg-surface_container_low flex-shrink-0 overflow-y-auto scrollbar-hide">
              <div className="p-4 border-b border-[#161f33]">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <BookOpen size={14} className="text-indigo-400" />
                  Sources
                </h3>
              </div>
              <div className="p-3 space-y-2">
                {selectedMessageCitations.map((source, idx) => (
                  <div
                    key={idx}
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
