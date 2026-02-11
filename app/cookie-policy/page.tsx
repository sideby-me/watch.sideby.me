import type { Metadata } from 'next';
import { LegalLayout } from '@/components/layout/legal-layout';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How sideby.me uses cookies and local storage.',
};

export default function CookiePolicyPage() {
  return (
    <LegalLayout title="Cookie Policy" lastUpdated="February 11, 2026">
      <section>
        <h2>1. What Are Cookies?</h2>
        <p>
          Cookies are small text files that are stored on your device when you visit a website. They are widely used to
          make websites work more efficiently and to provide information to site owners. Local storage is a similar
          browser technology that allows websites to store data locally on your device.
        </p>
      </section>

      <section>
        <h2>2. How We Use Cookies &amp; Local Storage</h2>
        <p>
          sideby.me uses a minimal approach to client-side storage. We only use what is strictly necessary for the
          Service to function.
        </p>

        <h3>Essential / Functional Storage</h3>
        <p>These are required for the Service to work properly:</p>
        <ul>
          <li>
            <strong>Theme preference</strong> — Stores your light/dark mode preference using{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">localStorage</code> so we can remember your setting
            between visits.
          </li>
          <li>
            <strong>Socket connection</strong> — Temporary in-memory data used by our real-time connection (Socket.IO)
            to maintain your session within a room. This is not persisted to disk.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. What We Do NOT Use</h2>
        <ul>
          <li>
            <strong>No analytics cookies.</strong> We do not use Google Analytics, Mixpanel, or any other
            tracking/analytics service.
          </li>
          <li>
            <strong>No advertising cookies.</strong> We do not serve ads or use advertising tracking pixels.
          </li>
          <li>
            <strong>No third-party cookies.</strong> We do not embed third-party scripts that set their own cookies on
            your device.
          </li>
          <li>
            <strong>No cross-site tracking.</strong> We do not track your activity across other websites.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Sideby Pass Extension</h2>
        <p>
          The Sideby Pass browser extension does not set cookies. Any data it stores (such as detected video URLs for
          the current tab) is held in the extension&apos;s background service worker memory and is automatically cleared
          when the tab is closed or the browser is restarted.
        </p>
      </section>

      <section>
        <h2>5. Managing Your Preferences</h2>
        <p>
          Since we only use essential/functional storage, there is no cookie banner or consent mechanism required. Under
          the EU ePrivacy Directive and GDPR, storing a user-requested preference (such as theme) is generally
          classified as &quot;strictly necessary&quot; and does not require consent. However, you can clear your
          browser&apos;s local storage at any time through your browser settings. This will reset your theme preference
          but will not affect the Service&apos;s functionality.
        </p>
        <p>
          If we ever introduce non-essential client-side storage, we will implement an appropriate consent mechanism
          (such as a cookie banner) before doing so, in compliance with applicable regulations.
        </p>
      </section>

      <section>
        <h2>6. Changes to This Policy</h2>
        <p>
          If we ever introduce non-essential cookies (e.g., analytics), we will update this policy and implement an
          appropriate consent mechanism before doing so.
        </p>
      </section>
    </LegalLayout>
  );
}
