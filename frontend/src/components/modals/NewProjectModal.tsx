import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { X, Sparkles, Loader2, Upload, CheckCircle2, FileUp, FileText, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  'physics.comp-ph': 'Computational Physics'
};

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NewProjectModal({ isOpen, onClose }: NewProjectModalProps) {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [researchGoal, setResearchGoal] = useState('');
  
  // Keywords flow
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());

  // Other optional fields
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [step, setStep] = useState<1 | 2>(1);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  // Step 2 states
  const [isSearchingPapers, setIsSearchingPapers] = useState(false);
  const [suggestedPapers, setSuggestedPapers] = useState<any[]>([]);
  const [acceptedPaperIds, setAcceptedPaperIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (step === 2 && createdProjectId && selectedKeywords.size > 0) {
      const searchPapers = async () => {
        setIsSearchingPapers(true);
        try {
          const token = await getToken();
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
          const res = await fetch(`${apiUrl}/projects/${createdProjectId}/papers/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ keywords: Array.from(selectedKeywords), limit: 5 })
          });
          if (res.ok) {
            const data = await res.json();
            setSuggestedPapers(data || []);
          }
        } catch (err) {
          console.error("Failed to suggest papers", err);
        } finally {
          setIsSearchingPapers(false);
        }
      };
      searchPapers();
    }
  }, [step, createdProjectId, selectedKeywords, getToken]);

  const handleTogglePaper = async (paperId: string) => {
    const isAdding = !acceptedPaperIds.has(paperId);
    
    const newAccepted = new Set(acceptedPaperIds);
    if (isAdding) {
      newAccepted.add(paperId);
    } else {
      newAccepted.delete(paperId);
    }
    setAcceptedPaperIds(newAccepted);
    
    try {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      await fetch(`${apiUrl}/projects/${createdProjectId}/papers/${paperId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: isAdding ? 'accepted' : 'suggested' })
      });
    } catch (err) {
      console.error("Failed to toggle paper", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !createdProjectId) return;
    setIsUploading(true);
    const token = await getToken();
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
    const successfulUploads: any[] = [];
    for (let i = 0; i < files.length; i++) {
       const file = files[i];
       const formData = new FormData();
       formData.append('file', file);
       try {
         const res = await fetch(`${apiUrl}/projects/${createdProjectId}/documents`, {
           method: 'POST',
           headers: { 'Authorization': `Bearer ${token}` },
           body: formData
         });
         if (res.ok) {
           const doc = await res.json();
           successfulUploads.push(doc);
         }
       } catch (err) {
         console.error("Failed to upload", file.name, err);
       }
    }
    setUploadedDocs(prev => [...prev, ...successfulUploads]);
    setIsUploading(false);
    e.target.value = '';
  };

  const handleDeleteDocument = async (docId: string) => {
    setUploadedDocs(prev => prev.filter(d => d.id !== docId));
    try {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      await fetch(`${apiUrl}/projects/${createdProjectId}/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error("Failed to delete document", err);
    }
  };

  const finishAndClose = async () => {
    setIsFinishing(true);
    
    // Optimistically clean up unselected papers
    if (createdProjectId && suggestedPapers.length > 0) {
      try {
        const token = await getToken();
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
        
        // Find all papers that were suggested but not accepted
        const unselectedPapers = suggestedPapers.filter(p => !acceptedPaperIds.has(p.id));
        
        // Wait for all PATCH requests to reject them to complete
        const rejectionPromises = unselectedPapers.map(paper =>
          fetch(`${apiUrl}/projects/${createdProjectId}/papers/${paper.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: 'rejected' })
          })
        );
        
        if (rejectionPromises.length > 0) {
          await Promise.allSettled(rejectionPromises);
        }
      } catch (err) {
        console.error("Failed to reject unused papers", err);
      }
    }

    setIsFinishing(false);
    onClose();
    if (createdProjectId) {
      navigate(`/dashboard/projects/${createdProjectId}`);
      // Reset state so next open is clean
      setTimeout(() => {
        setStep(1);
        setName('');
        setDescription('');
        setResearchGoal('');
        setSelectedKeywords(new Set());
        setSelectedCategories(new Set());
        setSuggestedPapers([]);
        setAcceptedPaperIds(new Set());
        setUploadedDocs([]);
      }, 500);
    }
  };

  if (!isOpen) return null;

  const handleSuggestKeywords = async () => {
    if (!researchGoal.trim()) {
      setError('Please enter a research goal first.');
      return;
    }
    setError('');
    setIsGeneratingKeywords(true);
    try {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      const res = await fetch(`${apiUrl}/projects/suggest-keywords`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ research_goal: researchGoal })
      });
      if (!res.ok) throw new Error('Failed to generate keywords');
      const data = await res.json();
      setSuggestedKeywords(data.keywords || []);
      // Auto-select all by default to make it easy for the user
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

  const toggleCategory = (catId: string) => {
    const newSet = new Set(selectedCategories);
    if (newSet.has(catId)) newSet.delete(catId);
    else newSet.add(catId);
    setSelectedCategories(newSet);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const token = await getToken();
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
      
      const payload = {
        name,
        description: description || null,
        research_goal: researchGoal || null,
        initial_keywords: selectedKeywords.size > 0 ? Array.from(selectedKeywords) : null,
        arxiv_categories: selectedCategories.size > 0 ? Array.from(selectedCategories) : null,
        year_from: yearFrom ? parseInt(yearFrom) : null,
        year_to: yearTo ? parseInt(yearTo) : null
      };

      const res = await fetch(`${apiUrl}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to create project');
      const newProject = await res.json();
      
      // Transition to Step 2 instead of closing immediately
      setCreatedProjectId(newProject.id);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Error creating project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div 
        className="w-full max-w-2xl bg-surface_container border border-[#161f33] rounded-2xl shadow-2xl my-8 mx-auto flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center p-5 border-b border-[#161f33] flex-shrink-0">
          <h2 className="text-xl font-bold text-white">
            {step === 1 ? 'Create New Project' : 'Add Papers & Documents'}
          </h2>
          <button onClick={onClose} className="absolute right-5 text-zinc-300 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col flex-1 overflow-hidden" style={{ display: step === 1 ? 'flex' : 'none' }}>
          <div className="p-5 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
            {error && <div className="p-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-zinc-100 mb-1.5">Project Name *</label>
            <input 
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
              placeholder="Retrieval Augmented Generation"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-100 mb-1.5">Description</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors resize-none"
              placeholder="Brief overview of what this project aims to explore..."
            />
          </div>

          <div className="p-4 bg-surface_container_low border border-[#161f33] rounded-xl space-y-4">
            <div>
               <label className="block text-sm font-medium text-zinc-100 mb-1.5">Research Goal</label>
               <textarea 
                 value={researchGoal}
                 onChange={(e) => setResearchGoal(e.target.value)}
                 rows={2}
                 className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors resize-none"
                 placeholder="What exactly are you researching? We can use this to suggest relevant keywords."
               />
            </div>
            
            <button
              type="button"
              onClick={handleSuggestKeywords}
              disabled={isGeneratingKeywords || !researchGoal.trim()}
              className="flex w-fit items-center gap-2 bg-primary-gradient shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] text-white px-5 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed text-sm"
            >
              {isGeneratingKeywords ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-white" />}
              {isGeneratingKeywords ? 'Generating...' : 'Suggest Keywords'}
            </button>

            {suggestedKeywords.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-medium text-zinc-300 mb-2">Select keywords for your search query:</p>
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
              </div>
            )}
          </div>

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
                className="w-full min-h-[44px] bg-surface_container_high border border-[#161f33] rounded-xl px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text transition-colors focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500"
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
                  onChange={(e) => {
                    setCategorySearch(e.target.value);
                    if (!isCategoryDropdownOpen) setIsCategoryDropdownOpen(true);
                  }}
                  onFocus={() => setIsCategoryDropdownOpen(true)}
                  className="flex-1 bg-transparent border-none text-white placeholder-zinc-400 focus:outline-none focus:ring-0 text-sm min-w-[120px] px-2 py-1"
                  placeholder={selectedCategories.size === 0 ? "Search categories..." : ""}
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
                    className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 text-sm"
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
                    className="w-full bg-surface_container_high border border-[#161f33] rounded-xl px-4 py-2.5 text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 text-sm"
                    placeholder="2024"
                  />
               </div>
            </div>
          </div>

          </div>
          <div className="p-5 border-t border-[#161f33] flex justify-end gap-3 flex-shrink-0 bg-surface_container rounded-b-2xl">
             <button
               type="button"
               onClick={onClose}
               className="px-5 py-2.5 text-sm font-medium text-zinc-100 hover:text-white transition-colors"
             >
               Cancel
             </button>
             <button
               type="submit"
               disabled={isSubmitting || !name.trim()}
               className="bg-primary-gradient text-white px-6 py-2.5 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] disabled:opacity-50 transition-all flex items-center gap-2"
             >
               {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : null}
               {isSubmitting ? 'Creating...' : 'Create Project'}
             </button>
          </div>
        </form>

        {step === 2 && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-5 flex flex-col gap-6 overflow-y-auto scrollbar-hide">
              {/* Searching Papers Section */}
              <div className="space-y-4">
                 <h3 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                   <Sparkles size={16} className="text-indigo-400" /> Suggested Papers
                 </h3>
                 
                 {isSearchingPapers ? (
                   <div className="p-8 flex flex-col items-center justify-center text-zinc-400 bg-surface_container_low rounded-xl border border-[#161f33]">
                     <Loader2 size={24} className="animate-spin mb-2 text-indigo-400" />
                     <p className="text-sm">Searching OpenSearch for relevant papers...</p>
                   </div>
                 ) : suggestedPapers.length > 0 ? (
                   <div className="space-y-3">
                     {suggestedPapers.map(paper => {
                        const isAccepted = acceptedPaperIds.has(paper.id);
                        return (
                          <div key={paper.id} className={`p-4 rounded-xl border transition-colors ${isAccepted ? 'bg-primary/10 border-primary/30' : 'bg-surface_container_high border-[#161f33]'}`}>
                            <div className="flex justify-between items-start gap-4">
                              <div>
                                <h4 className="text-sm font-bold text-white leading-snug mb-1">{paper.title}</h4>
                                {paper.abstract && (
                                  <p className="text-xs text-zinc-400 line-clamp-2 mt-1.5">{paper.abstract}</p>
                                )}
                              </div>
                              <button 
                                type="button"
                                onClick={() => handleTogglePaper(paper.id)}
                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 border ${isAccepted ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' : 'bg-surface_container hover:bg-surface_container_highest border-zinc-700 text-zinc-300 hover:text-white'}`}
                              >
                                {isAccepted ? <CheckCircle2 size={14} /> : <FileUp size={14} />}
                                {isAccepted ? 'Added' : 'Add'}
                              </button>
                            </div>
                          </div>
                        )
                     })}
                   </div>
                 ) : (
                   <div className="p-4 text-center text-zinc-500 bg-surface_container_low rounded-xl text-sm border border-[#161f33]">
                     No suggested papers found based on your keywords.
                   </div>
                 )}
              </div>

              {/* Upload PDFs Section */}
              <div className="space-y-4 mt-2">
                 <h3 className="text-sm font-medium text-zinc-100 flex items-center gap-2">
                   <Upload size={16} className="text-indigo-400" /> Upload Local PDFs
                 </h3>
                 
                 <div className="relative group p-8 border-2 border-dashed border-[#161f33] rounded-xl flex flex-col items-center justify-center hover:border-indigo-500/50 hover:bg-surface_container_low transition-all">
                    <input 
                      type="file" 
                      accept="application/pdf" 
                      multiple 
                      onChange={handleFileUpload} 
                      disabled={isUploading}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10" 
                    />
                    {isUploading ? (
                      <>
                        <Loader2 size={32} className="animate-spin text-indigo-400 mb-3" />
                        <p className="text-sm text-zinc-300">Uploading documents...</p>
                      </>
                    ) : (
                      <>
                        <FileText size={32} className="text-zinc-500 mb-3 group-hover:text-indigo-400 transition-colors" />
                        <p className="text-sm text-white font-medium mb-1 group-hover:text-indigo-100 transition-colors">Click or drag PDF files here</p>
                        <p className="text-xs text-zinc-500">Maximum 50MB per file</p>
                      </>
                    )}
                 </div>

                 {uploadedDocs.length > 0 && (
                   <div className="pt-2">
                     <p className="text-xs font-medium text-zinc-400 mb-2">Uploaded Files:</p>
                     <div className="flex flex-col gap-2">
                       {uploadedDocs.map((doc, idx) => (
                         <div key={idx} className="flex items-center justify-between text-sm text-zinc-300 bg-surface_container_high p-3 rounded-xl border border-[#161f33] group">
                           <div className="flex items-center gap-3 overflow-hidden">
                             <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                             <span className="truncate max-w-full">{doc.original_filename || doc.title}</span>
                           </div>
                           <button 
                             type="button"
                             onClick={() => handleDeleteDocument(doc.id)} 
                             className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                             title="Remove document"
                           >
                             <Trash2 size={16} />
                           </button>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}
              </div>

            </div>

            <div className="p-5 border-t border-[#161f33] flex justify-end gap-3 flex-shrink-0 bg-surface_container rounded-b-2xl">
               <button
                 type="button"
                 disabled={isFinishing}
                 onClick={finishAndClose}
                 className="bg-primary-gradient text-white px-6 py-2.5 rounded-xl font-medium shadow-[0_4px_20px_-4px_rgba(167,165,255,0.4)] hover:shadow-[0_4px_24px_-4px_rgba(167,165,255,0.6)] transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
               >
                 {isFinishing ? <Loader2 size={18} className="animate-spin" /> : null}
                 {isFinishing ? 'Finishing...' : 'Finish & Open Project'}
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
