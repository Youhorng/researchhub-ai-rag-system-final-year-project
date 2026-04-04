import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Calendar, Hash, BookOpen } from 'lucide-react';

interface PaperDetail {
  paper_id: string;
  arxiv_id: string;
  title: string;
  abstract: string;
  categories: string[];
  published_at: string;
}

export default function PaperDetailPage() {
  const { arxivId } = useParams<{ arxivId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Paper data is passed via navigate state from ExplorePage — no re-fetch needed
  const paper: PaperDetail | undefined = location.state?.paper;
  const normalizedArxivId = (arxivId ?? '').replace('_', '/');

  useEffect(() => {
    document.title = paper ? `${paper.title} | ResearchHub` : 'Paper | ResearchHub';
  }, [paper]);

  if (!paper) {
    return (
      <div className="min-h-full font-sans pb-12 max-w-4xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors mb-8 group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Explore
        </button>
        <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 text-sm text-center">
          Paper data not available. Please go back and click <strong>View Details</strong> from a search result.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full font-sans pb-12 max-w-4xl mx-auto">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors mb-8 group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        Back to Explore
      </button>

      {/* Header Card */}
      <div className="bg-surface_container border border-[#161f33] rounded-2xl p-8 mb-6 shadow-sm">
        {/* Category Tags */}
        <div className="flex flex-wrap gap-2 mb-5">
          {paper.categories.map(cat => (
            <span
              key={cat}
              className="px-2.5 py-1 rounded text-xs font-bold tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
            >
              {cat}
            </span>
          ))}
        </div>

        <h1 className="text-2xl font-bold text-white leading-tight mb-4 tracking-tight">
          {paper.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400 mb-6">
          <span className="flex items-center gap-1.5">
            <Calendar size={14} />
            {new Date(paper.published_at).toLocaleDateString(undefined, {
              year: 'numeric', month: 'long', day: 'numeric'
            })}
          </span>
          <span className="flex items-center gap-1.5">
            <Hash size={14} />
            arXiv: {normalizedArxivId}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <a
            href={`https://arxiv.org/abs/${normalizedArxivId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-surface_container_high hover:bg-surface_container_highest border border-[#161f33] text-white rounded-xl text-sm font-medium transition-all hover:border-[#212c43] shadow-sm"
          >
            <ExternalLink size={16} />
            View on arXiv
          </a>
          <a
            href={`https://arxiv.org/pdf/${normalizedArxivId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 rounded-xl text-sm font-medium transition-all shadow-sm"
          >
            <FileText size={16} />
            Download PDF
          </a>
          <a
            href={`https://arxiv.org/html/${normalizedArxivId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 rounded-xl text-sm font-medium transition-all shadow-sm"
          >
            <BookOpen size={16} />
            Read HTML
          </a>
        </div>
      </div>

      {/* Abstract Card */}
      <div className="bg-surface_container border border-[#161f33] rounded-2xl p-8 shadow-sm">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Abstract</p>
        <p className="text-zinc-200 text-[15px] leading-[1.8] whitespace-pre-line">
          {paper.abstract}
        </p>
      </div>
    </div>
  );
}
