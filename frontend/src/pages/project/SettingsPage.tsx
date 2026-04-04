import { useState, useEffect } from 'react';
import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/react';
import {
  Settings, Save, Loader2, Trash2, Plus, X, Archive, AlertTriangle
} from 'lucide-react';

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

export default function SettingsPage() {
  const { project } = useOutletContext<{ project: any }>();
  const { projectId } = useParams<{ projectId: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = project ? `Settings — ${project.name} | ResearchHub` : 'Settings | ResearchHub';
  }, [project]);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

  // Project fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [researchGoal, setResearchGoal] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  // Initialize from project
  useEffect(() => {
    if (project) {
      setName(project.name || '');
      setDescription(project.description || '');
      setResearchGoal(project.research_goal || '');
      setKeywords(project.initial_keywords || []);
      setSelectedCategories(new Set(project.arxiv_categories || []));
      setYearFrom(project.year_from?.toString() || '');
      setYearTo(project.year_to?.toString() || '');
    }
  }, [project]);

  // Save project
  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const token = await getToken();
      const payload: any = {
        name,
        description: description || null,
        research_goal: researchGoal || null,
        initial_keywords: keywords.length > 0 ? keywords : null,
        arxiv_categories: selectedCategories.size > 0 ? Array.from(selectedCategories) : null,
        year_from: yearFrom ? Number.parseInt(yearFrom) : null,
        year_to: yearTo ? Number.parseInt(yearTo) : null,
      };
      const res = await fetch(`${apiUrl}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Archive project
  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'archived' })
      });
      if (res.ok) {
        navigate('/dashboard/projects');
      }
    } catch (err) {
      console.error('Failed to archive', err);
    } finally {
      setIsArchiving(false);
      setShowArchiveConfirm(false);
    }
  };

  // Delete project
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok || res.status === 204) {
        navigate('/dashboard/projects');
      }
    } catch (err) {
      console.error('Failed to delete', err);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Add keyword
  const handleAddKeyword = () => {
    const kw = newKeyword.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords(prev => [...prev, kw]);
      setNewKeyword('');
    }
  };

  // Remove keyword
  const removeKeyword = (kw: string) => {
    setKeywords(prev => prev.filter(k => k !== kw));
  };

  // Toggle category
  const toggleCategory = (catId: string) => {
    const newSet = new Set(selectedCategories);
    if (newSet.has(catId)) newSet.delete(catId);
    else newSet.add(catId);
    setSelectedCategories(newSet);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-300">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
          <Settings className="text-primary" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Project Settings</h1>
          <p className="text-zinc-400 text-sm mt-0.5">Configure your research project</p>
        </div>
      </div>

      {/* General Settings */}
      <div className="bg-surface_container border border-[#161f33] rounded-2xl p-6 space-y-5">
        <h2 className="text-lg font-bold text-white">General</h2>

        <div>
          <label htmlFor="settings-name" className="block text-sm font-medium text-zinc-100 mb-1.5">Project Name</label>
          <input
            id="settings-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors"
          />
        </div>

        <div>
          <label htmlFor="settings-description" className="block text-sm font-medium text-zinc-100 mb-1.5">Description</label>
          <textarea
            id="settings-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors resize-none"
            placeholder="Brief overview..."
          />
        </div>

        <div>
          <label htmlFor="settings-research-goal" className="block text-sm font-medium text-zinc-100 mb-1.5">Research Goal</label>
          <textarea
            id="settings-research-goal"
            value={researchGoal}
            onChange={(e) => setResearchGoal(e.target.value)}
            rows={3}
            className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors resize-none"
            placeholder="What is the focus of this research?"
          />
        </div>
      </div>

      {/* Search Configuration */}
      <div className="bg-surface_container border border-[#161f33] rounded-2xl p-6 space-y-5">
        <h2 className="text-lg font-bold text-white">Search Configuration</h2>

        {/* Keywords */}
        <div>
          <label htmlFor="settings-new-keyword" className="block text-sm font-medium text-zinc-100 mb-1.5">Keywords</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {keywords.map(kw => (
              <span
                key={kw}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary_container text-on_secondary_container rounded-lg text-sm"
              >
                {kw}
                <button onClick={() => removeKeyword(kw)} className="hover:text-white transition-colors">
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              id="settings-new-keyword"
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKeyword(); } }}
              className="flex-1 bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm transition-colors"
              placeholder="Add a keyword..."
            />
            <button
              onClick={handleAddKeyword}
              disabled={!newKeyword.trim()}
              className="px-4 py-2.5 bg-surface_container_high hover:bg-surface_bright border border-[#161f33] text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Categories */}
        <div
          className="relative"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setIsCategoryDropdownOpen(false);
            }
          }}
        >
          <label htmlFor="settings-category-search" className="block text-sm font-medium text-zinc-100 mb-1.5">arXiv Categories</label>
          <div
            className="w-full min-h-[44px] bg-surface_container_high border border-[#161f33] rounded-xl px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50"
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
              onChange={(e) => {
                setCategorySearch(e.target.value);
                if (!isCategoryDropdownOpen) setIsCategoryDropdownOpen(true);
              }}
              onFocus={() => setIsCategoryDropdownOpen(true)}
              id="settings-category-search"
              className="flex-1 bg-transparent border-none text-white placeholder-zinc-400 focus:outline-none focus:ring-0 text-sm min-w-[120px] px-2 py-1"
              placeholder={selectedCategories.size === 0 ? "Search categories..." : ""}
            />
          </div>

          {isCategoryDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 max-h-48 overflow-y-auto scrollbar-hide bg-surface_container_high border border-[#161f33] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30 flex flex-col py-1">
              {Object.entries(ARXIV_CATEGORIES_MAP)
                .filter(([id, catName]) => catName.toLowerCase().includes(categorySearch.toLowerCase()) || id.toLowerCase().includes(categorySearch.toLowerCase()))
                .map(([id, catName]) => {
                  const isSelected = selectedCategories.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { toggleCategory(id); setCategorySearch(''); }}
                      className={`px-4 py-2.5 text-left text-sm hover:bg-surface_container transition-colors flex justify-between items-center ${isSelected ? 'bg-surface_container text-white' : 'text-zinc-100'}`}
                    >
                      <span>{catName}</span>
                      <span className="text-xs text-zinc-500 font-mono">{id}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Year range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="settings-year-from" className="block text-sm font-medium text-zinc-100 mb-1.5">Year From</label>
            <input
              id="settings-year-from"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value.replaceAll(/\D/g, ''))}
              className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm"
              placeholder="2020"
            />
          </div>
          <div>
            <label htmlFor="settings-year-to" className="block text-sm font-medium text-zinc-100 mb-1.5">Year To</label>
            <input
              id="settings-year-to"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value.replaceAll(/\D/g, ''))}
              className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 text-sm"
              placeholder="2024"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between">
        <div>
          {saveSuccess && (
            <span className="text-sm text-emerald-400 animate-in fade-in duration-200">Changes saved successfully</span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="flex items-center gap-2 bg-primary-gradient text-white px-6 py-2.5 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all disabled:opacity-50 text-sm"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="bg-surface_container border border-red-500/20 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
          <AlertTriangle size={20} />
          Danger Zone
        </h2>

        <div className="flex items-center justify-between p-4 bg-surface_container_high rounded-xl">
          <div>
            <p className="text-sm font-medium text-white">Archive Project</p>
            <p className="text-xs text-zinc-400 mt-0.5">Hide this project from your dashboard. Can be restored later.</p>
          </div>
          <button
            onClick={() => setShowArchiveConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 rounded-xl text-sm font-medium transition-colors"
          >
            <Archive size={14} />
            Archive
          </button>
        </div>

        <div className="flex items-center justify-between p-4 bg-surface_container_high rounded-xl">
          <div>
            <p className="text-sm font-medium text-white">Delete Project</p>
            <p className="text-xs text-zinc-400 mt-0.5">Permanently remove this project and all associated data.</p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-xl text-sm font-medium transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface_container border border-[#161f33] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                <Archive className="text-amber-500" size={24} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Archive Project</h2>
              <p className="text-zinc-400 text-sm">
                This will hide "<span className="text-white font-medium">{project?.name}</span>" from your dashboard.
                You can unarchive it later from the projects list.
              </p>
            </div>
            <div className="p-4 border-t border-[#161f33] bg-surface_container_high flex justify-end gap-3">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                disabled={isArchiving}
                className="px-4 py-2 bg-surface_container hover:bg-surface_container_highest border border-[#161f33] text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={isArchiving}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isArchiving ? <Loader2 size={16} className="animate-spin" /> : null}
                {isArchiving ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface_container border border-[#161f33] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <Trash2 className="text-red-500" size={24} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Delete Project</h2>
              <p className="text-zinc-400 text-sm">
                Are you sure you want to permanently delete "<span className="text-white font-medium">{project?.name}</span>"?
                This action cannot be undone and will permanently remove all associated papers, documents, and chat history.
              </p>
            </div>
            <div className="p-4 border-t border-[#161f33] bg-surface_container_high flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 bg-surface_container hover:bg-surface_container_highest border border-[#161f33] text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium shadow-[0_0_16px_rgba(239,68,68,0.2)] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : null}
                {isDeleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
