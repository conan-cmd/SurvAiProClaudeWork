import Link from "next/link"

export const metadata = {
  title: "Privacy Policy — SurvAIPro",
  description: "How SurvAIPro collects, uses and protects your data.",
}

// Public page (outside the authed app) so it has a stable URL for the Pipedrive
// Marketplace submission and app footers. Starter policy — have it reviewed by a
// solicitor and fill in the [bracketed] company details before publishing.
export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-gray-800">
      <div className="max-w-3xl mx-auto px-5 py-12">
        <Link href="/" className="text-sm text-brand-blue hover:underline">← SurvAIPro</Link>
        <h1 className="text-3xl font-bold text-brand-navy mt-4 mb-1">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 9 August 2026</p>

        <div className="prose prose-sm max-w-none space-y-6 leading-relaxed">
          <section>
            <p>
              This Privacy Policy explains how <strong>[LBC Clean Ltd]</strong> (&quot;SurvAIPro&quot;, &quot;we&quot;,
              &quot;us&quot;) collects, uses and protects personal data when you use the SurvAIPro
              application and website (the &quot;Service&quot;). We are the data controller for the
              personal data described here. Contact: <strong>[privacy@lbcclean.co.uk]</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">1. Who we are</h2>
            <p>
              SurvAIPro is software for exterior-cleaning and trade firms that turns a site
              survey into a client proposal, e-signature and deposit. Registered office:
              <strong> [company address]</strong>. Company number: <strong>[company number]</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">2. Data we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account data:</strong> name, email, password (hashed), organisation details, branding.</li>
              <li><strong>Customer &amp; job data you enter:</strong> your clients&apos; names, contact details, site addresses, survey notes, photos, voice notes, measurements, pricing and proposals.</li>
              <li><strong>Usage data:</strong> log-ins, activity, and product analytics to run and improve the Service.</li>
              <li><strong>Payment data:</strong> subscription and deposit payments are processed by our payment providers; we do not store full card details.</li>
              <li><strong>Integration data:</strong> where you connect a third-party service (e.g. Pipedrive, Gmail), we store the access tokens needed to sync, encrypted at rest.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">3. How we use it</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide the Service — create surveys, generate and send proposals, take e-signatures and deposits.</li>
              <li>To sync data to integrations you connect (e.g. create/update deals and contacts in your Pipedrive account at your instruction).</li>
              <li>To send transactional emails, product notices and — where permitted — service updates.</li>
              <li>To secure, maintain, support and improve the Service.</li>
            </ul>
            <p>
              Our lawful bases are performance of a contract, our legitimate interests in
              operating and improving the Service, and consent where required.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">4. Third-party processors</h2>
            <p>We share data only with processors that help us run the Service, including:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Hosting &amp; database</strong> (Vercel, Neon)</li>
              <li><strong>AI drafting &amp; transcription</strong> (OpenAI) — survey notes/voice you submit for drafting</li>
              <li><strong>Email</strong> (Resend)</li>
              <li><strong>Payments</strong> (Stripe; Coinbase Commerce for crypto)</li>
              <li><strong>Maps &amp; imagery</strong> (Google)</li>
              <li><strong>CRM &amp; marketing, where you connect them</strong> (Pipedrive, GoHighLevel)</li>
            </ul>
            <p>Each processor handles data under its own terms and only as needed to provide its function.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">5. Pipedrive integration</h2>
            <p>
              If you connect Pipedrive, we use your authorisation to create and update
              organisations, people, deals and notes in <em>your</em> Pipedrive account, and to
              read your contacts when you choose to import one. We store your Pipedrive access
              and refresh tokens encrypted, and use them only to perform these actions. You can
              disconnect at any time in Settings, or by uninstalling the app in Pipedrive — on
              uninstall we delete the stored tokens.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">6. Retention</h2>
            <p>
              We keep your data for as long as your account is active and as needed to provide
              the Service, then delete or anonymise it within a reasonable period, unless we must
              keep it to meet legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">7. Your rights</h2>
            <p>
              Subject to UK GDPR, you may request access to, correction or deletion of your
              personal data, object to or restrict processing, and request portability. Contact
              <strong> [privacy@lbcclean.co.uk]</strong>. You may also complain to the ICO
              (ico.org.uk).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">8. Security</h2>
            <p>
              We use encryption in transit, hashed passwords, and encryption at rest for
              sensitive tokens. No system is perfectly secure, but we take reasonable measures to
              protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-brand-navy">9. Changes &amp; contact</h2>
            <p>
              We may update this policy and will change the date above. Questions or requests:
              <strong> [privacy@lbcclean.co.uk]</strong>.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
