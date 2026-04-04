import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import {
  BookOpen, FileText, Database, Search, Trash2, Loader2,
  CheckCircle2, XCircle, Upload, Sparkles, ChevronDown, ChevronUp, ExternalLink, Tag
} from 'lucide-react';

interface Paper {
  id: string;
  arxiv_id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  categories: string[];
  published_at: string | null;
  pdf_url: string | null;
}

interface Topic {
  id: string;
  name: string;
}

interface ProjectPaper {
  id: string;
  project_id: string;
  paper: Paper;
  status: string;
  relevance_score: number | null;
  added_by: string | null;
  added_at: string;
  status_updated_at: string | null;
  topic_id: string | null;
}

interface Document {
  id: string;
  project_id: string;
  title: string;
  original_filename: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  chunks_indexed: boolean;
  uploaded_at: string;
}

interface ChunkHit {
  paper_id: string;
  arxiv_id: string;
  title: string;
  chunk_text: string;
  relevance_score: number;
}

type Tab = 'papers' | 'documents' | 'search';

async function uploadSingleFile(
  apiUrl: string,
  projectId: string,
  token: string,
  file: File
): Promise<Document | null> {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch(`${apiUrl}/projects/${projectId}/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (res.ok) return await res.json() as Document;
    return null;
  } catch (err) {
    console.error('Failed to upload', file.name, err);
    return null;
  }
}

export default function KnowledgeBasePage() {
  const { project } = useOutletContext<{ project: any }>();
  const { projectId } = useParams<{ projectId: string }>();
  const { getToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  useEffect(() => {
    document.title = project ? `Knowledge Base — ${project.name} | ResearchHub` : 'Knowledge Base | ResearchHub';
  }, [project]);

  const [activeTab, setActiveTab] = useState<Tab>('papers');

  // Papers state
  const [papers, setPapers] = useState<ProjectPaper[]>([]);
  const [isPapersLoading, setIsPapersLoading] = useState(true);
  const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null);

  // Discover state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredPapers, setDiscoveredPapers] = useState<Paper[]>([]);
  const [showDiscoverPanel, setShowDiscoverPanel] = useState(false);

  // Documents state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChunkHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Topics
  const [topics, setTopics] = useState<Topic[]>([]);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmPaperId, setDeleteConfirmPaperId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch topics
  useEffect(() => {
    const fetchTopics = async () => {
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
      }
    };
    if (projectId) fetchTopics();
  }, [projectId, getToken, apiUrl]);

  // Fetch papers
  useEffect(() => {
    const fetchPapers = async () => {
      setIsPapersLoading(true);
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
      } finally {
        setIsPapersLoading(false);
      }
    };
    if (projectId) fetchPapers();
  }, [projectId, getToken, apiUrl]);

  // Fetch documents
  useEffect(() => {
    const fetchDocs = async () => {
      setIsDocsLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(`${apiUrl}/projects/${projectId}/documents`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setDocuments(data);
        }
      } catch (err) {
        console.error('Failed to fetch documents', err);
      } finally {
        setIsDocsLoading(false);
      }
    };
    if (projectId) fetchDocs();
  }, [projectId, getToken, apiUrl]);

  // Discover papers
  const handleDiscover = async () => {
    setIsDiscovering(true);
    setShowDiscoverPanel(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/papers/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ limit: 10 })
      });
      if (res.ok) {
        const data = await res.json();
        setDiscoveredPapers(data || []);
      }
    } catch (err) {
      console.error('Failed to discover papers', err);
    } finally {
      setIsDiscovering(false);
    }
  };

  // Accept a discovered paper
  const handleAcceptPaper = async (paperId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'accepted' })
      });
      if (res.ok) {
        const updated = await res.json();
        // Add to papers list
        setPapers(prev => [updated, ...prev.filter(p => p.paper.id !== paperId)]);
        // Remove from discovered
        setDiscoveredPapers(prev => prev.filter(p => p.id !== paperId));
      }
    } catch (err) {
      console.error('Failed to accept paper', err);
    }
  };

  // Reject a discovered paper
  const handleRejectPaper = async (paperId: string) => {
    // Remove from UI immediately
    setDiscoveredPapers(prev => prev.filter(p => p.id !== paperId));
    setPapers(prev => prev.filter(p => p.paper.id !== paperId));
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/projects/${projectId}/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'rejected' })
      });
    } catch (err) {
      console.error('Failed to reject paper', err);
    }
  };

  // Remove paper from project
  const handleRemovePaper = async (paperId: string) => {
    setDeletingId(paperId);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/papers/${paperId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok || res.status === 204) {
        setPapers(prev => prev.filter(p => p.paper.id !== paperId));
      }
    } catch (err) {
      console.error('Failed to remove paper', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Upload document
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const token = await getToken();
    if (!token) { setIsUploading(false); return; }
    for (const file of Array.from(files)) {
      const doc = await uploadSingleFile(apiUrl, projectId!, token, file);
      if (doc) setDocuments(prev => [doc, ...prev]);
    }
    setIsUploading(false);
    e.target.value = '';
  };

  // Delete document
  const handleDeleteDocument = async (docId: string) => {
    setDeletingId(docId);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok || res.status === 204) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
      }
    } catch (err) {
      console.error('Failed to delete document', err);
    } finally {
      setDeletingId(null);
    }
  };

  // Hybrid search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query: searchQuery, top_k: 10 })
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.hits || []);
      }
    } catch (err) {
      console.error('Failed to search', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Change topic assignment
  const handleTopicChange = async (paperId: string, topicId: string | null) => {
    // Optimistic update
    setPapers(prev => prev.map(p =>
      p.paper.id === paperId ? { ...p, topic_id: topicId } : p
    ));
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/projects/${projectId}/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ topic_id: topicId })
      });
    } catch (err) {
      console.error('Failed to update topic', err);
    }
  };

  const getTopicName = (topicId: string | null) => {
    if (!topicId) return null;
    return topics.find(t => t.id === topicId)?.name || null;
  };

  const acceptedPapers = papers.filter(p => p.status === 'accepted');
  const suggestedPapers = papers.filter(p => p.status === 'suggested');

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: 'papers', label: 'Papers', icon: FileText, count: acceptedPapers.length },
    { id: 'documents', label: 'Documents', icon: Database, count: documents.length },
    { id: 'search', label: 'Search', icon: Search },
  ];

  // Discover panel content
  let discoverContent: React.ReactNode;
  if (isDiscovering) {
    discoverContent = (
      <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
        <Loader2 size={24} className="animate-spin mb-2 text-indigo-400" />
        <p className="text-sm">Searching for relevant papers...</p>
      </div>
    );
  } else if (discoveredPapers.length > 0) {
    discoverContent = (
      <div className="space-y-3">
        {discoveredPapers.map(paper => (
          <div key={paper.id} className="p-4 bg-surface_container_high rounded-xl flex gap-4">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-white leading-snug mb-1">{paper.title}</h4>
              {paper.authors.length > 0 && (
                <p className="text-xs text-zinc-500 mb-1">{paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 && ' et al.'}</p>
              )}
              {paper.abstract && (
                <p className="text-xs text-zinc-400 line-clamp-2">{paper.abstract}</p>
              )}
              <div className="flex gap-2 mt-2">
                {paper.categories.slice(0, 3).map(cat => (
                  <span key={cat} className="text-[10px] px-2 py-0.5 bg-secondary_container text-on_secondary_container rounded-md">{cat}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                onClick={() => handleAcceptPaper(paper.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
              >
                <CheckCircle2 size={14} />
                Accept
              </button>
              <button
                onClick={() => handleRejectPaper(paper.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                <XCircle size={14} />
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    discoverContent = (
      <p className="text-sm text-zinc-500 text-center py-6">No new papers discovered. Try adjusting your project keywords or categories.</p>
    );
  }

  // Papers list content
  let papersListContent: React.ReactNode;
  if (isPapersLoading) {
    papersListContent = (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  } else if (acceptedPapers.length === 0) {
    papersListContent = (
      <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-[#161f33] rounded-2xl bg-surface_container/50">
        <FileText className="text-zinc-600 mb-4" size={48} />
        <h3 className="text-lg font-medium text-white mb-2">No accepted papers yet</h3>
        <p className="text-zinc-400 text-sm max-w-sm">
          Use "Discover Papers" to find relevant research, or papers will be suggested during project creation.
        </p>
      </div>
    );
  } else {
    papersListContent = (
      <div className="space-y-3">
        {acceptedPapers.map(pp => (
          <div
            key={pp.id}
            className="bg-surface_container border border-[#161f33] rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-colors"
          >
            <button
              type="button"
              className="w-full p-5 flex items-start gap-4 cursor-pointer text-left"
              onClick={() => setExpandedPaperId(expandedPaperId === pp.paper.id ? null : pp.paper.id)}
            >
              <div className="p-2 bg-indigo-500/10 rounded-lg flex-shrink-0 mt-0.5">
                <FileText size={18} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white leading-snug">{pp.paper.title}</h4>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {pp.paper.categories.slice(0, 4).map(cat => (
                    <span key={cat} className="text-[10px] px-2 py-0.5 bg-secondary_container text-on_secondary_container rounded-md">{cat}</span>
                  ))}
                  {pp.paper.published_at && (
                    <span className="text-[10px] text-zinc-500">{new Date(pp.paper.published_at).getFullYear()}</span>
                  )}
                  {pp.relevance_score != null && (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20">
                      {(pp.relevance_score * 100).toFixed(0)}% match
                    </span>
                  )}
                  {getTopicName(pp.topic_id) && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-md border border-indigo-500/20">
                      <Tag size={10} />
                      {getTopicName(pp.topic_id)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmPaperId(pp.paper.id); }}
                  disabled={deletingId === pp.paper.id}
                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                  title="Remove paper"
                >
                  {deletingId === pp.paper.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
                {expandedPaperId === pp.paper.id ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
              </div>
            </button>

            {expandedPaperId === pp.paper.id && (
              <div className="px-5 pb-5 border-t border-[#161f33] pt-4 space-y-3">
                {pp.paper.authors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-400 mb-1">Authors</p>
                    <p className="text-sm text-zinc-300">{pp.paper.authors.join(', ')}</p>
                  </div>
                )}
                {pp.paper.abstract && (
                  <div>
                    <p className="text-xs font-medium text-zinc-400 mb-1">Abstract</p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{pp.paper.abstract}</p>
                  </div>
                )}
                {pp.paper.pdf_url && (
                  <a
                    href={pp.paper.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <ExternalLink size={12} />
                    View PDF on arXiv
                  </a>
                )}
                {/* Topic selector */}
                {topics.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-400 mb-1">Topic</p>
                    <select
                      value={pp.topic_id || ''}
                      onChange={(e) => handleTopicChange(pp.paper.id, e.target.value || null)}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-surface_container_high border border-[#161f33] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors"
                    >
                      <option value="">No topic</option>
                      {topics.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Documents list content
  let docsListContent: React.ReactNode;
  if (isDocsLoading) {
    docsListContent = (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  } else if (documents.length === 0) {
    docsListContent = (
      <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-[#161f33] rounded-2xl bg-surface_container/50">
        <Database className="text-zinc-600 mb-4" size={48} />
        <h3 className="text-lg font-medium text-white mb-2">No documents uploaded</h3>
        <p className="text-zinc-400 text-sm max-w-sm">
          Upload PDF research papers or documents to build your project's knowledge base.
        </p>
      </div>
    );
  } else {
    docsListContent = (
      <div className="space-y-3">
        {documents.map(doc => (
          <div
            key={doc.id}
            className="bg-surface_container border border-[#161f33] rounded-2xl p-5 flex items-center gap-4 hover:border-indigo-500/30 transition-colors"
          >
            <div className="p-2 bg-emerald-500/10 rounded-lg flex-shrink-0">
              <FileText size={18} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{doc.original_filename}</p>
              <div className="flex items-center gap-3 mt-1">
                {doc.file_size_bytes && (
                  <span className="text-xs text-zinc-500">{(doc.file_size_bytes / 1024 / 1024).toFixed(1)} MB</span>
                )}
                <span className="text-xs text-zinc-500">
                  {new Date(doc.uploaded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {doc.chunks_indexed ? (
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 size={10} />
                    Indexed
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-md border border-amber-500/20 flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    Indexing...
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDeleteDocument(doc.id)}
              disabled={deletingId === doc.id}
              className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              title="Delete document"
            >
              {deletingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
          </div>
        ))}
      </div>
    );
  }

  // Search results content
  let searchResultsContent: React.ReactNode = null;
  if (isSearching) {
    searchResultsContent = (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
        <Loader2 size={32} className="animate-spin mb-3 text-indigo-400" />
        <p className="text-sm">Running hybrid BM25 + KNN search...</p>
      </div>
    );
  } else if (searchResults.length > 0) {
    searchResultsContent = (
      <div className="space-y-4">
        <p className="text-xs text-zinc-500">{searchResults.length} chunk{searchResults.length === 1 ? '' : 's'} found</p>
        {searchResults.map((hit, idx) => (
          <div
            key={`${hit.arxiv_id || hit.paper_id}-${idx}`}
            className="bg-surface_container border border-[#161f33] rounded-2xl p-5 hover:border-indigo-500/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                  #{idx + 1}
                </span>
                <h4 className="text-sm font-bold text-white">{hit.title}</h4>
              </div>
              <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20 flex-shrink-0">
                {hit.relevance_score.toFixed(3)}
              </span>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed bg-surface_container_lowest p-4 rounded-xl border border-[#212c43]">
              {hit.chunk_text}
            </p>
            {hit.arxiv_id && (
              <p className="text-xs text-zinc-500 mt-2">arXiv: {hit.arxiv_id}</p>
            )}
          </div>
        ))}
      </div>
    );
  } else if (hasSearched) {
    searchResultsContent = (
      <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-[#161f33] rounded-2xl bg-surface_container/50">
        <Search className="text-zinc-600 mb-4" size={48} />
        <h3 className="text-lg font-medium text-white mb-2">No results found</h3>
        <p className="text-zinc-400 text-sm max-w-sm">
          Try different keywords or make sure your papers and documents have been indexed.
        </p>
      </div>
    );
  } else {
    searchResultsContent = (
      <div className="flex flex-col items-center justify-center text-center p-12 text-zinc-500">
        <Search className="mb-4 text-zinc-600" size={48} />
        <p className="text-sm">Enter a query to search across your project's indexed papers and documents.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
            <BookOpen className="text-primary" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Knowledge Base</h1>
            <p className="text-zinc-400 text-sm mt-0.5">Manage papers and documents for {project?.name}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-primary-gradient text-white shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)]'
                : 'text-zinc-400 hover:text-zinc-200 bg-surface_container_high hover:bg-surface_bright'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                activeTab === tab.id ? 'bg-white/20' : 'bg-surface_bright text-zinc-500'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Papers Tab */}
      {activeTab === 'papers' && (
        <div className="space-y-6">
          {/* Action bar */}
          <div className="flex gap-3">
            <button
              onClick={handleDiscover}
              disabled={isDiscovering}
              className="flex items-center gap-2 bg-primary-gradient text-white px-5 py-2.5 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all disabled:opacity-50 text-sm"
            >
              {isDiscovering ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Discover Papers
            </button>
          </div>

          {/* Discover Panel */}
          {showDiscoverPanel && (
            <div className="bg-surface_container border border-[#161f33] rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-[#161f33]">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-400" />
                  Discovered Papers
                </h3>
                <button
                  onClick={() => setShowDiscoverPanel(false)}
                  className="text-zinc-400 hover:text-white text-xs px-3 py-1 rounded-lg hover:bg-surface_container_high transition-colors"
                >
                  Close
                </button>
              </div>
              <div className="p-4">
                {discoverContent}
              </div>
            </div>
          )}

          {/* Suggested papers (pending review) */}
          {suggestedPapers.length > 0 && (
            <div className="bg-surface_container border border-[#161f33] rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-[#161f33]">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <Loader2 size={16} className="text-amber-400" />
                  Pending Review ({suggestedPapers.length})
                </h3>
              </div>
              <div className="p-4 space-y-3">
                {suggestedPapers.map(pp => (
                  <div key={pp.id} className="p-4 bg-surface_container_high rounded-xl flex gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-white leading-snug">{pp.paper.title}</h4>
                        {pp.relevance_score != null && (
                          <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/20 font-medium flex-shrink-0">
                            {(pp.relevance_score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {pp.paper.abstract && (
                        <p className="text-xs text-zinc-400 line-clamp-2 mt-1">{pp.paper.abstract}</p>
                      )}
                      {getTopicName(pp.topic_id) && (
                        <span className="inline-flex items-center gap-1 mt-2 text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-md border border-indigo-500/20">
                          <Tag size={10} />
                          {getTopicName(pp.topic_id)}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleAcceptPaper(pp.paper.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                      <button
                        onClick={() => handleRejectPaper(pp.paper.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accepted papers list */}
          {papersListContent}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          {/* Upload area */}
          <label
            htmlFor="kb-file-upload"
            className="relative group p-8 border-2 border-dashed border-[#161f33] rounded-2xl flex flex-col items-center justify-center hover:border-indigo-500/50 hover:bg-surface_container_low transition-all cursor-pointer"
          >
            <input
              id="kb-file-upload"
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFileUpload}
              disabled={isUploading}
              className="hidden"
            />
            {isUploading ? (
              <>
                <Loader2 size={32} className="animate-spin text-indigo-400 mb-3" />
                <p className="text-sm text-zinc-300">Uploading documents...</p>
              </>
            ) : (
              <>
                <Upload size={32} className="text-zinc-500 mb-3 group-hover:text-indigo-400 transition-colors" />
                <p className="text-sm text-white font-medium mb-1">Click or drag PDF files here</p>
                <p className="text-xs text-zinc-500">Maximum 50MB per file</p>
              </>
            )}
          </label>

          {/* Document list */}
          {docsListContent}
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="text-zinc-500" size={18} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface_container_high border border-[#161f33] rounded-xl pl-11 pr-4 py-3 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm transition-colors"
                placeholder="Search across your papers and documents..."
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="flex items-center gap-2 bg-primary-gradient text-white px-6 py-3 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all disabled:opacity-50 text-sm"
            >
              {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
          </form>

          {searchResultsContent}
        </div>
      )}

      {/* Delete Paper Confirmation Modal */}
      {deleteConfirmPaperId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface_container border border-[#161f33] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 className="text-red-500" size={24} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Remove Paper</h2>
              <p className="text-zinc-400 text-sm">
                Are you sure you want to remove this paper from the project? This will also delete any indexed chunks for this paper.
              </p>
            </div>
            <div className="p-4 border-t border-[#161f33] bg-surface_container_high flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmPaperId(null)}
                disabled={deletingId === deleteConfirmPaperId}
                className="px-4 py-2 bg-surface_container hover:bg-surface_container_highest border border-[#161f33] text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleRemovePaper(deleteConfirmPaperId);
                  setDeleteConfirmPaperId(null);
                }}
                disabled={deletingId === deleteConfirmPaperId}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium shadow-[0_0_16px_rgba(239,68,68,0.2)] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deletingId === deleteConfirmPaperId ? <Loader2 size={16} className="animate-spin" /> : null}
                {deletingId === deleteConfirmPaperId ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
