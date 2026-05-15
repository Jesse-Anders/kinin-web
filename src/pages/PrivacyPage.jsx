import { Section } from "../theme";

function pad(n) {
  return String(n).padStart(2, "0");
}

function PolicySection({ index, title, children }) {
  return (
    <div className="km-policy-section">
      <div className="km-policy-num">{pad(index)}</div>
      <div>
        <div className="km-policy-title">{title}</div>
        <div className="km-prose km-policy-body">{children}</div>
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <Section
      eyebrow="Privacy policy"
      title={
        <>
          What we collect.<br />
          <em>What we don't.</em>
        </>
      }
    >
      <style>{POLICY_CSS}</style>

      <div className="km-policy-meta">
        <div>
          <div className="km-mono-label">Effective</div>
          <div className="km-policy-date">March 1, 2026</div>
        </div>
        <div>
          <div className="km-mono-label">Last updated</div>
          <div className="km-policy-date">April 18, 2026</div>
        </div>
        <div>
          <div className="km-mono-label">Steward</div>
          <div className="km-policy-date">Antry, Inc.</div>
        </div>
      </div>

      <div className="km-prose" style={{ maxWidth: 760, marginBottom: 48 }}>
        <p>
          <strong>Antry, Inc.</strong> ("Antry," "we," "us," or "our") respects
          the privacy of the people who use our websites, applications, and
          biography-building services (collectively, the "Services"). Antry's
          Services, including the <strong>Kinin AI Biographer</strong>, are
          designed to protect personal stories, personal identity, and
          personal memory data.
        </p>
        <p>
          This Privacy Policy explains how we collect, use, store, disclose,
          and protect personal information specifically in connection with
          Kinin and related Antry Services.
        </p>
      </div>

      <div className="km-policy-grid">
        <PolicySection index={1} title="Scope of this Privacy Policy">
          <p>This Privacy Policy applies when you:</p>
          <ul>
            <li>use the Kinin AI Biographer or related Kinin applications;</li>
            <li>create or maintain an account;</li>
            <li>participate in interviews or submit personal content;</li>
            <li>communicate with Antry; or</li>
            <li>otherwise interact with Kinin Services.</li>
          </ul>
          <p>This Policy does not apply to third-party services not controlled by Antry.</p>
        </PolicySection>

        <PolicySection index={2} title="Core privacy commitments">
          <ul>
            <li>Antry does not sell personal information.</li>
            <li>Antry does not rent or broker personal information.</li>
            <li>Antry does <strong>not</strong> share personal data with advertisers or data brokers for their own use.</li>
            <li>Personal stories and biography data are treated as protected user content.</li>
          </ul>
          <p>Service providers may process data strictly on Antry's behalf under contractual restrictions.</p>
        </PolicySection>

        <PolicySection index={3} title="Personal information we collect">
          <p><strong>A. Information you provide</strong></p>
          <ul>
            <li>Account details (name, email, login credentials)</li>
            <li>Profile and biographical information</li>
            <li>Interview responses, stories, and memories</li>
            <li>Audio, transcripts, images, and uploaded files</li>
            <li>Support communications</li>
            <li>Payment-related data (processed via third-party processors)</li>
          </ul>
          <p><strong>B. Automatically collected</strong></p>
          <ul>
            <li>Device and browser data</li>
            <li>IP address and usage logs</li>
            <li>Interaction and performance metrics</li>
          </ul>
          <p><strong>C. Third-party sources</strong></p>
          <ul>
            <li>Authentication providers</li>
            <li>Payment processors</li>
            <li>Operational service providers</li>
          </ul>
        </PolicySection>

        <PolicySection index={4} title="Sensitive content">
          <p>
            The Kinin AI Biographer may process deeply personal life content. You control what you choose to share.
          </p>
          <p>You are responsible for ensuring you have rights to share information about others.</p>
        </PolicySection>

        <PolicySection index={5} title="How we use information">
          <ul>
            <li>Operate and maintain Kinin Services</li>
            <li>Generate interviews, summaries, and biography outputs</li>
            <li>Personalize user experience</li>
            <li>Provide support and communications</li>
            <li>Ensure security and prevent abuse</li>
            <li>Comply with legal obligations</li>
          </ul>
        </PolicySection>

        <PolicySection index={6} title="AI and model use">
          <p>Kinin does not use customer data for training or fine-tuning AI models.</p>
          <p>
            Kinin may use your content to improve Kinin's own Services, such as
            improving interview quality, safety systems, summarization quality,
            memory organization, and related product performance. Where
            feasible, we may use de-identified, minimized, aggregated, or
            otherwise privacy-protected forms of data for these purposes.
          </p>
        </PolicySection>

        <PolicySection index={7} title="Data disclosure">
          <p>
            Antry does not disclose personal information to unrelated third parties for their own advertising,
            profiling, data brokerage, or resale purposes. We may disclose personal information only in the
            following limited circumstances:
          </p>
          <p><strong>A. Service providers and processors</strong></p>
          <p>
            We may disclose information to vendors that perform services for us — cloud hosting, database
            hosting, authentication, payment processing, customer support, analytics, security monitoring,
            email delivery, storage, transcription, or AI infrastructure — subject to contractual
            restrictions.
          </p>
          <p><strong>B. At your direction</strong></p>
          <p>
            We may disclose information when you instruct us to do so, such as when you export content,
            invite another person to access content, share a story, connect a third-party integration, or
            request a transfer.
          </p>
          <p><strong>C. Legal compliance and protection</strong></p>
          <p>We may disclose information if we believe in good faith that disclosure is reasonably necessary to:</p>
          <ul>
            <li>comply with applicable law, regulation, legal process, or governmental request;</li>
            <li>enforce our terms, policies, or contracts;</li>
            <li>detect, investigate, prevent, or address fraud, abuse, security incidents, or technical issues; or</li>
            <li>protect the rights, property, safety, or security of Antry, our users, or others.</li>
          </ul>
          <p><strong>D. Business transfers</strong></p>
          <p>
            If Antry is involved in a merger, acquisition, financing due diligence, reorganization, asset
            sale, bankruptcy, or similar transaction, personal information may be disclosed as part of
            that transaction, subject to standard confidentiality protections and applicable law.
          </p>
        </PolicySection>

        <PolicySection index={8} title="No sale or advertising use">
          <p>Antry does not sell personal data or use it for targeted advertising.</p>
        </PolicySection>

        <PolicySection index={9} title="Cookies and tracking">
          <p>Kinin may use cookies, local storage, pixels, SDKs, or similar technologies to:</p>
          <ul>
            <li>keep you signed in;</li>
            <li>remember settings and preferences;</li>
            <li>analyze traffic and feature usage;</li>
            <li>improve performance and reliability; and</li>
            <li>measure the effectiveness of our own communications.</li>
          </ul>
          <p>Kinin does not use your private story content for advertising targeting.</p>
          <p>
            If Kinin uses non-essential analytics or advertising-related cookies in the future, we will
            provide any notices and choices required by applicable law.
          </p>
        </PolicySection>

        <PolicySection index={10} title="Data retention">
          <p>
            We retain personal information for as long as reasonably necessary to provide the Services,
            fulfill the purposes described in this Privacy Policy, comply with legal obligations, resolve
            disputes, enforce agreements, and protect the integrity and security of the Services.
          </p>
          <p>Retention periods may vary depending on the category of information and the reason it was collected. For example:</p>
          <ul>
            <li>account information may be retained while your account is active and for a reasonable period thereafter;</li>
            <li>story, interview, and biography content may be retained until you delete it or close your account, subject to backup cycles and legal exceptions;</li>
            <li>transaction records may be retained as required for accounting, tax, audit, or regulatory compliance; and</li>
            <li>security logs may be retained for fraud prevention, abuse detection, and system integrity.</li>
          </ul>
          <p>
            If you request deletion, we will delete or de-identify relevant personal information within a
            commercially reasonable timeframe, except where retention is required or permitted by law.
          </p>
        </PolicySection>

        <PolicySection index={11} title="Your rights">
          <ul>
            <li>Access your data</li>
            <li>Correct inaccuracies</li>
            <li>Delete data (delete all stored biographical content — stories, interviews, and biographies — from your My Account page)</li>
            <li>Export content by request</li>
          </ul>
        </PolicySection>

        <PolicySection index={12} title="California privacy rights">
          <p>
            If you are a California resident, you may have rights under the California Consumer Privacy
            Act, as amended by the California Privacy Rights Act, including the right to know, delete,
            correct, and opt out of sale or sharing, subject to statutory exceptions.
          </p>
        </PolicySection>

        <PolicySection index={13} title="Other U.S. state rights">
          <p>
            Residents of certain U.S. states may have similar rights to access, correct, delete, obtain
            a copy of their data, and opt out of certain processing activities.
          </p>
        </PolicySection>

        <PolicySection index={14} title="International users">
          <p>
            If you access the Services from outside the United States, your information may be
            transferred to, stored in, and processed in the United States or other jurisdictions where
            Kinin or its service providers operate. Where required by law, Kinin will use appropriate
            safeguards for international transfers of personal information.
          </p>
        </PolicySection>

        <PolicySection index={15} title="Security">
          <p>
            We use reasonable administrative, technical, and organizational safeguards designed to
            protect personal information against unauthorized access, loss, misuse, alteration, or
            disclosure. These measures may include encryption in transit, encryption at rest, access
            controls, logging, authentication controls, vendor management, and security monitoring.
          </p>
          <p>No method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>
        </PolicySection>

        <PolicySection index={16} title="Access controls">
          <p>
            Access to personal information is limited to personnel, contractors, and service providers
            who need that access for legitimate business purposes — such as operating the Services,
            maintaining security, providing support, or complying with legal obligations — and who are
            subject to confidentiality and security obligations.
          </p>
        </PolicySection>

        <PolicySection index={17} title="Children's privacy">
          <p>
            Services are not directed to children under 13, and we do not knowingly collect personal
            information from children under 13 without legally sufficient authorization.
          </p>
        </PolicySection>

        <PolicySection index={18} title="Third-party services">
          <p>
            The Services may contain links to or integrations with third-party products or services.
            This Privacy Policy does not apply to third-party services that Kinin does not control. We
            encourage you to review their privacy policies separately.
          </p>
        </PolicySection>

        <PolicySection index={19} title="Policy changes">
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we will
            provide notice by updating the effective date, posting the updated policy, and, where
            appropriate, providing additional notice through the Services or by email.
          </p>
          <p>
            Your continued use of the Services after the updated Privacy Policy becomes effective means
            the updated Policy will apply to your use of the Services, to the extent permitted by law.
          </p>
        </PolicySection>

        <PolicySection index={20} title="Contact">
          <p>If you have questions, concerns, or privacy requests, contact us at:</p>
          <p>
            <strong>Email:</strong> <a href="mailto:jesse@kinin.ai">jesse@kinin.ai</a>
            <br />
            <strong>Website:</strong> <a href="https://kinin.ai">kinin.ai</a>
            <br />
            <strong>Company:</strong> Antry, Inc.
          </p>
        </PolicySection>
      </div>
    </Section>
  );
}

const POLICY_CSS = `
.km-policy-meta {
  display: grid;
  grid-template-columns: repeat(3, max-content);
  gap: 48px;
  padding: 18px 0 22px;
  border-top: 1px solid var(--ink);
  border-bottom: 1px solid var(--thread);
  margin-bottom: 36px;
}
.km-policy-date {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 500;
  letter-spacing: -0.005em;
  font-variation-settings: "opsz" 24, "SOFT" 50;
  color: var(--ink);
  margin-top: 6px;
}
.km-policy-grid {
  display: grid;
  gap: 36px;
  max-width: 880px;
}
.km-policy-section {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 28px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--thread);
  align-items: start;
}
.km-policy-section:last-child { border-bottom: none; }
.km-policy-num {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 38px;
  font-weight: 300;
  font-variation-settings: "opsz" 72, "SOFT" 100;
  color: var(--butter);
  line-height: 1;
  padding-top: 4px;
}
.km-policy-title {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 500;
  letter-spacing: -0.012em;
  font-variation-settings: "opsz" 36, "SOFT" 50;
  margin-bottom: 12px;
}
.km-policy-body { font-size: 16px; }
.km-policy-body ul { padding-left: 22px; margin: 8px 0 12px; }
.km-policy-body li { margin-bottom: 4px; }

@media (max-width: 720px) {
  .km-policy-meta { grid-template-columns: 1fr; gap: 16px; }
  .km-policy-section { grid-template-columns: 1fr; gap: 8px; }
  .km-policy-num { font-size: 28px; }
}
`;
