import { useState, useEffect } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import {
  Tag, Plus, Loader2, Trash2, Pencil, FileText
} from 'lucide-react';
import NewTopicModal from '../../components/modals/NewTopicModal';

interface Topic {
  id: string;
  project_id: string;
  name: string;
  arxiv_categories: string[] | null;
  keywords: string[] | null;
  year_from: number | null;
  year_to: number | null;
  status: string;
  added_at: string;
}

interface ProjectPaper {
  id: string;
  topic_id: string | null;
  status: string;
}

export default function TopicsPage() {
  const { project } = useOutletContext<{ project: any }>();
  const { projectId } = useParams<{ projectId: string }>();
  const { getToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [papers, setPapers] = useState<ProjectPaper[]>([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch topics
  useEffect(() => {
    const fetchTopics = async () => {
      setIsLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects/${projectId}/topics`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setTopics(data);
        }
      } catch (err) {
        console.error('Failed to fetch topics', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (projectId) fetchTopics();
  }, [projectId, getToken, apiUrl]);

  // Fetch papers to count per topic
  useEffect(() => {
    const fetchPapers = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects/${projectId}/papers`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPapers(data);
        }
      } catch (err) {
        console.error('Failed to fetch papers', err);
      }
    };
    if (projectId) fetchPapers();
  }, [projectId, getToken, apiUrl]);

  const getPaperCount = (topicId: string) => {
    return papers.filter(p => p.topic_id === topicId && p.status !== 'rejected').length;
  };

  const handleDelete = async (topicId: string) => {
    setIsDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/topics/${topicId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok || res.status === 204) {
        setTopics(prev => prev.filter(t => t.id !== topicId));
      }
    } catch (err) {
      console.error('Failed to delete topic', err);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleTopicCreated = (topic: Topic) => {
    setTopics(prev => [...prev, topic]);
  };

  const handleTopicUpdated = (updated: Topic) => {
    setTopics(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  const openCreateModal = () => {
    setEditingTopic(null);
    setShowModal(true);
  };

  const openEditModal = (topic: Topic) => {
    setEditingTopic(topic);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTopic(null);
    // Refresh papers after modal closes (new papers may have been accepted)
    const refreshPapers = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects/${projectId}/papers`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPapers(data);
        }
      } catch (err) {
        console.error('Failed to refresh papers', err);
      }
    };
    refreshPapers();
  };

  let topicsContent: React.ReactNode;
  if (isLoading) {
    topicsContent = (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  } else if (topics.length === 0) {
    topicsContent = (
      <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-[#161f33] rounded-2xl bg-surface_container/50">
        <Tag className="text-zinc-600 mb-4" size={48} />
        <h3 className="text-lg font-medium text-white mb-2">No topics yet</h3>
        <p className="text-zinc-400 text-sm max-w-sm mb-6">
          Topics help you organize your research into focused areas. Create a topic to discover relevant papers automatically.
        </p>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-primary-gradient text-white px-5 py-2.5 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all text-sm"
        >
          <Plus size={16} />
          Create Your First Topic
        </button>
      </div>
    );
  } else {
    topicsContent = (
      <div className="grid gap-4">
        {topics.map(topic => {
          const paperCount = getPaperCount(topic.id);
          return (
            <div
              key={topic.id}
              className="bg-surface_container border border-[#161f33] rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-colors"
            >
              <div className="p-5 flex items-start gap-4">
                <div className="p-2 bg-indigo-500/10 rounded-lg flex-shrink-0 mt-0.5">
                  <Tag size={18} className="text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-base font-bold text-white">{topic.name}</h3>
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <FileText size={12} />
                      {paperCount} paper{paperCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {topic.keywords && topic.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {topic.keywords.map(kw => (
                        <span key={kw} className="text-xs px-2 py-0.5 bg-secondary_container text-on_secondary_container rounded-md">{kw}</span>
                      ))}
                    </div>
                  )}
                  {topic.arxiv_categories && topic.arxiv_categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {topic.arxiv_categories.map(cat => (
                        <span key={cat} className="text-[10px] px-2 py-0.5 bg-surface_container_high text-zinc-400 rounded-md border border-[#161f33]">{cat}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                    {topic.year_from && <span>From: {topic.year_from}</span>}
                    {topic.year_to && <span>To: {topic.year_to}</span>}
                    <span>Created {new Date(topic.added_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEditModal(topic)}
                    className="p-2 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                    title="Edit topic"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(topic.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Delete topic"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
            <Tag className="text-primary" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Topics</h1>
            <p className="text-zinc-400 text-sm mt-0.5">Organize research areas for {project?.name}</p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-primary-gradient text-white px-5 py-2.5 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all text-sm"
        >
          <Plus size={16} />
          Create Topic
        </button>
      </div>

      {/* Topics List */}
      {topicsContent}      )}

      {/* Topic Modal (Create / Edit) */}
      {projectId && (
        <NewTopicModal
          isOpen={showModal}
          onClose={closeModal}
          projectId={projectId}
          onTopicCreated={handleTopicCreated}
          onTopicUpdated={handleTopicUpdated}
          editTopic={editingTopic}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface_container border border-[#161f33] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 className="text-red-500" size={24} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Delete Topic</h2>
              <p className="text-zinc-400 text-sm">
                Are you sure you want to delete this topic? Papers associated with it will remain in your Knowledge Base but lose their topic association.
              </p>
            </div>
            <div className="p-4 border-t border-[#161f33] bg-surface_container_high flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-surface_container hover:bg-surface_container_highest border border-[#161f33] text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium shadow-[0_0_16px_rgba(239,68,68,0.2)] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : null}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
