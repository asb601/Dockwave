import Link from "next/link";
import {
  FileText,
  ArrowRight,
  Sparkles,
  Brain,
  Search,
  Lock,
  Zap,
  MessageSquare,
  Calendar,
} from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: <Brain className="w-6 h-6" />,
    title: "AI-Powered Analysis",
    description:
      "Drop any PDF and get instant summaries, key insights, and structured data extraction.",
  },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: "Chat With Your Docs",
    description:
      "Ask questions in natural language. Get precise answers sourced directly from your files.",
  },
  {
    icon: <Search className="w-6 h-6" />,
    title: "Semantic Search",
    description:
      "Find information across hundreds of documents in milliseconds — not keywords, meaning.",
  },
  {
    icon: <Calendar className="w-6 h-6" />,
    title: "Calendar & Tasks",
    description:
      "Plan your work with built-in calendar events and task management tied to your projects.",
  },
  {
    icon: <Lock className="w-6 h-6" />,
    title: "Enterprise Security",
    description:
      "Your data stays private. End-to-end encryption with SOC 2 compliant infrastructure.",
  },
  {
    icon: <Zap className="w-6 h-6" />,
    title: "Lightning Fast",
    description:
      "Built on a vector database with graph RAG — answers come back in under a second.",
  },
] as const;

const STATS = [
  { value: "50K+", label: "Documents processed" },
  { value: "<1s", label: "Average response" },
  { value: "99.9%", label: "Uptime" },
  { value: "256-bit", label: "Encryption" },
] as const;

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  const targetHref = session ? "/home" : "/login";

  return (
    <div className="page-shell">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32 lg:pt-36 lg:pb-40">
        {/* Decorative blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[60rem] h-[60rem] rounded-full opacity-[0.07] bg-primary blur-3xl"
        />

        <div className="relative mx-auto max-w-4xl text-center">
          {/* Pill badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur sm:text-sm">
            <Sparkles className="w-3.5 h-3.5" />
            Powered by Graph RAG
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-6xl md:text-7xl lg:text-8xl">
            Your documents,{" "}
            <span className="relative">
              <span className="bg-gradient-to-r from-foreground via-muted-foreground to-foreground bg-clip-text text-transparent">
                supercharged
              </span>
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
            Upload, organise, and have real conversations with your files.
            Docwave turns static PDFs into a searchable, chat-ready knowledge
            base — in seconds.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              href={targetHref}
              className="btn btn-primary rounded-xl px-8 py-3.5 text-base font-semibold shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98] w-full sm:w-auto"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="#features"
              className="btn btn-outline rounded-xl px-8 py-3.5 text-base w-full sm:w-auto"
            >
              See How It Works
            </Link>
          </div>

          {/* Trust line */}
          <p className="mt-8 text-xs text-muted-foreground">
            No credit card required &bull; Free forever for personal use
          </p>
        </div>
      </section>

      {/* ── Stats ribbon ─────────────────────────────────────────────── */}
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-4 sm:px-6 sm:py-10">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                {value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                {label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-16 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold sm:text-4xl md:text-5xl">
              Everything you need.
              <br className="hidden sm:block" />{" "}
              Nothing you don&rsquo;t.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              A focused toolkit that makes working with documents feel
              effortless.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {FEATURES.map((item, i) => (
              <div
                key={i}
                className="group card card-padded transition-all hover:border-foreground/20 hover:-translate-y-0.5"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground">
                  {item.icon}
                </div>
                <h3 className="text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="border-y border-border bg-secondary/20 px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-14 text-center text-3xl font-extrabold sm:text-4xl md:text-5xl">
            Three steps. That&rsquo;s it.
          </h2>

          <div className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {[
              {
                step: "01",
                heading: "Upload",
                text: "Drag and drop your PDFs, docs, or create folders to organise them.",
              },
              {
                step: "02",
                heading: "Ask",
                text: "Chat naturally — Docwave reads your files and surfaces the answers.",
              },
              {
                step: "03",
                heading: "Act",
                text: "Get summaries, create tasks, and manage your calendar — all from one place.",
              },
            ].map(({ step, heading, text }) => (
              <div key={step} className="text-center sm:text-left">
                <span className="font-mono text-xs font-bold text-muted-foreground">
                  {step}
                </span>
                <h3 className="mt-2 text-2xl font-extrabold sm:text-3xl">
                  {heading}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="rounded-3xl border border-border bg-card p-8 sm:p-14">
            <h2 className="text-3xl font-extrabold sm:text-4xl md:text-5xl">
              Ready to work smarter?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              Stop scrolling through pages. Start asking questions and getting
              answers — instantly.
            </p>
            <Link
              href={targetHref}
              className="btn btn-primary mt-8 rounded-xl px-10 py-4 text-base font-semibold shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-10 sm:flex-row sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-secondary">
              <FileText className="w-4 h-4" />
            </div>
            <span className="font-display font-bold">Docwave</span>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
            {["Privacy", "Terms", "Contact"].map((label) => (
              <Link
                key={label}
                href="#"
                className="hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Docwave. Built with &hearts; and
          a lot of coffee.
        </div>
      </footer>
    </div>
  );
}
