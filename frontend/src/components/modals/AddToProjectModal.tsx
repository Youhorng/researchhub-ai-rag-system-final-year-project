import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { X, Loader2, FolderOpen, Check, ChevronDown, Tag } from 'lucide-react';

interface Project {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  name: string;
}

interface ExploreHit {
  arxiv_id: string;
  title: string;
  abstract: string;
  categories: string[];
  published_at: string;
}

interface AddToProjectModalProps {
  readonly paper: ExploreHit | null;
  readonly onClose: () => void;
}

export default function AddToProjectModal({ paper, onClose }: AddToProjectModalProps) {
  const { getToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  const [projects, setProjects] = useState<Project[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');

  const [isProjectOpen, setIsProjectOpen] = useState(false);
  const [isTopicOpen, setIsTopicOpen] = useState(false);

  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Load projects on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setProjects(data);
      } catch {
        setError('Failed to load projects');
      } finally {
        setIsLoadingProjects(false);
      }
    })();
  }, [getToken]);

  // Load topics when project changes
  useEffect(() => {
    if (!selectedProjectId) { setTopics([]); setSelectedTopicId(''); return; }
    (async () => {
      setIsLoadingTopics(true);
      setSelectedTopicId('');
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects/${selectedProjectId}/topics`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setTopics(data);
      } catch {
        setTopics([]);
      } finally {
        setIsLoadingTopics(false);
      }
    })();
  }, [selectedProjectId, getToken]);

  const handleAdd = async () => {
    if (!selectedProjectId || !paper) return;
    setIsSubmitting(true);
    setError('');
    try {
      const token = await getToken();
      const body: any = {
        arxiv_id: paper.arxiv_id,
        title: paper.title,
        abstract: paper.abstract,
        categories: paper.categories,
        published_at: paper.published_at,
      };
      if (selectedTopicId) body.topic_id = selectedTopicId;

      const res = await fetch(`${apiUrl}/projects/${selectedProjectId}/papers/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Failed to add paper');
      }
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  const selectedTopic = topics.find(t => t.id === selectedTopicId);

  let submitLabel: React.ReactNode = 'Add to Project';
  if (success) submitLabel = <><Check size={16} /> Added!</>;
  else if (isSubmitting) submitLabel = <><Loader2 size={16} className="animate-spin" /> Adding…</>;

  let topicLabel: string;
  if (isLoadingTopics) topicLabel = 'Loading topics…';
  else if (topics.length === 0) topicLabel = 'No topics in this project';
  else topicLabel = selectedTopic?.name ?? 'None (add to project only)';

  if (!paper) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface_container border border-[#161f33] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#161f33]">
          <div className="flex items-center gap-2">
            <FolderOpen size={18} className="text-indigo-400" />
            <h2 className="text-white font-semibold text-base">Add to Project</h2>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-surface_container_high transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Paper preview */}
        <div className="px-6 py-4 border-b border-[#161f33] bg-surface_container_high/40">
          <p className="text-white text-sm font-medium line-clamp-2">{paper.title}</p>
          <p className="text-xs text-zinc-500 mt-1 font-mono">{paper.arxiv_id}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Project picker */}
          <div>
            <label htmlFor="project-select" className="block text-xs font-medium text-zinc-400 mb-1.5">Select Project</label>
            <div
              className="relative"
              tabIndex={-1}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsProjectOpen(false); }}
            >
              <button
                id="project-select"
                type="button"
                onClick={() => setIsProjectOpen(v => !v)}
                className="w-full min-h-[42px] bg-surface_container_high border border-[#161f33] rounded-xl pl-4 pr-9 py-2 text-sm flex items-center justify-between gap-2 transition-colors focus:outline-none focus:border-zinc-500 cursor-pointer"
                disabled={isLoadingProjects}
              >
                <span className={selectedProject ? 'text-white' : 'text-zinc-500'}>
                  {isLoadingProjects ? 'Loading…' : selectedProject?.name ?? 'Choose a project…'}
                </span>
                {isLoadingProjects ? <Loader2 size={14} className="animate-spin text-zinc-500 flex-shrink-0" /> : <ChevronDown size={14} className="text-zinc-500 flex-shrink-0" />}
              </button>
              {isProjectOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto scrollbar-hide bg-surface_container_high border border-[#161f33] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 py-1">
                  {projects.length === 0
                    ? <p className="px-4 py-3 text-sm text-zinc-500">No projects found</p>
                    : projects.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setSelectedProjectId(p.id); setIsProjectOpen(false); }}
                        className={`w-full px-4 py-2.5 text-left text-sm hover:bg-surface_container transition-colors flex items-center justify-between ${selectedProjectId === p.id ? 'bg-surface_container text-white' : 'text-zinc-100'}`}
                      >
                        {p.name}
                        {selectedProjectId === p.id && <Check size={14} className="text-indigo-400" />}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
          </div>

          {/* Topic picker — only shown when project is selected and has topics */}
          {selectedProjectId && (
            <div>
              <label htmlFor="topic-select" className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1">
                <Tag size={11} /> Add to Topic <span className="text-zinc-600">(optional)</span>
              </label>
              <div
                className="relative"
                tabIndex={-1}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsTopicOpen(false); }}
              >
                <button
                  id="topic-select"
                  type="button"
                  onClick={() => setIsTopicOpen(v => !v)}
                  disabled={isLoadingTopics || topics.length === 0}
                  className="w-full min-h-[42px] bg-surface_container_high border border-[#161f33] rounded-xl pl-4 pr-9 py-2 text-sm flex items-center justify-between gap-2 transition-colors focus:outline-none focus:border-zinc-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={selectedTopic ? 'text-white' : 'text-zinc-500'}>
                    {topicLabel}
                  </span>
                  {isLoadingTopics ? <Loader2 size={14} className="animate-spin text-zinc-500 flex-shrink-0" /> : <ChevronDown size={14} className="text-zinc-500 flex-shrink-0" />}
                </button>
                {isTopicOpen && topics.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 max-h-40 overflow-y-auto scrollbar-hide bg-surface_container_high border border-[#161f33] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 py-1">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setSelectedTopicId(''); setIsTopicOpen(false); }}
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-surface_container transition-colors ${selectedTopicId ? 'text-zinc-400' : 'bg-surface_container text-white'}`}
                    >
                      None (add to project only)
                    </button>
                    {topics.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setSelectedTopicId(t.id); setIsTopicOpen(false); }}
                        className={`w-full px-4 py-2.5 text-left text-sm hover:bg-surface_container transition-colors flex items-center justify-between ${selectedTopicId === t.id ? 'bg-surface_container text-white' : 'text-zinc-100'}`}
                      >
                        {t.name}
                        {selectedTopicId === t.id && <Check size={14} className="text-indigo-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[#161f33] text-zinc-400 hover:text-white hover:bg-surface_container_high text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selectedProjectId || isSubmitting || success}
            className="flex-1 py-2.5 rounded-xl bg-primary-gradient text-white text-sm font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.3)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.5)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
