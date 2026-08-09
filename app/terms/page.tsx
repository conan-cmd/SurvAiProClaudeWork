import Link from "next/link"

export const metadata = {
  title: "Terms of Service — SurvAIPro",
  description: "The terms governing use of SurvAIPro.",
}

// Public page for the Pipedrive Marketplace submission + app footers. Starter
// terms — have them reviewed by a solicitor and complete the [bracketed] details.
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-gray-800">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <Link href="/" className="text-sm text-brand-blue hover:underline">← SurvAIPro</Link>
        <h1 className="text-3xl font-bold text-brand-navy mt-4 mb-1">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 9 August 2026</p>

        <div className="prose prose-sm max-w-none space-y-6 leading-relaxed">
          <section>
            <p>
              These Terms govern your use of SurvAIPro (the &quot;Service&quot;), provided by
              <strong> [LBC Clean Ltd]</strong> (&quot;we&quot;, &quot;us&quot;). By creating an account or
              using the Service you agree to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">1. The Service</h2>
            <p>
              SurvAIPro lets trade firms create site surveys, generate proposals (with AI
              assistance), send them, take e-signatures and deposits, produce RAMS, and — where
              connected — sync data to third-party tools such as Pipedrive.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">2. Accounts</h2>
            <p>
              You are responsible for your account, keeping your credentials secure, and for all
              activity under your organisation. You must provide accurate information and be
              authorised to act for your organisation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">3. Your content &amp; customers</h2>
            <p>
              You retain ownership of the data you put into the Service (surveys, photos,
              proposals, client details). You grant us a licence to host and process it to
              provide the Service. You are responsible for having a lawful basis to process your
              customers&apos; data and for the accuracy of proposals, pricing and any RAMS you send.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">4. AI-generated content</h2>
            <p>
              Proposal drafts, RAMS and other AI outputs are drafting aids only. You must review
              and approve all content before sending it or relying on it. We do not warrant that
              AI output is accurate, complete or fit for purpose, and RAMS are not a substitute
              for your own competent risk assessment.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">5. Integrations</h2>
            <p>
              When you connect a third-party service (e.g. Pipedrive), you authorise us to
              exchange data with it on your behalf. Your use of that service is governed by its
              own terms. We are not responsible for third-party services and may change or remove
              an integration.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">6. Fees</h2>
            <p>
              Paid plans are billed as described at sign-up. Deposits collected from your clients
              are processed by our payment providers and paid to your connected account, subject
              to any stated platform fee. Fees are non-refundable except as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">7. Acceptable use</h2>
            <p>
              You must not misuse the Service, break the law, infringe others&apos; rights, send spam,
              or attempt to disrupt or gain unauthorised access to the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">8. Availability &amp; liability</h2>
            <p>
              The Service is provided &quot;as is&quot;. To the maximum extent permitted by law we exclude
              implied warranties and are not liable for indirect or consequential loss; our total
              liability is limited to the fees you paid in the 12 months before the claim. Nothing
              excludes liability that cannot be excluded by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">9. Termination</h2>
            <p>
              You may cancel at any time. We may suspend or terminate access for breach of these
              Terms. On termination your right to use the Service ends; we handle your data as set
              out in our <Link href="/privacy" className="text-brand-blue hover:underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">10. Governing law &amp; contact</h2>
            <p>
              These Terms are governed by the laws of England and Wales. Questions:
              <strong> [support@lbcclean.co.uk]</strong>.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
