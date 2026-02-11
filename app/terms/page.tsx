import type { Metadata } from 'next';
import { LegalLayout } from '@/components/layout/legal-layout';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules of engagement for using sideby.me.',
};

export default function TermsOfServicePage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="February 11, 2026">
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using sideby.me (the &quot;Website&quot;), the Sideby Pass browser extension (the
          &quot;Extension&quot;), or any related services (collectively, the &quot;Service&quot;), you agree to be bound
          by these Terms of Service (&quot;Terms&quot;). If you do not agree, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. Eligibility</h2>
        <p>
          You must be at least 13 years old (or the minimum age of digital consent in your jurisdiction) to use the
          Service. By using sideby.me or installing Sideby Pass, you represent and warrant that you meet this age
          requirement. If you are under the required age, you may not use the Service.
        </p>
      </section>

      <section>
        <h2>3. Description of Service</h2>
        <p>
          sideby.me provides a free, real-time video synchronization platform that allows users to create rooms and
          watch video content together. The Sideby Pass extension assists users in detecting video URLs on web pages for
          use with the platform.
        </p>
        <p>
          The Service does not host, store, or distribute any video content. Users are responsible for the URLs they
          share.
        </p>
      </section>

      <section>
        <h2>4. User Conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>
            Use the Service to share, stream, or facilitate access to content that infringes on third-party copyrights
            or intellectual property rights.
          </li>
          <li>
            Use the Service to distribute illegal, harmful, threatening, abusive, or otherwise objectionable content.
          </li>
          <li>Attempt to reverse-engineer, decompile, or disassemble the Service or its infrastructure.</li>
          <li>Interfere with or disrupt the Service, servers, or networks connected to the Service.</li>
          <li>Use automated scripts, bots, or crawlers to access the Service in a way that exceeds reasonable use.</li>
          <li>Impersonate any person or entity while using the Service.</li>
        </ul>
      </section>

      <section>
        <h2>5. Content &amp; Copyright</h2>
        <p>
          sideby.me acts as a synchronization tool only. We do not host video files. All video content is served
          directly from third-party sources to your browser. You acknowledge that:
        </p>
        <ul>
          <li>
            You are solely responsible for ensuring you have the right to access and share any video URL you use with
            the Service.
          </li>
          <li>
            We reserve the right to remove, block, or restrict access to rooms or content that we believe, in good
            faith, violates these Terms or applicable laws.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. DMCA &amp; Takedown Requests</h2>
        <p>
          If you are a copyright holder and believe that content accessible through the Service infringes your rights,
          please contact us at{' '}
          <a
            href="mailto:hello@sideby.me"
            className="text-foreground underline underline-offset-4 hover:text-primary-700"
          >
            hello@sideby.me
          </a>{' '}
          with:
        </p>
        <ol className="flex flex-col gap-1">
          <li>A description of the copyrighted work.</li>
          <li>The URL or identifier of the infringing content.</li>
          <li>Your contact information.</li>
          <li>A statement that you have a good faith belief that the use is not authorized by the copyright owner.</li>
          <li>A statement, under penalty of perjury, that the information is accurate.</li>
        </ol>
      </section>

      <section>
        <h2>7. Sideby Pass Extension</h2>
        <p>By installing and using the Sideby Pass browser extension, you additionally agree that:</p>
        <ul>
          <li>
            The extension monitors network requests and scans page content locally on your device to detect video URLs.
            This is necessary for the extension&apos;s core functionality.
          </li>
          <li>
            The extension requires broad host permissions (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">&lt;all_urls&gt;</code>) because it is designed to
            work on any website.
          </li>
          <li>
            Video URLs are only transmitted to sideby.me when you explicitly choose to create a room or use the context
            menu.
          </li>
          <li>You may uninstall the extension at any time through your browser&apos;s extension management page.</li>
        </ul>
      </section>

      <section>
        <h2>8. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either
          express or implied, including but not limited to implied warranties of merchantability, fitness for a
          particular purpose, or non-infringement.
        </p>
        <p>We do not guarantee that:</p>
        <ul>
          <li>The Service will be uninterrupted, error-free, or secure.</li>
          <li>Any particular video URL will be playable or compatible with the Service.</li>
          <li>Synchronization will be perfectly accurate across all network conditions.</li>
        </ul>
      </section>

      <section>
        <h2>9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by applicable law, sideby.me and its operators shall not be liable for any
          indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether
          incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses, resulting
          from:
        </p>
        <ul>
          <li>Your use of or inability to use the Service.</li>
          <li>Any content shared or streamed through the Service.</li>
          <li>Unauthorized access to or alteration of your transmissions or data.</li>
        </ul>
      </section>

      <section>
        <h2>10. Modifications</h2>
        <p>
          We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting.
          Your continued use of the Service after modifications constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section>
        <h2>11. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of India, without regard to
          conflict of law principles. Any disputes arising from these Terms or the Service shall first be resolved
          through good-faith negotiation. If negotiation fails, disputes shall be subject to the exclusive jurisdiction
          of the courts located in India.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>
          For questions about these Terms, contact us at{' '}
          <a
            href="mailto:hello@sideby.me"
            className="text-foreground underline underline-offset-4 hover:text-primary-700"
          >
            hello@sideby.me
          </a>
          .
        </p>
      </section>
    </LegalLayout>
  );
}
