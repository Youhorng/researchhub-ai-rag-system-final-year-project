import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/react'
import { Navigate } from 'react-router-dom'
import {
  Search,
  BookOpen,
  MessageSquare,
  FileText,
  Tag,
  BarChart2,
  ChevronRight,
  Menu,
  X,
  ArrowRight,
  Zap,
  Database,
  Brain,
} from 'lucide-react'

// ─── Scroll reveal hook ───────────────────────────────────────────────────────

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, visible }
}

// Base classes applied to every reveal wrapper
const REVEAL_BASE = 'transition-all duration-700 ease-out'
const HIDDEN      = 'opacity-0 translate-y-8'
const SHOWN       = 'opacity-100 translate-y-0'

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 border-b ${
        scrolled
          ? 'bg-[rgba(7,14,29,0.92)] backdrop-blur-md border-[#161f33]'
          : 'bg-transparent border-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          <img src="/main_logo.webp" alt="ResearchHub" className="w-8 h-8 object-contain drop-shadow-[0_0_12px_rgba(167,165,255,0.4)]" />
          <span className="text-white font-semibold text-lg font-display tracking-tight">ResearchHub</span>
        </a>

        <nav className="hidden md:flex items-center gap-3">
          <a href="#features" className="text-zinc-400 hover:text-on_surface text-sm transition-colors px-3 py-1.5">Features</a>
          <a href="#how-it-works" className="text-zinc-400 hover:text-on_surface text-sm transition-colors px-3 py-1.5">How it works</a>
          <a href="/sign-in" className="text-zinc-300 hover:text-white text-sm transition-colors px-4 py-2">Sign In</a>
          <a href="/sign-up" className="px-4 py-2 bg-primary-gradient text-white rounded-xl text-sm font-medium shadow-[0_0_16px_rgba(167,165,255,0.2)] hover:shadow-[0_0_24px_rgba(167,165,255,0.4)] transition-all">Get Started</a>
        </nav>

        <button className="md:hidden text-zinc-400 hover:text-white transition-colors" onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-surface_container_low border-t border-[#161f33] px-6 py-4 flex flex-col gap-3">
          <a href="#features" className="text-zinc-400 hover:text-on_surface text-sm py-2 transition-colors" onClick={() => setMobileOpen(false)}>Features</a>
          <a href="#how-it-works" className="text-zinc-400 hover:text-on_surface text-sm py-2 transition-colors" onClick={() => setMobileOpen(false)}>How it works</a>
          <a href="/sign-in" className="text-zinc-300 hover:text-white text-sm py-2 transition-colors">Sign In</a>
          <a href="/sign-up" className="px-4 py-2.5 bg-primary-gradient text-white rounded-xl text-sm font-medium text-center shadow-[0_0_16px_rgba(167,165,255,0.2)]">Get Started Free</a>
        </div>
      )}
    </header>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  // Hero animates in on mount (no scroll trigger needed)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 80); return () => clearTimeout(t) }, [])

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(167,165,255,0.12),transparent_65%)]" />
        <div className="absolute bottom-0 left-[-5%] w-[500px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(100,94,251,0.08),transparent_65%)]" />
        <div className="absolute bottom-0 right-[-5%] w-[500px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(167,165,255,0.06),transparent_65%)]" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto">
        {/* Badge */}
        <div className={`${REVEAL_BASE} ${mounted ? SHOWN : HIDDEN}`} style={{ transitionDelay: '0ms' }}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#212c43] bg-surface_container text-primary text-xs font-medium mb-8 shadow-[0_0_16px_rgba(167,165,255,0.1)]">
            <Zap size={12} className="fill-primary" />
            Powered by RAG · GPT-4o · OpenSearch
          </div>
        </div>

        {/* Headline */}
        <div className={`${REVEAL_BASE} ${mounted ? SHOWN : HIDDEN}`} style={{ transitionDelay: '100ms' }}>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold font-display text-white tracking-tight leading-[1.1] mb-6">
            Your AI Research{' '}
            <span className="bg-primary-gradient bg-clip-text text-transparent">Partner</span>
            ,{' '}
            <br className="hidden sm:block" />
            All in One Place
          </h1>
        </div>

        {/* Sub-headline */}
        <div className={`${REVEAL_BASE} ${mounted ? SHOWN : HIDDEN}`} style={{ transitionDelay: '200ms' }}>
          <p className="text-zinc-400 text-lg sm:text-xl max-w-2xl leading-relaxed mb-10">
            Discover papers from 700k+ arXiv articles, build a knowledge base for your projects,
            and chat with your research using AI — all grounded in real sources.
          </p>
        </div>

        {/* CTAs */}
        <div className={`${REVEAL_BASE} ${mounted ? SHOWN : HIDDEN}`} style={{ transitionDelay: '300ms' }}>
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <a href="/sign-up" className="flex items-center gap-2 px-7 py-3.5 bg-primary-gradient text-white rounded-xl font-semibold shadow-[0_0_24px_rgba(167,165,255,0.3)] hover:shadow-[0_0_36px_rgba(167,165,255,0.5)] transition-all text-base">
              Get Started Free <ArrowRight size={18} />
            </a>
            <a href="#how-it-works" className="flex items-center gap-2 px-7 py-3.5 bg-surface_container_high text-white hover:bg-surface_bright border border-[#212c43] rounded-xl font-medium transition-all text-base">
              See How It Works <ChevronRight size={18} className="text-zinc-500" />
            </a>
          </div>
        </div>

        {/* Hero visual */}
        <div className={`${REVEAL_BASE} ${mounted ? SHOWN : HIDDEN} mt-16 w-full`} style={{ transitionDelay: '450ms' }}>
          <div className="max-w-3xl mx-auto rounded-2xl border border-[#1b263b] bg-surface_container overflow-hidden shadow-[0_0_60px_rgba(167,165,255,0.08)]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#161f33] bg-surface_container_low">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-xs text-zinc-600 font-mono">researchhub.ai — AI Chat</span>
            </div>
            <div className="p-6 flex flex-col gap-4 text-left min-h-[260px]">
              <div className="flex justify-end">
                <div className="max-w-[70%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-primary-dim text-white text-sm leading-relaxed">
                  What are the key contributions of the attention mechanism in transformers?
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary-gradient flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(167,165,255,0.3)]">
                  <Brain size={14} className="text-white" />
                </div>
                <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-surface_container_high border border-[#1b263b] text-zinc-300 text-sm leading-relaxed">
                  The attention mechanism in "Attention Is All You Need" enables models to dynamically weight token relevance — removing the need for recurrence entirely.{' '}
                  <span className="text-primary font-medium">[Vaswani et al., 2017]</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-primary-gradient flex items-center justify-center flex-shrink-0 opacity-60">
                  <Brain size={14} className="text-white" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-surface_container_high border border-[#1b263b] flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  const { ref, visible } = useInView()
  const stats = [
    { icon: Database, value: '700k+', label: 'Papers Indexed' },
    { icon: Search,   value: 'Hybrid', label: 'BM25 + KNN Search' },
    { icon: Zap,      value: 'Instant', label: 'RAG Answers' },
  ]

  return (
    <section className="border-y border-[#161f33] bg-surface_container_low py-10">
      <div ref={ref} className="max-w-4xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
        {stats.map(({ icon: Icon, value, label }, i) => (
          <div
            key={label}
            className={`${REVEAL_BASE} flex flex-col items-center gap-2 ${visible ? SHOWN : HIDDEN}`}
            style={{ transitionDelay: `${i * 100}ms` }}
          >
            <div className="w-10 h-10 rounded-xl bg-surface_container_high border border-[#1b263b] flex items-center justify-center mb-1 shadow-[0_0_12px_rgba(167,165,255,0.08)]">
              <Icon size={18} className="text-primary" />
            </div>
            <span className="text-3xl font-bold text-white font-display">{value}</span>
            <span className="text-zinc-500 text-sm">{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Feature Grid ─────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Search,       title: 'AI Paper Discovery',       description: 'Search 700k+ arXiv papers with hybrid BM25 + vector search. Find exactly what you need — fast.' },
  { icon: BookOpen,     title: 'Project Knowledge Bases',  description: 'Accept papers and upload your own PDFs to per-project knowledge bases. Keep everything organised.' },
  { icon: MessageSquare,title: 'RAG-Powered Chat',         description: 'Ask questions in natural language and get answers grounded in your papers — with source citations.' },
  { icon: FileText,     title: 'Smart Summaries',          description: "Auto-generated paper summaries and keyword extractions so you can quickly decide what's worth reading." },
  { icon: Tag,          title: 'Research Topics',          description: 'Organise your knowledge base with custom topics and filter papers by category or keyword.' },
  { icon: BarChart2,    title: 'Activity & Analytics',     description: 'Track your reading sessions, paper activity, and research progress over time with built-in dashboards.' },
]

function FeatureGrid() {
  const headerRef = useInView()
  const gridRef   = useInView(0.05)

  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div ref={headerRef.ref} className={`${REVEAL_BASE} text-center mb-16 ${headerRef.visible ? SHOWN : HIDDEN}`}>
          <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">Features</p>
          <h2 className="text-4xl sm:text-5xl font-bold font-display text-white tracking-tight">
            Everything you need to do<br className="hidden sm:block" /> serious research
          </h2>
          <p className="text-zinc-400 mt-4 max-w-xl mx-auto text-lg">
            ResearchHub brings together AI-powered discovery, intelligent organisation, and grounded conversation in one platform.
          </p>
        </div>

        {/* Cards */}
        <div ref={gridRef.ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, description }, i) => (
            <div
              key={title}
              className={`${REVEAL_BASE} group p-6 rounded-2xl bg-surface_container border border-[#161f33] hover:border-[#212c43] hover:bg-surface_container_high hover:shadow-[0_0_24px_rgba(167,165,255,0.06)] ${gridRef.visible ? SHOWN : HIDDEN}`}
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <div className="w-11 h-11 rounded-xl bg-surface_container_high border border-[#1b263b] flex items-center justify-center mb-4 group-hover:shadow-[0_0_16px_rgba(167,165,255,0.15)] transition-all">
                <Icon size={20} className="text-primary" />
              </div>
              <h3 className="text-white font-semibold text-base mb-2">{title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const STEPS = [
  { number: '01', icon: Search,        title: 'Discover Papers',          description: 'Search over 700k+ arXiv papers using AI-powered hybrid search. Filter by topic, date, or relevance.' },
  { number: '02', icon: BookOpen,      title: 'Build Your Knowledge Base', description: 'Accept papers into your project and upload your own PDFs. ResearchHub chunks and indexes everything for you.' },
  { number: '03', icon: MessageSquare, title: 'Chat with Your Research',   description: 'Ask questions in plain language. Get answers grounded in your knowledge base — with citations you can verify.' },
]

function HowItWorks() {
  const headerRef = useInView()
  const stepsRef  = useInView(0.1)

  return (
    <section id="how-it-works" className="py-24 px-6 bg-surface_container_low border-y border-[#161f33]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div ref={headerRef.ref} className={`${REVEAL_BASE} text-center mb-16 ${headerRef.visible ? SHOWN : HIDDEN}`}>
          <p className="text-primary text-sm font-semibold uppercase tracking-widest mb-3">How It Works</p>
          <h2 className="text-4xl sm:text-5xl font-bold font-display text-white tracking-tight">
            From discovery to insight<br className="hidden sm:block" /> in three steps
          </h2>
        </div>

        {/* Steps */}
        <div ref={stepsRef.ref} className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-8 left-[calc(16.67%+1.5rem)] right-[calc(16.67%+1.5rem)] h-px bg-gradient-to-r from-transparent via-[#212c43] to-transparent" />
          {STEPS.map(({ number, icon: Icon, title, description }, i) => (
            <div
              key={number}
              className={`${REVEAL_BASE} flex flex-col items-center text-center relative ${stepsRef.visible ? SHOWN : HIDDEN}`}
              style={{ transitionDelay: `${i * 120}ms` }}
            >
              <div className="w-16 h-16 rounded-2xl bg-surface_container border border-[#1b263b] flex items-center justify-center mb-6 shadow-[0_0_24px_rgba(167,165,255,0.08)] relative z-10">
                <Icon size={24} className="text-primary" />
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary-gradient text-white text-[10px] font-bold flex items-center justify-center">
                  {number.slice(1)}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
              <p className="text-zinc-500 text-sm leading-relaxed max-w-xs">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function CTABanner() {
  const { ref, visible } = useInView()

  return (
    <section className="py-28 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[radial-gradient(ellipse_at_center,rgba(167,165,255,0.1),transparent_65%)]" />
      </div>
      <div ref={ref} className={`${REVEAL_BASE} relative z-10 max-w-3xl mx-auto text-center ${visible ? SHOWN : HIDDEN}`}>
        <h2 className="text-4xl sm:text-5xl font-bold font-display text-white tracking-tight mb-5">
          Start your research journey today
        </h2>
        <p className="text-zinc-400 text-lg mb-10 max-w-xl mx-auto">
          Join researchers who use ResearchHub AI to find, understand, and discuss academic papers faster than ever.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="/sign-up" className="flex items-center justify-center gap-2 px-8 py-4 bg-primary-gradient text-white rounded-xl font-semibold shadow-[0_0_24px_rgba(167,165,255,0.3)] hover:shadow-[0_0_40px_rgba(167,165,255,0.5)] transition-all text-base">
            Get Started Free <ArrowRight size={18} />
          </a>
          <a href="/sign-in" className="flex items-center justify-center gap-2 px-8 py-4 bg-surface_container_high text-white hover:bg-surface_bright border border-[#212c43] rounded-xl font-medium transition-all text-base">
            Sign In
          </a>
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-[#161f33] bg-surface_container_low py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <img src="/main_logo.webp" alt="ResearchHub" className="w-6 h-6 object-contain opacity-80" />
          <span className="text-zinc-500 text-sm font-medium">ResearchHub AI</span>
          <span className="text-zinc-700 text-sm">· © {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="/sign-in" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">Sign In</a>
          <a href="/sign-up" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">Sign Up</a>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { isSignedIn } = useAuth()

  if (isSignedIn) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen bg-surface text-on_surface font-sans">
      <Navbar />
      <Hero />
      <StatsBar />
      <FeatureGrid />
      <HowItWorks />
      <CTABanner />
      <Footer />
    </div>
  )
}
