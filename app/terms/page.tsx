import type { Metadata } from 'next';
import { LegalLayout } from '@/components/layout/legal-layout';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules of engagement for using sideby.me.',
};

export default function TermsOfServicePage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="May 6, 2026">
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
          watch video content together. The Service consists of several components:
        </p>
        <ul>
          <li>
            <strong>Watch app (watch.sideby.me)</strong> - the browser-based interface for creating and joining watch
            rooms.
          </li>
          <li>
            <strong>Sync server (sync.sideby.me)</strong> - a real-time backend that manages room state, synchronizes
            playback, relays chat, and handles WebRTC signaling for peer-to-peer voice and video.
          </li>
          <li>
            <strong>Video proxy (pipe.sideby.me)</strong> - a Cloudflare Worker that proxies video streams where CORS
            policies or authentication headers require it. Proxied segments may be transiently cached for up to 1 hour.
          </li>
          <li>
            <strong>Lens capture service (lens.sideby.me)</strong> - a headless browser service used to extract playable
            video URLs from third-party websites when direct extraction is not possible (see section 8).
          </li>
          <li>
            <strong>Sideby Pass extension</strong> - a browser extension that detects video URLs on web pages for use
            with the platform.
          </li>
        </ul>
        <p>
          The Service does not permanently host or store video files. To enable playback, video streams may be routed
          through our proxy (pipe.sideby.me) and extracted media URLs may be temporarily cached (up to 1 hour) when
          headless browser capture is required. Users are responsible for the URLs they share.
        </p>
        <p>
          Rooms are identified by a 6-character code and can optionally be protected with a 4-digit passcode. The room
          host can lock the room, lock chat, kick users, and promote guests to co-host. Rooms are automatically closed
          and all associated data deleted when the last user leaves or after 24 hours of inactivity.
        </p>
        <p>
          The Service includes real-time voice and video chat between room participants over peer-to-peer WebRTC
          connections. The sync server acts as a signaling relay only; audio and video streams are not routed through
          our servers unless a TURN relay is required for NAT traversal.
        </p>
        <p>
          The Service does not support DRM-protected streaming platforms. The following are explicitly blocked: Netflix,
          Disney+, Hulu, Amazon Prime Video, Apple TV+, Max (HBO), Peacock, and Paramount+.
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
          <li>
            Submit URLs designed to abuse the headless capture service, including URLs intended to exfiltrate data from
            the capture environment or that are constructed to exploit our infrastructure.
          </li>
          <li>
            Submit video URLs from platforms whose terms of service explicitly prohibit third-party extraction,
            embedding, or automated access.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Content &amp; Copyright</h2>
        <p>
          sideby.me acts as a synchronization and delivery tool. We do not host video files. All video content is
          sourced from third-party URLs provided by users. You acknowledge that:
        </p>
        <ul>
          <li>
            You are solely responsible for ensuring you have the right to access and share any video URL you use with
            the Service.
          </li>
          <li>
            When you submit a video URL, the Service may make server-side HTTP requests to that URL and to third-party
            platform APIs to extract a playable stream. By submitting a URL, you represent that you have the right to
            access that content and that doing so does not violate the source platform&apos;s terms of service.
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
        <h2>8. Headless Browser Capture</h2>
        <p>
          When direct video URL extraction fails (e.g., when a site dynamically loads its video URLs via JavaScript),
          the Service sends the video page URL to an automated headless Chromium browser (the &quot;Lens&quot; service).
          Lens visits the page, intercepts network traffic, and extracts the playable video stream URL. By using the
          Service, you acknowledge that:
        </p>
        <ul>
          <li>
            Our servers make HTTP requests to the target website on your behalf as part of this extraction process.
          </li>
          <li>
            The extracted stream URL and associated playback headers are stored temporarily (up to 1 hour) in Cloudflare
            KV and then automatically deleted.
          </li>
          <li>
            This process is used only for video extraction and does not store, index, or transmit any other content from
            the target page.
          </li>
        </ul>
      </section>

      <section>
        <h2>9. Disclaimer of Warranties</h2>
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
        <h2>10. Limitation of Liability</h2>
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
        <h2>11. Modifications</h2>
        <p>
          We reserve the right to modify these Terms at any time. Changes will be effective immediately upon posting.
          Your continued use of the Service after modifications constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section>
        <h2>12. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of India, without regard to
          conflict of law principles. Any disputes arising from these Terms or the Service shall first be resolved
          through good-faith negotiation. If negotiation fails, disputes shall be subject to the exclusive jurisdiction
          of the courts located in India.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
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
