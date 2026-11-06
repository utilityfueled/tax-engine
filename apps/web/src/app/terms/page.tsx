import type { Metadata } from "next";
import Link from "next/link";

import { OFFICIAL_SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Terms of Service — Viva La Tax",
  description:
    "Terms of Service for Viva La Tax, experimental open-source tax software and hosted software tools.",
};

const sections = [
  {
    id: "acknowledgment",
    title: "Acknowledgment",
    content: `By accessing or using Viva La Tax ("the Service"), you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not use the Service. You represent that you are at least 18 years old. If you are accessing the Service on behalf of an organization, you represent that you have authority to bind that organization to these terms.`,
  },
  {
    id: "service-description",
    title: "Service Description",
    content: `Viva La Tax is experimental, open-source tax calculation and draft-return software. It helps users assemble and review draft U.S. federal and state returns using public tax materials and user-supplied information. It is not a law firm, accounting firm, paid tax return preparation service, e-file provider, tax advisory firm, or financial institution, and it is not offered as a licensed professional service.`,
  },
  {
    id: "no-licensed-services",
    title: "No Licensed Services Or Professional Relationship",
    content: `Use of the Service does not create an attorney-client, accountant-client, fiduciary, tax-preparer, or other professional relationship. Viva La Tax is not held out as a CPA, enrolled agent, attorney, paid preparer, or IRS-authorized e-file provider. Any separate professional review or filing help must be obtained outside this Service under a separate relationship.`,
  },
  {
    id: "no-professional-advice",
    title: "No Professional Tax Advice",
    content: `Nothing provided by Viva La Tax constitutes professional tax, legal, financial, or accounting advice. The Service is not a substitute for a certified public accountant (CPA), enrolled agent (EA), tax attorney, or other licensed professional. Tax law is complex and fact-specific. If you have questions about your situation, consult a qualified professional outside this Service.`,
  },
  {
    id: "accuracy",
    title: "Accuracy Disclaimer",
    content: `The Service is experimental and should not be depended on for accurate, complete, current, or filing-ready tax results. Specs, references, and automated tests help us improve coverage, but they do not create any promise of correctness or suitability for your facts. Tax law changes frequently, edge cases exist, and software has bugs. You are solely responsible for independently reviewing and verifying every output before you rely on or file anything.`,
  },
  {
    id: "no-warranty",
    title: '"AS IS" Disclaimer',
    content: `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. THE PROJECT MAINTAINERS AND ANY INDEPENDENT HOSTED OPERATOR DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR THAT DEFECTS WILL BE CORRECTED. YOU USE THE SERVICE AT YOUR OWN RISK. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ALL SUCH WARRANTIES ARE DISCLAIMED.`,
  },
  {
    id: "user-responsibility",
    title: "User Responsibility",
    content: `You are solely responsible for your tax decisions and filings. This includes verifying calculations against your source documents and official instructions, ensuring your input data is accurate and complete, filing on time, and paying any taxes owed. Viva La Tax is a software tool only. Responsibility for your return remains yours.`,
  },
  {
    id: "user-accounts",
    title: "User Accounts",
    content: `If you create an account on the hosted version of the Service, you must provide accurate information and keep it up to date. You are responsible for safeguarding your password and for all activity under your account. You must notify us immediately of any unauthorized use. We reserve the right to refuse service, terminate accounts, or remove content at our sole discretion.`,
  },
  {
    id: "data-handling",
    title: "Data Handling",
    content: `Viva La Tax operates in local/self-hosted mode and hosted mode. Local mode stores returns in your browser by default, but optional AI or document-analysis features in a deployment may send selected data transiently to configured providers. Hosted mode stores account identity, billing metadata, reminder settings, AI usage/budget metadata, and privacy-safe workspace shells solely to provide hosted software functionality. Raw uploaded tax forms and extracted source-document contents are processed transiently and are not retained in durable hosted storage. See our Privacy Policy for full details.`,
  },
  {
    id: "content-backups",
    title: "Content Backups",
    content: `We do not guarantee the integrity or availability of any data stored through the Service. You are responsible for maintaining independent backups of your tax data, documents, and completed returns. The project maintainers and any hosted operator disclaim liability for loss or corruption of data.`,
  },
  {
    id: "billing",
    title: "Billing and Refunds",
    content: `If you use hosted mode with a paid subscription, billing is handled through Stripe and Stripe's terms apply to payment processing. Paid plans cover hosted software functionality only, such as account access, synced workspace shells, reminder automation, deadline tooling, and AI helper or processing budgets. Fees do not purchase tax advice, legal advice, tax return preparation, professional review, audit representation, or guaranteed outcomes. After purchasing a subscription, refunds are not available. You may cancel at any time through the billing page or Stripe billing portal, and access continues until the end of the current billing period.`,
  },
  {
    id: "e-file",
    title: "E-File Disclaimer",
    content: `Viva La Tax does not currently support electronic filing (e-file) or IRS transmission services. The Service may generate PDF forms or draft bundles, but those outputs are reference materials that you must independently review before using them. You are responsible for ensuring any return is filed on time and through an accepted method.`,
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    content: `The Service, its original content (excluding user-provided data), features, and functionality are protected by copyright, trademark, and other applicable laws. Use of the code, name, and brand assets remains subject to the repository license and any trademark notices published by the project maintainers.`,
  },
  {
    id: "feedback",
    title: "Feedback",
    content: `If you provide feedback, suggestions, or ideas about the Service, you grant the project maintainers and any hosted operator an unrestricted, perpetual, irrevocable, non-exclusive, royalty-free right to use that feedback for any purpose without compensation or attribution to you.`,
  },
  {
    id: "open-source",
    title: "Open-Source License",
    content: `The Viva La Tax calculation engine and web application are open-source software. You can audit calculations, review the source code, and run your own instance subject to the repository's license terms, including AGPL-3.0-only, plus any published trademark notices. These Terms of Service govern your use of the hosted Service and this website.`,
  },
  {
    id: "termination",
    title: "Termination",
    content: `We may terminate or suspend your access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Service ceases immediately. If you wish to terminate an account on the official hosted Viva La Tax service, stop using the Service and email ${OFFICIAL_SUPPORT_EMAIL} to request account deletion. If you use another hosted deployment, contact that deployment's operator instead.`,
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE PROJECT MAINTAINERS AND ANY INDEPENDENT HOSTED OPERATOR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE, ANY ERRORS OR OMISSIONS IN TAX CALCULATIONS, ANY UNAUTHORIZED ACCESS TO YOUR DATA, OR ANY OTHER MATTER RELATING TO THE SERVICE.`,
  },
  {
    id: "dispute-resolution",
    title: "Dispute Resolution",
    content: `If you have a concern or dispute about the official hosted Viva La Tax service, first contact ${OFFICIAL_SUPPORT_EMAIL}. Independent hosted operators may publish their own support and dispute-resolution terms.`,
  },
  {
    id: "us-compliance",
    title: "United States Legal Compliance",
    content: `You represent and warrant that you are not located in a country subject to a United States government embargo, and you are not listed on any United States government list of prohibited or restricted parties.`,
  },
  {
    id: "modifications",
    title: "Changes to These Terms",
    content: `We may update these terms from time to time. For material changes, we will provide at least 30 days' notice by posting the updated terms on the Service before they take effect. Your continued use of the Service after changes take effect constitutes acceptance of the revised terms. If you do not agree with the changes, you must stop using the Service.`,
  },
  {
    id: "severability",
    title: "Severability and Waiver",
    content: `If any provision of these terms is found to be unenforceable, the remaining provisions remain in full effect. Our failure to enforce any right or provision of these terms does not constitute a waiver of that right or provision.`,
  },
  {
    id: "governing-law",
    title: "Governing Law",
    content: `For self-hosted use, the repository license governs use of the code. Any hosted deployment may publish additional governing-law terms that apply to that deployment.`,
  },
  {
    id: "contact",
    title: "Contact Us",
    content: `If you have questions about these Terms of Service for the official hosted Viva La Tax service, email ${OFFICIAL_SUPPORT_EMAIL}. If you cloned or self-hosted the project yourself, use the repository support channels or contact your own deployment operator.`,
  },
];

export default function TermsPage() {
  return (
    <div className="workspace-grid">
      <section className="hero">
        <h1>Terms of Service</h1>
        <p className="hero-copy">
          Last updated: April 6, 2026
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
          <span className="eyebrow">TERMS OF SERVICE</span>
          <span className="window-led" aria-hidden="true" />
        </div>
        <div className="panel-body">
          <p className="legal-intro">
            These Terms of Service (&quot;Terms&quot;) govern your use of the
            Viva La Tax website and software (the &quot;Service&quot;). If you
            are using a hosted deployment, additional operator-specific terms
            may apply.
          </p>
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
