import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Section } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service · PostGoblins",
  description: "The terms that apply when you use PostGoblins.",
};

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are an agreement between you and {LEGAL.operator} (“we”, “us”) covering your use of PostGoblins,
          including the website, the AI agent, the API and the MCP server (together, the “Service”). By creating an
          account or using the Service you agree to these terms and to our <Link href="/privacy">Privacy Policy</Link>.
          If you do not agree, do not use the Service.
        </p>
      }
    >
      <Section id="eligibility" title="1. Eligibility and accounts">
        <p>
          You must be at least 13 years old (or the minimum age required where you live) and able to form a binding
          contract. If you use the Service for an organisation, you confirm you are authorised to accept these terms for
          it. Keep your password and API keys secure; you are responsible for activity under your account.
        </p>
      </Section>

      <Section id="service" title="2. What PostGoblins does">
        <p>
          PostGoblins lets you connect social media accounts you own or are authorised to manage, then write, schedule
          and publish posts to them, manually, with the AI agent, or through the API and MCP server. We may add, change
          or remove features over time.
        </p>
        <p>
          Publishing depends on third-party platforms and their APIs. We aim to publish at the time you choose, but we do
          not guarantee that any post will be published, published on time, or displayed the way you expect. Platform
          outages, rate limits, policy changes, expired permissions or account restrictions can delay or prevent
          delivery. Check the delivery status of important posts.
        </p>
      </Section>

      <Section id="platforms" title="3. Third-party platforms">
        <p>
          When you connect a platform such as Facebook, Threads, X, LinkedIn, Bluesky, Mastodon, Discord or Telegram,
          your use of it remains subject to that platform’s own terms and policies. You authorise us to access those
          accounts and publish to them on your behalf, within the permissions you grant. You can revoke access at any
          time. Some platforms charge for API access (for example, X charges per post); you are responsible for any
          such costs unless we tell you otherwise.
        </p>
      </Section>

      <Section id="content" title="4. Your content">
        <p>
          You keep all rights to the text, images and videos you create or upload (“Your Content”). You grant us a
          limited, worldwide, non-exclusive, royalty-free licence to host, store, process, transmit and display Your
          Content only as needed to operate the Service, for example to send it to the platforms you choose. This
          licence ends when you delete Your Content or your account, except for copies the platforms themselves keep.
        </p>
        <p>
          You are responsible for Your Content and for making sure you have the rights to publish it. You confirm that
          it does not infringe anyone’s rights or break any law or platform rule.
        </p>
      </Section>

      <Section id="ai" title="5. AI features">
        <p>
          The Goblin agent and AI assist use artificial intelligence to draft text and to create, schedule, edit or
          delete posts when you ask them to. AI output can be inaccurate, inappropriate or not what you intended. You are
          responsible for reviewing it and for anything the agent publishes or schedules on your instructions. Do not
          rely on AI output as professional, legal, medical or financial advice.
        </p>
      </Section>

      <Section id="acceptable-use" title="6. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>post spam, run fake engagement, or operate deceptive or coordinated inauthentic accounts;</li>
          <li>publish content that is illegal, harassing, hateful, sexually exploitative of minors, or that infringes rights;</li>
          <li>spread malware or phishing, or impersonate any person or organisation;</li>
          <li>connect or post to accounts you are not authorised to manage;</li>
          <li>break the terms, rate limits or automation rules of any connected platform;</li>
          <li>
            probe, overload or interfere with the Service, bypass its security, or access it other than through the
            interfaces we provide;
          </li>
          <li>resell or provide the Service to others without our written permission.</li>
        </ul>
      </Section>

      <Section id="api" title="7. API and MCP access">
        <p>
          API keys let software, including AI agents you connect over MCP, act as you. Anything done with your keys is
          your responsibility. Revoke a key immediately if it may have been exposed. We may limit request rates or
          disable keys that are abused.
        </p>
      </Section>

      <Section id="fees" title="8. Fees">
        <p>
          PostGoblins is currently provided free of charge. If we introduce paid plans, we will tell you the price and
          terms in advance, and you will not be charged unless you choose a paid plan.
        </p>
      </Section>

      <Section id="termination" title="9. Suspension and termination">
        <p>
          You can stop using the Service at any time and ask us to delete your account by emailing {mail}. We may suspend
          or end your access if you break these terms, if your use creates risk or legal exposure for us or others, or if
          we stop offering the Service. Where reasonable, we will give you notice and a chance to export your content.
          Sections 4 (licence for content already published), 10, 11, 12 and 13 survive termination.
        </p>
      </Section>

      <Section id="disclaimers" title="10. Disclaimers">
        <p>
          The Service is provided “as is” and “as available”. To the fullest extent permitted by law, we disclaim all
          warranties, express or implied, including merchantability, fitness for a particular purpose, non-infringement,
          and that the Service will be uninterrupted, error-free, secure, or that posts will be delivered.
        </p>
      </Section>

      <Section id="liability" title="11. Limitation of liability">
        <p>
          To the fullest extent permitted by law, {LEGAL.operator} will not be liable for any indirect, incidental,
          special, consequential or punitive damages, or for lost profits, revenue, data, followers, reputation or
          business opportunities, arising from your use of the Service, including missed, late, duplicated or incorrect
          posts and actions taken by third-party platforms. Our total liability for any claim relating to the Service is
          limited to the greater of the amount you paid us in the 12 months before the claim or US$100. Some
          jurisdictions do not allow these limits, so they may not apply to you.
        </p>
      </Section>

      <Section id="indemnity" title="12. Indemnity">
        <p>
          You agree to defend and indemnify {LEGAL.operator} against claims, losses and costs (including reasonable
          legal fees) arising from Your Content, your use of connected accounts, or your breach of these terms or of any
          law or platform rule.
        </p>
      </Section>

      <Section id="law" title="13. Governing law">
        <p>
          These terms are governed by the laws of {LEGAL.governingLaw}, without regard to its conflict-of-law rules. Any
          dispute will be resolved exclusively in {LEGAL.venue}, and you and we consent to their jurisdiction. Nothing
          here limits rights you have under the mandatory consumer laws of the place you live.
        </p>
      </Section>

      <Section id="changes" title="14. Changes to these terms">
        <p>
          We may update these terms. We will post the new version here with a new effective date and, for material
          changes, notify you by email or in the app before they take effect. Continuing to use the Service after that
          means you accept the updated terms.
        </p>
      </Section>

      <Section id="general" title="15. General">
        <p>
          These terms and the Privacy Policy are the entire agreement between you and us about the Service. If any part
          is found unenforceable, the rest stays in effect. Our not enforcing a provision is not a waiver. You may not
          transfer these terms without our consent; we may transfer them as part of a merger, acquisition or sale of the
          Service.
        </p>
      </Section>

      <Section id="contact" title="16. Contact">
        <p>
          {LEGAL.operator} · {mail}
        </p>
      </Section>
    </LegalPage>
  );
}
