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
        Effective Date: [Insert Date]
        <br />
        Last Updated: [Insert Date]
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
            Kinin AI Biographer is designed to protect personal memory data.
          </div>
          <div>
            Personal story content is not sold or shared for external model training.
          </div>
          <div>
            Antry may use limited, privacy-protected data internally to improve system performance.
          </div>
        </div>

        {/* 7 */}
        <div>
          <div style={sectionTitleStyle}>7. Data Disclosure</div>
          <div style={paragraphStyle}>
            Antry does not disclose personal data to unrelated third parties for marketing or
            advertising.
          </div>

          <div style={{ fontWeight: 600 }}>Permitted disclosures:</div>
          <ul style={listStyle}>
            <li>Service providers (hosting, infrastructure, etc.)</li>
            <li>User-directed sharing</li>
            <li>Legal compliance</li>
            <li>Security protection</li>
            <li>Business transfers</li>
          </ul>
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
            We use cookies and similar technologies to operate the service and improve performance.
          </div>
          <div>No advertising tracking is based on personal story content.</div>
        </div>

        {/* 10 */}
        <div>
          <div style={sectionTitleStyle}>10. Data Retention</div>
          <div>
            Data is retained as long as necessary to provide the service and meet legal obligations.
          </div>
        </div>

        {/* 11 */}
        <div>
          <div style={sectionTitleStyle}>11. Your Rights</div>
          <ul style={listStyle}>
            <li>Access your data</li>
            <li>Correct inaccuracies</li>
            <li>Delete data</li>
            <li>Export content</li>
          </ul>
        </div>

        {/* 12 */}
        <div>
          <div style={sectionTitleStyle}>12. California Privacy Rights</div>
          <div>
            California residents may request access, deletion, or correction of personal data.
          </div>
        </div>

        {/* 13 */}
        <div>
          <div style={sectionTitleStyle}>13. Other U.S. State Rights</div>
          <div>
            Additional rights may apply depending on your state of residence.
          </div>
        </div>

        {/* 14 */}
        <div>
          <div style={sectionTitleStyle}>14. International Users</div>
          <div>
            Data may be processed in the United States or other jurisdictions.
          </div>
        </div>

        {/* 15 */}
        <div>
          <div style={sectionTitleStyle}>15. Security</div>
          <div>
            We implement safeguards to protect personal data but cannot guarantee absolute security.
          </div>
        </div>

        {/* 16 */}
        <div>
          <div style={sectionTitleStyle}>16. Access Controls</div>
          <div>
            Access to data is limited to authorized personnel and service providers.
          </div>
        </div>

        {/* 17 */}
        <div>
          <div style={sectionTitleStyle}>17. Children’s Privacy</div>
          <div>
            Kinin AI Biographer is intended for adults. We do not knowingly collect data from children.
          </div>
        </div>

        {/* 18 */}
        <div>
          <div style={sectionTitleStyle}>18. Third-Party Services</div>
          <div>
            Third-party services integrated with Kinin are governed by their own policies.
          </div>
        </div>

        {/* 19 */}
        <div>
          <div style={sectionTitleStyle}>19. Policy Changes</div>
          <div>
            We may update this policy. Continued use indicates acceptance of changes.
          </div>
        </div>

        {/* 20 */}
        <div>
          <div style={sectionTitleStyle}>20. Contact</div>
          <div>Email: jesse@kinin.ai</div>
          <div>Company: Antry, Inc.</div>
        </div>

      </div>
    </div>
  );
}