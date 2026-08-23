import Link from "next/link"
import { CheckCircle2, ArrowRight, Zap, Shield, Smartphone } from "lucide-react"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-navy via-blue-50 to-white">
      {/* Navigation */}
      <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-brand-navy">SurvAI</div>
        <Link
          href="/auth/login"
          className="px-6 py-2 bg-brand-blue text-white rounded-lg font-medium hover:bg-blue-700 transition"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-brand-navy mb-6">
          From Survey to Proposal in Seconds
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Turn your site survey photos, written notes, and voice recordings into polished,
          branded proposals. No templates. No copying. No waiting.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link
            href="/auth/signup"
            className="px-8 py-3 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition inline-flex items-center justify-center gap-2"
          >
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="#features"
            className="px-8 py-3 border-2 border-brand-navy text-brand-navy rounded-lg font-semibold hover:bg-brand-navy hover:text-white transition"
          >
            Learn More
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-brand-navy text-center mb-12">
          Built for Service Businesses
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition">
            <Smartphone className="w-12 h-12 text-brand-green mb-4" />
            <h3 className="text-xl font-semibold text-brand-navy mb-3">Mobile-First</h3>
            <p className="text-gray-600">
              Capture surveys on your phone. Upload photos and voice notes directly from site.
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition">
            <Zap className="w-12 h-12 text-brand-green mb-4" />
            <h3 className="text-xl font-semibold text-brand-navy mb-3">Instant Proposals</h3>
            <p className="text-gray-600">
              AI generates professional proposals from your survey data in seconds, not hours.
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition">
            <Shield className="w-12 h-12 text-brand-green mb-4" />
            <h3 className="text-xl font-semibold text-brand-navy mb-3">Your Branding</h3>
            <p className="text-gray-600">
              Every proposal is branded with your logo, colors, and messaging. Professional every time.
            </p>
          </div>
        </div>

        <div className="mt-12 bg-white p-8 md:p-12 rounded-xl shadow-sm">
          <h3 className="text-2xl font-bold text-brand-navy mb-6">The SurvAIPro Workflow</h3>
          <div className="space-y-4">
            {[
              "1. Add your company branding and details",
              "2. Create a new site survey",
              "3. Upload photos and add notes",
              "4. Record or upload a voice note",
              "5. AI transcribes and approves",
              "6. Choose a proposal template",
              "7. AI generates your first draft",
              "8. Review and edit as needed",
              "9. Add pricing and final details",
              "10. Export PDF or share securely",
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand-green flex-shrink-0" />
                <span className="text-gray-700">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-navy text-white py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to save hours on proposals?</h2>
          <p className="text-lg opacity-90 mb-8">
            Get your first proposal generated in under 2 minutes.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block px-8 py-3 bg-brand-green text-brand-navy font-semibold rounded-lg hover:bg-green-600 transition"
          >
            Start Free Today
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 py-8 px-6 border-t">
        <div className="max-w-6xl mx-auto text-center text-gray-600 space-y-2">
          <div className="flex items-center justify-center gap-4 text-sm">
            <Link href="/privacy" className="hover:text-brand-blue hover:underline">Privacy Policy</Link>
            <span className="text-gray-300">·</span>
            <Link href="/terms" className="hover:text-brand-blue hover:underline">Terms of Service</Link>
          </div>
          <p>&copy; {new Date().getFullYear()} SurvAIPro. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
