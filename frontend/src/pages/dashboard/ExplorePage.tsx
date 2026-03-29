import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/react';
import { useNavigate } from 'react-router-dom';
import { Search, Compass, Loader2, Calendar, FileText, ExternalLink, X, FolderPlus } from 'lucide-react';
import AddToProjectModal from '../../components/modals/AddToProjectModal';

// Shared category map — same as NewProjectModal
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

interface ExploreHit {
  paper_id: string;
  arxiv_id: string;
  title: string;
  abstract: string;
  categories: string[];
  published_at: string;
  relevance_score: number;
}

interface ExploreResponse {
  query: string;
  total: number;
  page: number;
  hits: ExploreHit[];
}

export default function ExplorePage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [categorySearch, setCategorySearch] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<ExploreHit[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [addModalPaper, setAddModalPaper] = useState<ExploreHit | null>(null);

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setPage(1);
    setCategorySearch('');
  };

  const fetchResults = useCallback(async () => {
    if (!debouncedQuery.trim() && selectedCategories.size === 0) {
      setResults([]);
      setTotal(0);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

      const params = new URLSearchParams({
        q: debouncedQuery.trim() || 'machine learning',
        page: page.toString(),
        limit: '12',
      });

      selectedCategories.forEach(cat => params.append('categories', cat));

      const res = await fetch(`${apiUrl}/explore/search?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Search failed');
      const data: ExploreResponse = await res.json();

      if (page === 1) {
        setResults(data.hits);
      } else {
        setResults(prev => [...prev, ...data.hits]);
      }
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message || 'An error occurred while searching.');
      if (page === 1) setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedQuery, selectedCategories, page, getToken]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const filteredCategories = Object.entries(ARXIV_CATEGORIES_MAP).filter(
    ([id, name]) =>
      name.toLowerCase().includes(categorySearch.toLowerCase()) ||
      id.toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <>
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
            <Compass className="text-primary" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Explore</h1>
            <p className="text-zinc-400 text-sm mt-0.5">Global search across 702k+ arXiv papers</p>
          </div>
        </div>
      </div>

      {/* Search bar + Category filter */}
      <div className="bg-surface_container border border-[#161f33] p-4 rounded-2xl mb-8 flex-shrink-0 flex flex-col sm:flex-row items-center gap-4">
        {/* Text search */}
        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="text-zinc-500" size={18} />
          </div>
          <input
            type="text"
            className="w-full bg-surface_container_high border border-[#161f33] rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 text-sm transition-colors"
            placeholder="Search all papers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Category searchable multiselect */}
        <div
          className="relative w-full sm:w-64"
          tabIndex={-1}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setIsCategoryDropdownOpen(false);
            }
          }}
        >
          <div
            className="w-full min-h-[42px] bg-surface_container_high border border-[#161f33] rounded-xl px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text transition-colors focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500"
            onClick={() => setIsCategoryDropdownOpen(true)}
          >
            {Array.from(selectedCategories).map(catId => (
              <span
                key={catId}
                className="bg-surface_container border border-zinc-700 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1.5"
              >
                {ARXIV_CATEGORIES_MAP[catId] || catId}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleCategory(catId); }}
                  className="text-zinc-400 hover:text-white"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={categorySearch}
              onChange={(e) => { setCategorySearch(e.target.value); setIsCategoryDropdownOpen(true); }}
              onFocus={() => setIsCategoryDropdownOpen(true)}
              className="flex-1 bg-transparent border-none text-white placeholder-zinc-500 focus:outline-none focus:ring-0 text-sm min-w-[100px] px-2 py-1"
              placeholder={selectedCategories.size === 0 ? 'Filter by category…' : ''}
            />
          </div>

          {isCategoryDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 max-h-52 overflow-y-auto scrollbar-hide bg-surface_container_high border border-[#161f33] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 py-1">
              {filteredCategories.length === 0 ? (
                <p className="px-4 py-3 text-sm text-zinc-500">No categories found</p>
              ) : filteredCategories.map(([id, name]) => {
                const isSelected = selectedCategories.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleCategory(id)}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-surface_container transition-colors flex justify-between items-center ${isSelected ? 'bg-surface_container text-white' : 'text-zinc-100'}`}
                  >
                    <span>{name}</span>
                    <span className="text-xs text-zinc-500 font-mono">{id}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading && page === 1 ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-primary mb-4" size={32} />
          <p className="text-zinc-400 text-sm">Searching global index...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm flex justify-center">
          {error}
        </div>
      ) : results.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-[#161f33] rounded-2xl bg-surface_container/50">
          <FileText className="text-zinc-600 mb-4" size={48} />
          <h3 className="text-lg font-medium text-white mb-2">No papers found</h3>
          <p className="text-zinc-400 text-sm max-w-sm">
            {debouncedQuery || selectedCategories.size > 0
              ? `We couldn't find any papers matching your search criteria.`
              : 'Enter a search query or select a category to start exploring the global index.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="mb-4 text-sm text-zinc-400">
            Found <span className="text-white font-medium">{total.toLocaleString()}</span> result{total !== 1 ? 's' : ''}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-6 auto-rows-max">
            {results.map((hit, idx) => (
              <div
                key={`${hit.paper_id}-${idx}`}
                className="group bg-surface_container border border-[#161f33] rounded-2xl p-6 hover:border-indigo-500/50 hover:bg-surface_container_low transition-all shadow-sm flex flex-col h-full"
              >
                <div className="mb-3">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {hit.categories.slice(0, 3).map(cat => (
                      <span key={cat} className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {ARXIV_CATEGORIES_MAP[cat] || cat}
                      </span>
                    ))}
                    {hit.categories.length > 3 && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                        +{hit.categories.length - 3}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white leading-tight mb-2 group-hover:text-indigo-400 transition-colors">
                    {hit.title}
                  </h3>

                  <div className="flex items-center gap-2 text-zinc-500 text-xs mt-2">
                    <Calendar size={12} />
                    <span>{new Date(hit.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>

                <div className="mt-2 mb-6">
                  <p className="text-sm text-zinc-400 leading-relaxed line-clamp-3">
                    {hit.abstract}
                  </p>
                </div>

                <div className="mt-auto pt-4 border-t border-[#161f33] flex gap-2">
                  <button
                    onClick={() => navigate(`/dashboard/explore/paper/${hit.arxiv_id.replace('/', '_')}`, { state: { paper: hit } })}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-primary-gradient text-white py-2 rounded-xl text-xs font-medium transition-all shadow-[0_4px_20px_-4px_rgba(167,165,255,0.3)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.5)]"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => setAddModalPaper(hit)}
                    className="flex items-center justify-center gap-1.5 bg-surface_container_high hover:bg-indigo-500/20 border border-[#161f33] hover:border-indigo-500/40 text-zinc-300 hover:text-indigo-300 py-2 px-3 rounded-xl text-xs font-medium transition-colors"
                    title="Add to project"
                  >
                    <FolderPlus size={14} />
                  </button>
                  <a
                    href={`https://arxiv.org/pdf/${hit.arxiv_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-surface_container_high hover:bg-surface_container_highest border border-[#161f33] text-zinc-300 hover:text-white py-2 px-3 rounded-xl text-xs font-medium transition-colors"
                    title="Open PDF"
                  >
                    <FileText size={14} />
                  </a>
                  <a
                    href={`https://arxiv.org/abs/${hit.arxiv_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-surface_container_high hover:bg-surface_container_highest border border-[#161f33] text-zinc-300 hover:text-white py-2 px-3 rounded-xl text-xs font-medium transition-colors"
                    title="Open arXiv page"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {total > results.length && (
            <div className="flex justify-center pb-8 pt-4">
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-surface_container_high hover:bg-surface_container_highest border border-[#161f33] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 shadow-sm"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Compass size={16} />}
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>

      <AddToProjectModal
        paper={addModalPaper}
        onClose={() => setAddModalPaper(null)}
      />
    </>
  );
}
