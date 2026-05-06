import type { Metadata } from 'next';
import { LegalLayout } from '@/components/layout/legal-layout';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How sideby.me handles your data - spoiler: we keep it minimal.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="May 6, 2026">
      <section>
        <h2>1. Who We Are</h2>
        <p>
          sideby.me (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the website at <strong>sideby.me</strong>{' '}
          and the following infrastructure (collectively, the &quot;Service&quot;):
        </p>
        <ul>
          <li>
            <strong>watch.sideby.me</strong> - the web application you interact with in your browser.
          </li>
          <li>
            <strong>sync.sideby.me</strong> - a real-time Socket.IO server that handles room state, video
            synchronization, chat, and WebRTC signaling.
          </li>
          <li>
            <strong>pipe.sideby.me</strong> - a Cloudflare Worker that proxies video streams where CORS policies require
            it.
          </li>
          <li>
            <strong>lens.sideby.me</strong> - a headless Chromium service that extracts playable video URLs from
            third-party websites on your behalf.
          </li>
          <li>
            <strong>pass.sideby.me</strong> - a browser extension that detects video URLs on web pages.
          </li>
        </ul>
        <p>This Privacy Policy explains what data we collect, why, and how we handle it.</p>
      </section>

      <section>
        <h2>2. Data We Collect</h2>

        <h3>2.1 Website & Sync Server</h3>
        <ul>
          <li>
            <strong>No accounts.</strong> We do not require sign-ups or collect email addresses, passwords, or personal
            profiles.
          </li>
          <li>
            <strong>Display names.</strong> When you create or join a room, you provide a temporary display name (2–20
            characters). This is stored only for the duration of the room session in Redis and is deleted when the room
            closes.
          </li>
          <li>
            <strong>Video URLs.</strong> When you share a video in a room, the URL is transmitted to other participants
            in real time via our sync server (sync.sideby.me). Video URLs are included in operational logs and traces
            for debugging. When the Lens headless capture service is required (see section 2.2), the extracted media URL
            is temporarily stored in Cloudflare KV for up to 1 hour.
          </li>
          <li>
            <strong>Chat messages.</strong> The last 20 chat messages per room - including message text, display name,
            anonymous user UUID, timestamp, and emoji reactions - are stored in Redis for up to 24 hours. They are
            automatically deleted when the room closes or the 24-hour TTL expires, whichever comes first.
          </li>
          <li>
            <strong>Playback state.</strong> The current video URL, playback position (timestamp), and playing/paused
            state are stored in Redis for the duration of the room session and deleted when the room closes.
          </li>
          <li>
            <strong>Connection metadata.</strong> Our server may temporarily log IP addresses and connection timestamps
            for rate-limiting and abuse prevention. These logs are automatically purged within 30 days. Additionally,
            your IP address may be exposed to Google STUN servers during WebRTC peer-to-peer setup and to Metered.live
            TURN relay servers when a direct P2P connection is not possible. Video proxy traffic to pipe.sideby.me
            passes through Cloudflare infrastructure.
          </li>
          <li>
            <strong>Anonymous user identifiers.</strong> Each session is assigned an anonymous UUID (version 4)
            generated per connection. This ID is used to correlate room events (join, leave, chat, reactions) within a
            session. It is not linked to any personal identity and is discarded when the session ends.
          </li>
        </ul>

        <h3>2.2 Lens Headless Capture</h3>
        <ul>
          <li>
            <strong>Source page URL.</strong> When a video URL cannot be resolved by lighter extraction methods, it is
            sent to our Lens service. Lens opens the page in a headless Chromium browser, intercepts its network
            traffic, and extracts the playable video stream URL. The source page URL is included in distributed tracing
            logs for operational debugging.
          </li>
          <li>
            <strong>Captured media payload.</strong> The extracted media URL and associated HTTP headers (such as
            authorization tokens required for playback) are written to Cloudflare KV with an expiry of up to 1 hour.
            This data is automatically deleted when it expires.
          </li>
          <li>
            <strong>Background refresh.</strong> If a Lens-captured stream URL is about to expire, our sync server
            automatically re-submits the original video URL to Lens to refresh the capture. This happens in the
            background without additional user action.
          </li>
        </ul>

        <h3>2.3 Sideby Pass (Browser Extension)</h3>
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
          <li>
            To relay video streams through our proxy service where CORS policies or authentication headers require it.
          </li>
          <li>To extract playable video URLs from third-party websites on your behalf when you share a video link.</li>
          <li>To prevent abuse and ensure fair use of our infrastructure.</li>
        </ul>
        <p>We do not sell, rent, or share your data with third parties for advertising or marketing.</p>
      </section>

      <section>
        <h2>4. Data Storage &amp; Retention</h2>
        <ul>
          <li>
            <strong>Room state</strong> (participant names, video URL, playback position, room settings) is stored in
            Redis and permanently deleted when the room closes.
          </li>
          <li>
            <strong>Chat messages</strong> (last 20 per room) are stored in Redis for up to 24 hours. They are
            automatically deleted when the room closes or after 24 hours, whichever comes first.
          </li>
          <li>
            <strong>User socket mappings</strong> (anonymous UUID → connection ID) are stored in Redis for up to 2 hours
            per session.
          </li>
          <li>
            <strong>Cloudflare KV</strong> stores the captured media URL and HTTP headers from Lens captures for up to 1
            hour, after which the entry expires automatically.
          </li>
          <li>
            <strong>Server logs</strong> (IP addresses, timestamps, video URLs in traces) are retained for a maximum of
            30 days for security and debugging purposes, then automatically purged.
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
          sideby.me uses minimal client-side storage. We use{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">localStorage</code> for UI preferences (e.g., theme,
          notification sound settings, subtitle preferences) and{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">sessionStorage</code> for short-lived session data
          (e.g., your host token for up to 5 minutes after creating a room). We do not use third-party tracking cookies
          or analytics services. See our{' '}
          <a href="/cookie-policy" className="text-foreground underline underline-offset-4 hover:text-primary-700">
            Cookie Policy
          </a>{' '}
          for the full list.
        </p>
      </section>

      <section>
        <h2>6. Third-Party Services</h2>
        <p>We use the following third-party services as part of the technical infrastructure:</p>
        <ul>
          <li>
            <strong>Cloudflare</strong> - Our video proxy (pipe.sideby.me) runs as a Cloudflare Worker. Captured media
            payloads from Lens are stored in Cloudflare KV. Video bytes proxied through pipe.sideby.me pass through
            Cloudflare&apos;s network infrastructure.
          </li>
          <li>
            <strong>Metered.live</strong> - We fetch WebRTC TURN relay credentials from{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">whonoahexe.metered.live</code> to enable NAT
            traversal for peer-to-peer voice and video connections. Your IP address is sent to TURN relay servers when a
            direct P2P connection is not possible.
          </li>
          <li>
            <strong>Google STUN</strong> - We use Google&apos;s public STUN servers (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">stun.l.google.com</code>) for WebRTC connection
            setup. Your IP address is exposed to these servers during the ICE candidate exchange.
          </li>
          <li>
            <strong>Platform APIs</strong> - When you share a URL from Instagram, Reddit, TikTok, Vimeo, Dailymotion,
            Twitch, or Twitter/X, our sync server makes server-side requests to those platforms to extract the playable
            video URL on your behalf. The URL you submitted is sent to those platforms&apos; servers as part of this
            process.
          </li>
          <li>
            <strong>OpenTelemetry (internal)</strong> - We use OpenTelemetry for internal operational observability.
            Logs and traces include room IDs, anonymous user UUIDs, and video URLs. Message content, raw IP addresses,
            authentication tokens, and cookies are redacted from all telemetry data.
          </li>
        </ul>
        <p>We do not integrate with third-party analytics, advertising networks, or social login providers.</p>
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
          correction, deletion) are satisfied by design. Session data expires automatically, and we have no way to link
          anonymous UUIDs to a specific individual after the session ends. If you have questions or requests regarding
          your data, contact us at{' '}
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
