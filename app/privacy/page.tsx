import type { Metadata } from 'next';
import { LegalLayout } from '@/components/layout/legal-layout';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How sideby.me handles your data — spoiler: we keep it minimal.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="February 11, 2026">
      <section>
        <h2>1. Who We Are</h2>
        <p>
          sideby.me (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the website at <strong>sideby.me</strong>{' '}
          and the <strong>Sideby Pass</strong> browser extension (collectively, the &quot;Service&quot;). This Privacy
          Policy explains what data we collect, why, and how we handle it.
        </p>
      </section>

      <section>
        <h2>2. Data We Collect</h2>

        <h3>2.1 Website (sideby.me)</h3>
        <ul>
          <li>
            <strong>No accounts.</strong> We do not require sign-ups or collect email addresses, passwords, or personal
            profiles.
          </li>
          <li>
            <strong>Display names.</strong> When you create or join a room, you provide a temporary display name. This
            is stored only for the duration of the session and is not persisted after the room closes.
          </li>
          <li>
            <strong>Video URLs.</strong> When you share a video in a room, the URL is transmitted to other participants
            in real time via our signaling server. We do not permanently store these URLs.
          </li>
          <li>
            <strong>Connection metadata.</strong> Our server may temporarily log IP addresses and connection timestamps
            for rate-limiting and abuse prevention. These logs are automatically purged within 30 days.
          </li>
        </ul>

        <h3>2.2 Sideby Pass (Browser Extension)</h3>
        <ul>
          <li>
            <strong>Network request monitoring.</strong> The extension uses the{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">webRequest</code> API to observe network traffic in
            your browser <em>locally</em> in order to detect video and streaming URLs (e.g., .mp4, .m3u8 files). This
            analysis happens entirely on your device. We do <strong>not</strong> transmit your browsing history, request
            logs, or any page content to our servers.
          </li>
          <li>
            <strong>DOM scanning.</strong> The extension injects content scripts to scan the DOM for{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">&lt;video&gt;</code> elements and intercepts
            XHR/Fetch responses to find video URLs from site APIs. All processing is local.
          </li>
          <li>
            <strong>Data sent externally.</strong> The <em>only</em> data transmitted to sideby.me is the video URL you
            explicitly choose to &quot;pass&quot; when you click &quot;Create Room&quot; or use the context menu. No
            data is sent without your direct action.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. How We Use Your Data</h2>
        <ul>
          <li>To synchronize video playback between room participants in real time.</li>
          <li>To provide the video detection functionality of the Sideby Pass extension.</li>
          <li>To prevent abuse and ensure fair use of our infrastructure.</li>
        </ul>
        <p>We do not sell, rent, or share your data with third parties for advertising or marketing.</p>
      </section>

      <section>
        <h2>4. Data Storage &amp; Retention</h2>
        <ul>
          <li>
            <strong>Room data</strong> (participant names, video URLs, playback state) is ephemeral and stored in-memory
            using Redis. When a room closes, this data is permanently deleted.
          </li>
          <li>
            <strong>Server logs</strong> (IP addresses, timestamps) are retained for a maximum of 30 days for security
            and debugging purposes, then automatically purged.
          </li>
          <li>
            <strong>Extension data</strong> is stored entirely in your browser&apos;s local memory and is cleared when
            you close or navigate away from a tab.
          </li>
        </ul>
      </section>

      <section>
        <h2>5. Cookies &amp; Local Storage</h2>
        <p>
          sideby.me uses minimal client-side storage. We may use{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">localStorage</code> to remember your UI preferences
          (e.g., theme, volume). We do not use third-party tracking cookies or analytics services. See our{' '}
          <a href="/cookie-policy" className="text-foreground underline underline-offset-4 hover:text-primary-700">
            Cookie Policy
          </a>{' '}
          for details.
        </p>
      </section>

      <section>
        <h2>6. Third-Party Services</h2>
        <p>
          We do not integrate with third-party analytics, advertising networks, or social login providers. The only
          external communication is between your browser and our signaling server for real-time synchronization.
        </p>
      </section>

      <section>
        <h2>7. Children&apos;s Privacy</h2>
        <p>
          Our Service is not directed at children under 13. We do not knowingly collect personal information from
          children. If you believe a child has provided us with data, please contact us so we can take appropriate
          action.
        </p>
      </section>

      <section>
        <h2>8. Your Rights</h2>
        <p>
          Because we collect minimal data and do not maintain user accounts, most data protection rights (access,
          correction, deletion) are satisfied by design. If you have questions or requests regarding your data, contact
          us at{' '}
          <a
            href="mailto:hello@sideby.me"
            className="text-foreground underline underline-offset-4 hover:text-primary-700"
          >
            hello@sideby.me
          </a>
          .
        </p>
      </section>

      <section>
        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated
          &quot;Last updated&quot; date. Your continued use of the Service after changes constitutes acceptance of the
          updated policy.
        </p>
      </section>
    </LegalLayout>
  );
}
