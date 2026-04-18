export default function PrivacyPage() {
  const sectionTitleStyle = {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 6,
  };

  const paragraphStyle = {
    marginBottom: 8,
  };

  const listStyle = {
    paddingLeft: 20,
    margin: "8px 0",
  };

  return (
    <div style={{ padding: 16, maxWidth: 800 }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
        Privacy Policy
      </div>

      <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 16 }}>
        Effective Date: 3/1/2026
        <br />
        Last Updated: 4/18/2026
      </div>

      <div style={{ display: "grid", gap: 16, lineHeight: 1.55 }}>

        <div>
          Antry, Inc. (“Antry,” “we,” “us,” or “our”) respects the privacy of the people who use our
          websites, applications, and biography-building services (collectively, the “Services”).
          Antry’s Services, including the <b>Kinin AI Biographer</b>, are designed to protect personal
          stories, personal identity, and personal memory data.
        </div>

        <div>
          This Privacy Policy explains how we collect, use, store, disclose, and protect personal
          information specifically in connection with the Kinin AI Biographer and related Kinin
          Services.
        </div>

        {/* 1 */}
        <div>
          <div style={sectionTitleStyle}>1. Scope of This Privacy Policy</div>
          <div style={paragraphStyle}>This Privacy Policy applies when you:</div>
          <ul style={listStyle}>
            <li>use the Kinin AI Biographer or related Kinin applications;</li>
            <li>create or maintain an account;</li>
            <li>participate in interviews or submit personal content;</li>
            <li>communicate with Antry; or</li>
            <li>otherwise interact with Kinin Services.</li>
          </ul>
          <div>
            This Policy does not apply to third-party services not controlled by Antry.
          </div>
        </div>

        {/* 2 */}
        <div>
          <div style={sectionTitleStyle}>2. Core Privacy Commitments</div>
          <ul style={listStyle}>
            <li>Antry does not sell personal information.</li>
            <li>Antry does not rent or broker personal information.</li>
            <li>
              Antry does NOT share personal data with advertisers or data brokers for their own use.
            </li>
            <li>
              Personal stories and biography data are treated as protected user content.
            </li>
          </ul>
          <div>
            Service providers may process data strictly on Antry’s behalf under contractual
            restrictions.
          </div>
        </div>

        {/* 3 */}
        <div>
          <div style={sectionTitleStyle}>3. Personal Information We Collect</div>

          <div style={{ fontWeight: 600 }}>A. Information You Provide</div>
          <ul style={listStyle}>
            <li>Account details (name, email, login credentials)</li>
            <li>Profile and biographical information</li>
            <li>Interview responses, stories, and memories</li>
            <li>Audio, transcripts, images, and uploaded files</li>
            <li>Support communications</li>
            <li>Payment-related data (processed via third-party processors)</li>
          </ul>

          <div style={{ fontWeight: 600 }}>B. Automatically Collected</div>
          <ul style={listStyle}>
            <li>Device and browser data</li>
            <li>IP address and usage logs</li>
            <li>Interaction and performance metrics</li>
          </ul>

          <div style={{ fontWeight: 600 }}>C. Third-Party Sources</div>
          <ul style={listStyle}>
            <li>Authentication providers</li>
            <li>Payment processors</li>
            <li>Operational service providers</li>
          </ul>
        </div>

        {/* 4 */}
        <div>
          <div style={sectionTitleStyle}>4. Sensitive Content</div>
          <div style={paragraphStyle}>
            Kinin AI Biographer may process deeply personal life content. You control what you choose
            to share.
          </div>
          <div>
            You are responsible for ensuring you have rights to share information about others.
          </div>
        </div>

        {/* 5 */}
        <div>
          <div style={sectionTitleStyle}>5. How We Use Information</div>
          <ul style={listStyle}>
            <li>Operate and maintain Kinin Services</li>
            <li>Generate interviews, summaries, and biography outputs</li>
            <li>Personalize user experience</li>
            <li>Provide support and communications</li>
            <li>Ensure security and prevent abuse</li>
            <li>Comply with legal obligations</li>
          </ul>
        </div>

        {/* 6 */}
        <div>
          <div style={sectionTitleStyle}>6. AI and Model Use</div>
          <div style={paragraphStyle}>
            Kinin Does not use customer data for training or fine-tuning AI models. 
          </div>
          <div>
            Kinin may use your content to improve Kinin’s own Services, such as improving interview quality, 
            safety systems, summarization quality, memory organization, and related product performance. 
            Where feasible, we may use de-identified, minimized, aggregated, or otherwise privacy-protected 
            forms of data for these purposes.
          </div>
        </div>

        {/* 7 */}
        <div>
          <div style={sectionTitleStyle}>7. Data Disclosure</div>
          <div style={paragraphStyle}>
            Antry does not disclose personal information to unrelated third parties for their own
            advertising, profiling, data brokerage, or resale purposes.
          </div>
          <div style={paragraphStyle}>
            We may disclose personal information only in the following limited circumstances:
          </div>

          <div style={{ fontWeight: 600 }}>A. Service Providers and Processors</div>
          <div style={paragraphStyle}>
            We may disclose information to vendors and service providers that perform services for us,
            such as cloud hosting, database hosting, authentication, payment processing, customer
            support, analytics, security monitoring, email delivery, storage, transcription, or AI
            infrastructure, subject to contractual restrictions.
          </div>

          <div style={{ fontWeight: 600 }}>B. At Your Direction</div>
          <div style={paragraphStyle}>
            We may disclose information when you instruct us to do so, such as when you export
            content, invite another person to access content, share a story, connect a third-party
            integration, or request a transfer.
          </div>

          <div style={{ fontWeight: 600 }}>C. Legal Compliance and Protection</div>
          <div style={paragraphStyle}>
            We may disclose information if we believe in good faith that disclosure is reasonably
            necessary to:
          </div>
          <ul style={listStyle}>
            <li>
              comply with applicable law, regulation, legal process, or governmental request;
            </li>
            <li>enforce our terms, policies, or contracts;</li>
            <li>
              detect, investigate, prevent, or address fraud, abuse, security incidents, or technical
              issues; or
            </li>
            <li>
              protect the rights, property, safety, or security of Antry, our users, or others.
            </li>
          </ul>

          <div style={{ fontWeight: 600 }}>D. Business Transfers</div>
          <div>
            If Antry is involved in a merger, acquisition, financing due diligence, reorganization,
            asset sale, bankruptcy, or similar transaction, personal information may be disclosed as
            part of that transaction, subject to standard confidentiality protections and applicable
            law.
          </div>
        </div>

        {/* 8 */}
        <div>
          <div style={sectionTitleStyle}>8. No Sale or Advertising Use</div>
          <div>
            Antry does not sell personal data or use it for targeted advertising.
          </div>
        </div>

        {/* 9 */}
        <div>
          <div style={sectionTitleStyle}>9. Cookies and Tracking</div>
          <div style={paragraphStyle}>
            Kinin may use cookies, local storage, pixels, SDKs, or similar technologies to:
          </div>
          <ul style={listStyle}>
            <li>keep you signed in;</li>
            <li>remember settings and preferences;</li>
            <li>analyze traffic and feature usage;</li>
            <li>improve performance and reliability; and</li>
            <li>measure the effectiveness of our own communications.</li>
          </ul>
          <div style={paragraphStyle}>
            Kinin does not use your private story content for advertising targeting.
          </div>
          <div>
            If Kinin uses non-essential analytics or advertising-related cookies in the future, we
            will provide any notices and choices required by applicable law.
          </div>
        </div>

        {/* 10 */}
        <div>
          <div style={sectionTitleStyle}>10. Data Retention</div>
          <div style={paragraphStyle}>
            We retain personal information for as long as reasonably necessary to provide the
            Services, fulfill the purposes described in this Privacy Policy, comply with legal
            obligations, resolve disputes, enforce agreements, and protect the integrity and security
            of the Services.
          </div>
          <div style={paragraphStyle}>
            Retention periods may vary depending on the category of information and the reason it was
            collected. For example:
          </div>
          <ul style={listStyle}>
            <li>
              account information may be retained while your account is active and for a reasonable
              period thereafter;
            </li>
            <li>
              story, interview, and biography content may be retained until you delete it or close your
              account, subject to backup cycles and legal exceptions;
            </li>
            <li>
              transaction records may be retained as required for accounting, tax, audit, or
              regulatory compliance; and
            </li>
            <li>
              security logs may be retained for fraud prevention, abuse detection, and system
              integrity.
            </li>
          </ul>
          <div>
            If you request deletion, we will delete or de-identify relevant personal information
            within a commercially reasonable timeframe, except where retention is required or
            permitted by law.
          </div>
        </div>

        {/* 11 */}
        <div>
          <div style={sectionTitleStyle}>11. Your Rights</div>
          <ul style={listStyle}>
            <li>Access your data</li>
            <li>Correct inaccuracies</li>
            <li>Delete data (Delete all stored biographical content (including stories, interviews, and biographies) at user's request via the 'My Account' page.)</li>
            <li>Export content by request.</li>
          </ul>
        </div>

        {/* 12 */}
        <div>
          <div style={sectionTitleStyle}>12. California Privacy Rights</div>
          <div>
            If you are a California resident, you may have rights under the California Consumer Privacy Act, 
            as amended by the California Privacy Rights Act, including the right to know, delete, correct, 
            and opt out of sale or sharing, subject to statutory exceptions.
          </div>
        </div>

        {/* 13 */}
        <div>
          <div style={sectionTitleStyle}>13. Other U.S. State Rights</div>
          <div>
            Residents of certain U.S. states may have similar rights to access, correct, delete, 
            obtain a copy of their data, and opt out of certain processing activities.
          </div>
        </div>

        {/* 14 */}
        <div>
          <div style={sectionTitleStyle}>14. International Users</div>
          <div>
            If you access the Services from outside the United States, your information may be transferred to, 
            stored in, and processed in the United States or other jurisdictions where Kinin or its 
            service providers operate. Where required by law, Kinin will use appropriate safeguards for 
            international transfers of personal information.
          </div>
        </div>

        {/* 15 */}
        <div>
          <div style={sectionTitleStyle}>15. Security</div>
          <div>
          We use reasonable administrative, technical, and organizational safeguards designed to protect personal information 
          against unauthorized access, loss, misuse, alteration, or disclosure. These measures may include encryption in transit, 
          encryption at rest, access controls, logging, authentication controls, vendor management, and security monitoring.
          </div>
          <div>
          No method of transmission or storage is completely secure, and we cannot guarantee absolute security.
          </div>
        </div>

        {/* 16 */}
        <div>
          <div style={sectionTitleStyle}>16. Access Controls</div>
          <div>
          Access to personal information is limited to personnel, contractors, and service providers who need that access for legitimate business purposes, 
          such as operating the Services, maintaining security, providing support, or complying with legal obligations, 
          and who are subject to confidentiality and security obligations.
          </div>
        </div>

        {/* 17 */}
        <div>
          <div style={sectionTitleStyle}>17. Children’s Privacy</div>
          <div>
          Services are not directed to children under 13, and we do not knowingly collect personal information from 
          children under 13 without legally sufficient authorization.
          </div>
        </div>

        {/* 18 */}
        <div>
          <div style={sectionTitleStyle}>18. Third-Party Services</div>
          <div>
            The Services may contain links to or integrations with third-party products or services. 
            This Privacy Policy does not apply to third-party services that Kinin does not control. 
            We encourage you to review their privacy policies separately.
          </div>
        </div>

        {/* 19 */}
        <div>
          <div style={sectionTitleStyle}>19. Policy Changes</div>
          <div>
          We may update this Privacy Policy from time to time. If we make material changes, 
          we will provide notice by updating the effective date, posting the updated policy, 
          and, where appropriate, providing additional notice through the Services or by email.
          </div>
          <div>
            Your continued use of the Services after the updated Privacy Policy becomes effective means the updated Policy will apply to your use of the Services, to the extent permitted by law.
          </div>
        </div>

        {/* 20 */}
        <div>
          <div style={sectionTitleStyle}>20. Contact</div>
          <div>If you have questions, concerns, or privacy requests, contact us at:
          </div>
          <div>Email: jesse@kinin.ai</div>
          <div>Website: https://kinin.ai</div>
          <div>Company: Antry, Inc.</div>
        </div>

      </div>
    </div>
  );
}