// app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, Sparkles } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  const targetHref = session ? "/home" : "/login";

  return (
    <div className="min-h-dvh bg-[color:var(--background)] text-[color:var(--foreground)]">
     
      {/* Hero Section */}
      <section className="pt-16 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-[color:var(--secondary)] border border-[color:var(--border)] mb-8">
            <Sparkles className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Powered by Advanced AI</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6">IntelliDoc AI</h1>
          <p className="text-xl md:text-2xl text-[color:var(--muted-foreground)] mb-10 max-w-3xl mx-auto leading-relaxed">
            Store documents, organize folders, and chat with your data using
            cutting-edge AI technology.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              asChild
              size="lg"
              className="bg-[color:var(--primary)] text-[color:var(--primary-foreground)] px-8 py-4 text-lg font-semibold hover:opacity-90"
            >
              <Link href={targetHref}>
                <span className="inline-flex items-center">
                  Start Free Trial{" "}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </span>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-[color:var(--border)] text-[color:var(--foreground)] px-8 py-4 text-lg"
            >
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              Everything you need for document intelligence
            </h2>
            <p className="text-[color:var(--muted-foreground)] text-lg max-w-2xl mx-auto">
              Transform how you work with documents using powerful AI-driven
              features
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "AI Analysis",
                description:
                  "Extract summaries and insights from any document instantly.",
              },
              {
                title: "Smart Search",
                description:
                  "Find info across all your files in milliseconds.",
              },
              {
                title: "Collaboration",
                description:
                  "Share documents and work as a team effortlessly.",
              },
              {
                title: "Secure Storage",
                description:
                  "Your files stay private with enterprise security.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="p-6 border border-[var(--border)] rounded-lg"
              >
                <h3 className="font-semibold text-xl mb-2">
                  {item.title}
                </h3>
                <p className="text-[var(--muted-foreground)] leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-10 rounded-3xl bg-[color:var(--secondary)] border border-[color:var(--border)]">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to transform your workflow?
            </h2>
            <p className="text-xl text-[color:var(--muted-foreground)] mb-8 max-w-2xl mx-auto">
              Join thousands of professionals who trust IntelliDoc AI to
              revolutionize how they work with documents.
            </p>
            <Button size="lg" className="bg-[color:var(--primary)] text-[color:var(--primary-foreground)] px-10 py-4 text-lg font-semibold hover:opacity-90">
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <p className="text-sm text-[color:var(--muted-foreground)] mt-6">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[color:var(--border)] bg-[color:var(--card)]">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-6 md:mb-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center border border-[color:var(--border)] bg-[color:var(--secondary)]">
                <FileText className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg">IntelliDoc AI</span>
            </div>
            <div className="flex space-x-8">
              <Link
                href="#"
                className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                href="#"
                className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors"
              >
                Terms of Service
              </Link>
              <Link
                href="#"
                className="text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)] transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>
          <div className="text-center mt-8 pt-8 border-t border-[color:var(--border)]">
            <p className="text-[color:var(--muted-foreground)]">
              Simple, fast, and private. © 2025 IntelliDoc AI. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
