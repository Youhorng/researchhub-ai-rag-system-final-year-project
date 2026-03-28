import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { X, Sparkles, Loader2, CheckCircle2, XCircle, Plus } from 'lucide-react';

const ARXIV_CATEGORIES_MAP: Record<string, string> = {
  'cs.AI': 'Artificial Intelligence',
  'cs.CL': 'Computation and Language',
  'cs.CV': 'Computer Vision',
  'cs.LG': 'Machine Learning',
  'cs.NE': 'Neural and Evolutionary Computing',
  'cs.RO': 'Robotics',
  'cs.SE': 'Software Engineering',
  'cs.CR': 'Cryptography and Security',
  'cs.DS': 'Data Structures and Algorithms',
  'cs.DB': 'Databases',
  'cs.HC': 'Human-Computer Interaction',
  'stat.ML': 'Machine Learning (Stat)',
  'math.OC': 'Optimization and Control',
  'quant-ph': 'Quantum Physics',
  'physics.comp-ph': 'Computational Physics',
};

interface NewTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onTopicCreated: (topic: any) => void;
}

export default function NewTopicModal({ isOpen, onClose, projectId, onTopicCreated }: NewTopicModalProps) {
  const { getToken } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  const [step, setStep] = useState<1 | 2>(1);
  const [topicName, setTopicName] = useState('');
  const [researchGoal, setResearchGoal] = useState('');
  const [error, setError] = useState('');

  // Keywords
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [customKeyword, setCustomKeyword] = useState('');

  // Categories
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [categorySearch, setCategorySearch] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  // Year range
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');

  // Topic creation
  const [isCreating, setIsCreating] = useState(false);
  const [createdTopicId, setCreatedTopicId] = useState<string | null>(null);

  // Step 2: papers
  const [isSearchingPapers, setIsSearchingPapers] = useState(false);
  const [suggestedPapers, setSuggestedPapers] = useState<any[]>([]);
  const [paperActions, setPaperActions] = useState<Record<string, 'accepted' | 'rejected'>>({});

  // Search papers when entering step 2
  useEffect(() => {
    if (step === 2 && createdTopicId && selectedKeywords.size > 0) {
      const searchPapers = async () => {
        setIsSearchingPapers(true);
        try {
          const token = await getToken();
          const res = await fetch(`${apiUrl}/projects/${projectId}/papers/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              keywords: Array.from(selectedKeywords),
              limit: 10,
              topic_id: createdTopicId
            })
          });
          if (res.ok) {
            const data = await res.json();
            setSuggestedPapers(data || []);
          }
        } catch (err) {
          console.error('Failed to search papers', err);
        } finally {
          setIsSearchingPapers(false);
        }
      };
      searchPapers();
    }
  }, [step, createdTopicId, selectedKeywords, getToken, apiUrl, projectId]);

  const handleSuggestKeywords = async () => {
    if (!researchGoal.trim()) {
      setError('Please enter a topic goal first.');
      return;
    }
    setError('');
    setIsGeneratingKeywords(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/suggest-keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ research_goal: researchGoal })
      });
      if (!res.ok) throw new Error('Failed to generate keywords');
      const data = await res.json();
      setSuggestedKeywords(data.keywords || []);
      setSelectedKeywords(new Set(data.keywords || []));
    } catch (err: any) {
      setError(err.message || 'Error suggesting keywords.');
    } finally {
      setIsGeneratingKeywords(false);
    }
  };

  const toggleKeyword = (kw: string) => {
    const newSet = new Set(selectedKeywords);
    if (newSet.has(kw)) newSet.delete(kw);
    else newSet.add(kw);
    setSelectedKeywords(newSet);
  };

  const handleAddCustomKeyword = () => {
    const kw = customKeyword.trim();
    if (kw && !selectedKeywords.has(kw)) {
      setSuggestedKeywords(prev => [...prev, kw]);
      setSelectedKeywords(prev => new Set([...prev, kw]));
      setCustomKeyword('');
    }
  };

  const toggleCategory = (catId: string) => {
    const newSet = new Set(selectedCategories);
    if (newSet.has(catId)) newSet.delete(catId);
    else newSet.add(catId);
    setSelectedCategories(newSet);
  };

  const handleCreateTopic = async () => {
    if (!topicName.trim()) {
      setError('Topic name is required.');
      return;
    }
    setError('');
    setIsCreating(true);
    try {
      const token = await getToken();
      const payload = {
        name: topicName.trim(),
        keywords: selectedKeywords.size > 0 ? Array.from(selectedKeywords) : null,
        arxiv_categories: selectedCategories.size > 0 ? Array.from(selectedCategories) : null,
        year_from: yearFrom ? parseInt(yearFrom) : null,
        year_to: yearTo ? parseInt(yearTo) : null,
      };
      const res = await fetch(`${apiUrl}/projects/${projectId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to create topic');
      const topic = await res.json();
      setCreatedTopicId(topic.id);
      onTopicCreated(topic);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Error creating topic.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAcceptPaper = async (paperId: string) => {
    setPaperActions(prev => ({ ...prev, [paperId]: 'accepted' }));
    try {
      const token = await getToken();
      await fetch(`${apiUrl}/projects/${projectId}/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'accepted' })
      });
    } catch (err) {
      console.error('Failed to accept paper', err);
    }
  };

  const handleRejectPaper = async (paperId: string) => {
    setPaperActions(prev => ({ ...prev, [paperId]: 'rejected' }));
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

  const handleFinish = () => {
    resetAndClose();
  };

  const resetAndClose = () => {
    onClose();
    setTimeout(() => {
      setStep(1);
      setTopicName('');
      setResearchGoal('');
      setError('');
      setSuggestedKeywords([]);
      setSelectedKeywords(new Set());
      setCustomKeyword('');
      setSelectedCategories(new Set());
      setCategorySearch('');
      setYearFrom('');
      setYearTo('');
      setCreatedTopicId(null);
      setSuggestedPapers([]);
      setPaperActions({});
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div
        className="w-full max-w-2xl bg-surface_container border border-[#161f33] rounded-2xl shadow-2xl my-8 mx-auto flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-center p-5 border-b border-[#161f33] flex-shrink-0">
          <h2 className="text-xl font-bold text-white">
            {step === 1 ? 'Create New Topic' : 'Review Discovered Papers'}
          </h2>
          <button onClick={resetAndClose} className="absolute right-5 text-zinc-300 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Step 1: Topic Details */}
        {step === 1 && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-5 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
              {error && <div className="p-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-zinc-100 mb-1.5">Topic Name *</label>
                <input
                  type="text"
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors"
                  placeholder="e.g., Transformer Architectures"
                />
              </div>

              {/* Research Goal + Suggest Keywords */}
              <div className="p-4 bg-surface_container_low border border-[#161f33] rounded-xl space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-100 mb-1.5">Topic Goal</label>
                  <textarea
                    value={researchGoal}
                    onChange={(e) => setResearchGoal(e.target.value)}
                    rows={2}
                    className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors resize-none"
                    placeholder="Describe what this topic focuses on to get keyword suggestions..."
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSuggestKeywords}
                  disabled={isGeneratingKeywords || !researchGoal.trim()}
                  className="flex w-fit items-center gap-2 bg-primary-gradient shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] text-white px-5 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed text-sm"
                >
                  {isGeneratingKeywords ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {isGeneratingKeywords ? 'Generating...' : 'Suggest Keywords'}
                </button>

                {suggestedKeywords.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-medium text-zinc-300 mb-2">Select keywords for paper discovery:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedKeywords.map(kw => (
                        <button
                          key={kw}
                          type="button"
                          onClick={() => toggleKeyword(kw)}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all border ${
                            selectedKeywords.has(kw)
                              ? 'bg-primary-gradient border-white/40 ring-2 ring-white text-white shadow-lg'
                              : 'bg-primary-gradient border-transparent text-white/80 hover:text-white opacity-60 hover:opacity-100 shadow-sm'
                          }`}
                        >
                          {kw}
                        </button>
                      ))}
                    </div>
                    {/* Custom keyword input */}
                    <div className="flex gap-2 mt-3">
                      <input
                        type="text"
                        value={customKeyword}
                        onChange={(e) => setCustomKeyword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomKeyword(); } }}
                        className="flex-1 bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm transition-colors"
                        placeholder="Add custom keyword..."
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomKeyword}
                        disabled={!customKeyword.trim()}
                        className="px-3 py-2 bg-surface_container_high hover:bg-surface_bright border border-[#161f33] text-zinc-300 hover:text-white rounded-xl text-sm transition-colors disabled:opacity-50"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Categories & Year Range */}
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-all duration-300 ${isCategoryDropdownOpen ? 'pb-48' : 'pb-0'}`}>
                <div
                  className="relative"
                  tabIndex={-1}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setIsCategoryDropdownOpen(false);
                    }
                  }}
                >
                  <label className="block text-sm font-medium text-zinc-100 mb-1.5">arXiv Categories</label>
                  <div
                    className="w-full min-h-[44px] bg-surface_container_high border border-[#161f33] rounded-xl px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50"
                    onClick={() => setIsCategoryDropdownOpen(true)}
                  >
                    {Array.from(selectedCategories).map(catId => (
                      <span key={catId} className="bg-surface_container border border-zinc-700 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1.5">
                        {ARXIV_CATEGORIES_MAP[catId] || catId}
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleCategory(catId); }} className="text-zinc-300 hover:text-white">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => { setCategorySearch(e.target.value); if (!isCategoryDropdownOpen) setIsCategoryDropdownOpen(true); }}
                      onFocus={() => setIsCategoryDropdownOpen(true)}
                      className="flex-1 bg-transparent border-none text-white placeholder-zinc-400 focus:outline-none focus:ring-0 text-sm min-w-[120px] px-2 py-1"
                      placeholder={selectedCategories.size === 0 ? 'Search categories...' : ''}
                    />
                  </div>

                  {isCategoryDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto scrollbar-hide overscroll-contain bg-surface_container_high border border-[#161f33] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 flex flex-col py-1">
                      {Object.entries(ARXIV_CATEGORIES_MAP)
                        .filter(([id, name]) => name.toLowerCase().includes(categorySearch.toLowerCase()) || id.toLowerCase().includes(categorySearch.toLowerCase()))
                        .map(([id, name]) => {
                          const isSelected = selectedCategories.has(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => { toggleCategory(id); setCategorySearch(''); }}
                              className={`px-4 py-2.5 text-left text-sm hover:bg-surface_container transition-colors flex justify-between items-center ${isSelected ? 'bg-surface_container text-white' : 'text-zinc-100'}`}
                            >
                              <span>{name}</span>
                              <span className="text-xs text-zinc-500 font-mono">{id}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-100 mb-1.5">Year From</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={yearFrom}
                      onChange={(e) => setYearFrom(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm"
                      placeholder="2020"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-100 mb-1.5">Year To</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={yearTo}
                      onChange={(e) => setYearTo(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm"
                      placeholder="2025"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-[#161f33] flex justify-end gap-3 flex-shrink-0 bg-surface_container rounded-b-2xl">
              <button
                type="button"
                onClick={resetAndClose}
                className="px-5 py-2.5 text-sm font-medium text-zinc-100 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTopic}
                disabled={isCreating || !topicName.trim()}
                className="bg-primary-gradient text-white px-6 py-2.5 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isCreating ? <Loader2 size={18} className="animate-spin" /> : null}
                {isCreating ? 'Creating...' : 'Create Topic & Find Papers'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review Papers */}
        {step === 2 && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-5 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
              <p className="text-sm text-zinc-400">
                Papers discovered for this topic. Accept papers to add them to your Knowledge Base, or reject to dismiss.
              </p>

              {isSearchingPapers ? (
                <div className="p-8 flex flex-col items-center justify-center text-zinc-400 bg-surface_container_low rounded-xl border border-[#161f33]">
                  <Loader2 size={24} className="animate-spin mb-2 text-indigo-400" />
                  <p className="text-sm">Searching for relevant papers...</p>
                </div>
              ) : suggestedPapers.length > 0 ? (
                <div className="space-y-3">
                  {suggestedPapers.map(paper => {
                    const action = paperActions[paper.id];
                    if (action === 'rejected') return null;
                    return (
                      <div
                        key={paper.id}
                        className={`p-4 rounded-xl border transition-colors ${
                          action === 'accepted'
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : 'bg-surface_container_high border-[#161f33]'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-white leading-snug mb-1">{paper.title}</h4>
                            {paper.authors && paper.authors.length > 0 && (
                              <p className="text-xs text-zinc-500 mb-1">{paper.authors.slice(0, 3).join(', ')}{paper.authors.length > 3 && ' et al.'}</p>
                            )}
                            {paper.abstract && (
                              <p className="text-xs text-zinc-400 line-clamp-2">{paper.abstract}</p>
                            )}
                            <div className="flex gap-2 mt-2">
                              {paper.categories?.slice(0, 3).map((cat: string) => (
                                <span key={cat} className="text-[10px] px-2 py-0.5 bg-secondary_container text-on_secondary_container rounded-md">{cat}</span>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 flex-shrink-0">
                            {action === 'accepted' ? (
                              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 size={14} />
                                Added
                              </span>
                            ) : (
                              <>
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
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center text-zinc-500 bg-surface_container_low rounded-xl text-sm border border-[#161f33]">
                  No papers found for this topic's keywords. You can still find papers via the Knowledge Base.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-[#161f33] flex justify-end gap-3 flex-shrink-0 bg-surface_container rounded-b-2xl">
              <button
                type="button"
                onClick={handleFinish}
                className="bg-primary-gradient text-white px-6 py-2.5 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all flex items-center gap-2"
              >
                Finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
