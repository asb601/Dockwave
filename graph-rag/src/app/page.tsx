// app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight, Brain, Search, Users, Shield, Sparkles } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = 'force-dynamic';

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  const targetHref = session ? "/home" : "/login";
  const pageName= session?"Home":"Login";

  return (
    <div className="min-h-screen bg-gray-950 text-white relative overflow-hidden">
      {/* Subtle background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/20 via-gray-800/10 to-gray-950" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.06),transparent_70%)]" />
      
      {/* Navigation */}
      <nav className="relative z-10 backdrop-blur-xl border-b border-gray-800/50 bg-gray-950/80">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg shadow-black/20">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                IntelliDoc AI
              </span>
            </div>
            
            {/* Single Home button */}
            <div className="flex items-center">
              <Button asChild className="bg-gray-800 hover:bg-gray-700 text-white shadow-lg shadow-black/20 transition-all duration-200">
                <Link href={targetHref}>{pageName}</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-24 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Floating badge */}
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-500/20 mb-8 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-blue-400 mr-2" />
            <span className="text-sm text-gray-300 font-medium">Powered by Advanced AI</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-8 bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent leading-tight">
            IntelliDoc AI
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-3xl mx-auto leading-relaxed">
            Store documents, organize folders, and chat with your data using cutting-edge AI technology.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button asChild size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-4 text-lg font-semibold shadow-xl shadow-blue-500/25 transition-all duration-200 transform hover:scale-105">
              <Link href={targetHref}>
                <span className="inline-flex items-center">Start Free Trial <ArrowRight className="w-5 h-5 ml-2" /></span>
              </Link>
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white px-8 py-4 text-lg backdrop-blur-sm transition-all duration-200"
            >
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Everything you need for document intelligence
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Transform how you work with documents using powerful AI-driven features
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Brain className="w-7 h-7" />,
                title: "AI Analysis",
                description: "Extract insights, summaries, and key information from any document automatically",
                gradient: "from-blue-500 to-cyan-500"
              },
              {
                icon: <Search className="w-7 h-7" />,
                title: "Smart Search",
                description: "Find information across all your documents instantly with semantic search",
                gradient: "from-purple-500 to-pink-500"
              },
              {
                icon: <Users className="w-7 h-7" />,
                title: "Collaboration",
                description: "Share knowledge and work together on documents in real-time",
                gradient: "from-green-500 to-emerald-500"
              },
              {
                icon: <Shield className="w-7 h-7" />,
                title: "Enterprise Security",
                description: "Bank-level encryption and privacy protection for your sensitive data",
                gradient: "from-orange-500 to-red-500"
              }
            ].map((feature, index) => (
              <div 
                key={index}
                className="group p-8 rounded-2xl bg-gradient-to-b from-gray-800/50 to-gray-900/50 border border-gray-700/50 backdrop-blur-sm hover:border-gray-600/50 transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-r ${feature.gradient} flex items-center justify-center mb-6 group-hover:shadow-lg transition-all duration-300`}>
                  <div className="text-white">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="font-bold text-xl mb-3 text-white group-hover:text-gray-100 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="relative z-10 py-20 px-6 bg-gradient-to-r from-gray-900/50 to-gray-800/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-16 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            Built for everyone
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Students & Researchers",
                description: "Organize research papers, manage citations, and extract key insights for academic projects",
                icon: "🎓"
              },
              {
                title: "Business Professionals", 
                description: "Analyze contracts, reports, and business documents with AI-powered insights and summaries",
                icon: "💼"
              },
              {
                title: "Creative Teams",
                description: "Collaborate on documents, share knowledge, and streamline creative workflows",
                icon: "🚀"
              }
            ].map((useCase, index) => (
              <div 
                key={index} 
                className="text-center p-8 rounded-2xl bg-gradient-to-b from-gray-800/30 to-gray-900/30 border border-gray-700/30 backdrop-blur-sm hover:border-gray-600/50 transition-all duration-300 transform hover:scale-105"
              >
                <div className="text-4xl mb-4">{useCase.icon}</div>
                <h3 className="font-bold text-xl mb-4 text-white">{useCase.title}</h3>
                <p className="text-gray-400 leading-relaxed">
                  {useCase.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-r from-blue-900/20 via-purple-900/20 to-blue-900/20 border border-blue-500/20 backdrop-blur-sm">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Ready to transform your workflow?
            </h2>
            <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
              Join thousands of professionals who trust IntelliDoc AI to revolutionize how they work with documents.
            </p>
            
            <Button 
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-10 py-4 text-lg font-semibold shadow-xl shadow-blue-500/25 transition-all duration-200 transform hover:scale-105"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <p className="text-sm text-gray-500 mt-6">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800/50 bg-gray-950/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-3 mb-6 md:mb-0">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                IntelliDoc AI
              </span>
            </div>
            
            <div className="flex space-x-8">
              <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                Privacy Policy
              </Link>
              <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                Terms of Service
              </Link>
              <Link href="#" className="text-gray-400 hover:text-white transition-colors">
                Contact Us
              </Link>
            </div>
          </div>
          
          <div className="text-center mt-8 pt-8 border-t border-gray-800/50">
            <p className="text-gray-500">
              Simple, fast, and private. © 2025 IntelliDoc AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}