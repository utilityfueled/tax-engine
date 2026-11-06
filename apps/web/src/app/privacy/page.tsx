import type { Metadata } from "next";
import Link from "next/link";

import { OFFICIAL_SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Privacy Policy — Viva La Tax",
  description:
    "Privacy Policy for Viva La Tax. Learn how data is handled in local and hosted modes, including optional AI providers.",
};

const sections = [
  {
    id: "intro",
    title: "Introduction",
    content: `Viva La Tax may be used in self-hosted mode or through a separately operated hosted deployment. This Privacy Policy explains how project code handles data and what a hosted operator may collect to provide the service. If you disagree with this policy, stop using the Service or, for the official hosted Viva La Tax service, contact ${OFFICIAL_SUPPORT_EMAIL}. If you use another hosted deployment, contact that operator instead.`,
  },
  {
    id: "self-hosted",
    title: "Self-Hosted Mode",
    content: `In self-hosted mode, draft answers and workspace records are stored in your browser's localStorage. Original document files are cached in IndexedDB when it is available. The app does not encrypt these browser stores. Password-protected recovery downloads are encrypted separately. The project does not send that local data to a project-operated remote service unless you explicitly use optional features in your deployment that call an external provider. If you enable optional AI helper or document-analysis features, selected prompts, summaries, or document text may be sent transiently to the providers you configured. There are no advertising trackers in the project code, and your local data remains under your control.`,
  },
  {
    id: "hosted-mode",
    title: "Hosted Mode",
    content: `In hosted mode, account identity, subscription state, reminder settings, AI usage and budget metadata, and privacy-safe workspace shells are stored in a Postgres database solely to provide the Service's hosted software functionality. Authentication is handled via BetterAuth-compatible session cookies. Billing is handled via Stripe, and Stripe's privacy policy applies to payment data. We do not store your credit card numbers, and we do not durably store raw uploaded tax forms on our servers.`,
  },
  {
    id: "what-we-collect",
    title: "What We Collect in Hosted Mode",
    content: `We collect your email address for authentication, basic account information, Stripe customer and subscription metadata, workspace identifiers, progress markers, checklist state, reminder settings, AI usage and budget records, and redacted derived summaries needed to operate the hosted account. Billing information such as card number and billing address is collected and processed by Stripe, and we receive payment status metadata only. If you invoke optional AI helper or document-analysis features, selected prompts, redacted workspace summaries, or redacted document text may be transmitted transiently to configured model providers. We do not durably collect raw uploaded tax forms, raw OCR output, extracted source-document JSON, Social Security numbers, routing numbers, or account numbers on our servers.`,
  },
  {
    id: "what-we-never-do",
    title: "What We Never Do",
    content: `We never sell your data. We never use your data for advertising. We do not train our own AI or machine learning models on your tax data. We do not monetize your personal information. We do not keep raw tax forms in durable hosted storage. When third-party payment or model providers are used to deliver a feature you invoked, those providers process data under their own terms and privacy policies.`,
  },
  {
    id: "routine-information",
    title: "Collection of Routine Information",
    content: `Hosting and optional telemetry services may receive technical information such as IP addresses, browser details, timestamps and page requests. This information can be identifying. Collection and retention depend on the deployment and its providers; review the operator's configuration and policies.`,
  },
  {
    id: "cookies",
    title: "Cookies",
    content: `Local drafts use browser storage and do not require a hosted sign-in session. Hosted accounts use authentication cookies to maintain their sessions. The project does not add advertising cookies. Separately configured payment or other services have their own cookie policies.`,
  },
  {
    id: "data-retention",
    title: "Data Retention",
    content: `Use the return deletion control to remove that return's local answers, workspace records and cached original files from this browser. To remove all locally stored returns, clear all site data for the app, including IndexedDB; clearing only localStorage can leave cached document files behind. Deleting a return does not delete recovery files or review PDFs already downloaded to your device. For the official hosted Viva La Tax service, email ${OFFICIAL_SUPPORT_EMAIL} to request account deletion. If you use another hosted deployment, contact that operator instead. Deletion removes your stored workspace shells, reminder settings, AI usage and budget metadata, and account metadata from hosted storage. Raw uploaded forms are not retained in durable hosted storage after processing completes. Third-party providers may retain transient request or logging data under their own policies.`,
  },
  {
    id: "review-downloads",
    title: "Review Downloads",
    content: `Review PDFs omit taxpayer Social Security numbers and are marked for review only. Names, tax amounts and explicit business EINs may remain. These downloads are not anonymous, complete filing exports or full backups of your original records.`,
  },
  {
    id: "third-party",
    title: "Third-Party Services",
    content: `Hosted deployments may use third-party services such as Stripe for payment processing and model providers such as OpenAI or Google Gemini for optional AI helper or document-analysis features. Those providers have their own terms and privacy policies, and we do not control them. Review the policies of the deployment and providers you choose to use.`,
  },
  {
    id: "coppa",
    title: "Children's Privacy (COPPA)",
    content: `Viva La Tax does not address anyone under the age of 18. We do not knowingly collect personal information from children. If you believe a hosted deployment has collected information from a child, contact that deployment's operator.`,
  },
  {
    id: "security",
    title: "Security",
    content: `The app encrypts downloaded recovery backups with the password you choose. Ordinary browser drafts and cached documents are not encrypted by the app. HTTPS and encryption for hosted databases, disks and backups depend on the deployment operator's infrastructure and configuration; they are not established by running the project code. Protect access to your device and keep your recovery password separately from the backup.`,
  },
  {
    id: "open-source",
    title: "Open-Source Transparency",
    content: `All data-handling code in this project is auditable. You do not have to take an operator's word for how your data is handled. Review the repository you cloned or the published source for the deployment you are using.`,
  },
  {
    id: "ccpa",
    title: "California Privacy Rights (CCPA)",
    content: `If you are a California resident, you have the right to know what personal information we collect, request deletion of your personal information, and opt out of any sale of personal information (we don't sell it). For the official hosted Viva La Tax service, email ${OFFICIAL_SUPPORT_EMAIL} to request access, correction, or deletion of your hosted account data. If you use another hosted deployment, contact that operator's support address.`,
  },
  {
    id: "liability",
    title: "Limitations of Liability",
    content: `To the maximum extent permitted by law, the project maintainers and any independent hosted operator disclaim liability for damages arising from your use of the Service or any breach of this Privacy Policy.`,
  },
  {
    id: "jurisdiction",
    title: "Governing Law and Jurisdiction",
    content: `Any hosted deployment may publish its own governing-law and jurisdiction terms. For self-hosted use of the open-source project, consult the repository license and any terms published by the operator of the deployment you choose to use.`,
  },
  {
    id: "changes",
    title: "Changes to This Policy",
    content: `We may update this Privacy Policy from time to time. For material changes, we will notify you by email or by posting a prominent notice on the Service before the changes take effect. Your continued use of the Service after changes are posted constitutes acceptance of the revised policy.`,
  },
  {
    id: "contact",
    title: "Contact Information",
    content: `If you have questions or concerns about this Privacy Policy for the official hosted Viva La Tax service, email ${OFFICIAL_SUPPORT_EMAIL}. If you cloned or self-hosted the project yourself, use the repository support channels or contact your own deployment operator.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="workspace-grid">
      <section className="hero">
        <h1>Privacy Policy</h1>
        <p className="hero-copy">
          Last updated: October 26, 2026
        </p>
        <div className="hero-actions">
          <Link href="/" className="utility-button">
            Back to Home
          </Link>
        </div>
      </section>

      <nav className="panel legal-toc" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <span className="eyebrow">TABLE OF CONTENTS</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <div className="panel-body">
          <ol className="legal-toc-list">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="legal-toc-link">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <section className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-header">
          <span className="eyebrow">PRIVACY POLICY</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <div className="panel-body">
          {sections.map((s) => (
            <div key={s.id} id={s.id} className="legal-section">
              <h2 className="legal-section-title">{s.title}</h2>
              <p className="legal-section-body">{s.content}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
