import type { Metadata } from "next";
import LegalPage, { Section } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · PostGoblins",
  description: "How PostGoblins collects, uses and protects your information.",
};

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          {LEGAL.operator} (“we”, “us”) is a social media scheduling tool. You connect your own social accounts, and we
          publish the posts you create or schedule. This policy explains what information we handle to do that, why,
          and the choices you have. We do not sell your personal information and we do not use it for advertising.
        </p>
      }
    >
      <Section id="collect" title="1. Information we collect">
        <p>
          <strong>Your PostGoblins account.</strong> Your name, email address, timezone, and a password. We store only a
          salted, one-way hash of your password, never the password itself.
        </p>
        <p>
          <strong>Connected social accounts.</strong> When you connect a platform (for example Facebook Pages, Instagram, Threads, YouTube, TikTok,
          X, LinkedIn, Bluesky, Mastodon, Discord or Telegram) we receive and store what is needed to post on your
          behalf: the account or page ID, display name, username, profile picture link, and the access credentials the
          platform issues (OAuth tokens, or an app password, webhook URL or bot token you provide). These credentials
          are encrypted at rest with AES-256-GCM.
        </p>
        <p>
          <strong>Content you create.</strong> Post text, images and videos you upload, schedules, drafts, and delivery
          results (for example the link to a published post or an error message from a platform).
        </p>
        <p>
          <strong>AI agent conversations.</strong> If you use the Goblin agent or AI assist, we store your messages and
          the agent’s replies so you can return to the conversation.
        </p>
        <p>
          <strong>API keys.</strong> If you create keys for connecting AI agents over MCP, we store only a hash of each
          key and a short prefix so you can recognise it.
        </p>
        <p>
          <strong>Technical data.</strong> Our hosting provider records standard request logs (such as IP address,
          browser type and time of request) for security and reliability.
        </p>
      </Section>

      <Section id="use" title="2. How we use information">
        <ul>
          <li>To run your account and sign you in.</li>
          <li>To publish, schedule, retry and report on posts to the accounts you connected, at the times you choose.</li>
          <li>To generate or edit post text and carry out agent actions when you ask the AI features to.</li>
          <li>To keep the service secure, prevent abuse and fix problems.</li>
          <li>To contact you about your account, security issues or changes to these terms.</li>
        </ul>
        <p>
          We use data from connected platforms only to provide the features you use. We never post anything you did not
          create, schedule or ask the agent to create.
        </p>
      </Section>

      <Section id="share" title="3. Who we share it with">
        <p>We share information only with the services needed to run PostGoblins:</p>
        <ul>
          <li>
            <strong>Social platforms you connect</strong>, which receive the posts and media you publish to them. Their
            own privacy policies govern what they do with it.
          </li>
          <li>
            <strong>Vercel</strong> (hosting and file storage for uploaded media) and <strong>Neon</strong> (database),
            which store data on our behalf in the United States.
          </li>
          <li>
            <strong>Anthropic</strong> (Claude), which processes your messages and relevant account and post details
            when you use the AI agent or AI assist, to generate a response. Anthropic does not use this data to train
            its models under its commercial terms.
          </li>
        </ul>
        <p>
          We may also disclose information if required by law, to protect the rights and safety of users or the public,
          or as part of a merger or sale of the service (in which case this policy will continue to apply).
        </p>
      </Section>

      <Section id="meta" title="4. Data from Facebook, Instagram, Threads, YouTube and TikTok">
        <p>
          If you connect a Facebook Page, Instagram professional account or Threads profile, we use the permissions you
          grant (such as listing the Pages you manage and publishing posts) only to publish the content you schedule and
          show its status. We do not use this data for advertising, profiling or any other purpose, and we do not share
          it except as described above. You can remove our access at any time by disconnecting the account in
          PostGoblins, or from Facebook (Settings → Business integrations, which also covers Instagram accounts connected
          through Facebook) or Threads (Settings → Account → Website permissions).
        </p>
        <p>
          <strong>YouTube.</strong> PostGoblins uses YouTube API Services to upload the videos you schedule to your
          channel and to read your channel’s name and picture. By connecting YouTube you agree to the{" "}
          <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>, and
          Google’s handling of your data is described in the{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>. You
          can revoke our access at any time on your{" "}
          <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
            Google Account’s third-party connections page
          </a>

          . After that we can no longer access your channel; disconnect YouTube in PostGoblins to also delete the
          stored credentials immediately.
        </p>
        <p>
          <strong>TikTok.</strong> We use TikTok’s APIs only to read your display name and avatar and to upload the
          videos you schedule. You can revoke access from TikTok (Settings and privacy → Security → Manage app
          permissions) or by disconnecting TikTok in PostGoblins.
        </p>
        <p>To have all data we received from any of these platforms deleted, follow the steps in section 7.</p>
      </Section>

      <Section id="cookies" title="5. Cookies and local storage">
        <p>
          We use one essential cookie to keep you signed in. It expires after 30 days or when you sign out. Your theme
          choice (light, dark or system) is saved in your browser’s local storage. We do not use advertising or
          third-party tracking cookies.
        </p>
      </Section>

      <Section id="retention" title="6. How long we keep information">
        <p>
          We keep your account information and content for as long as your account is open. Disconnecting a social
          account deletes its stored credentials immediately. Temporary sign-in data used while connecting an account
          is deleted within an hour. When you delete your account, we delete your personal information within 30 days,
          except where we must keep something to meet a legal obligation. Posts already published remain on the
          platforms you published them to; delete them there if you want them removed.
        </p>
      </Section>

      <Section id="rights" title="7. Your choices and rights">
        <ul>
          <li>Edit or delete posts, drafts, conversations and API keys from within the app at any time.</li>
          <li>Disconnect any social account from the Accounts tab.</li>
          <li>
            Ask for a copy of your data, correction of it, or deletion of your account and all associated data by
            emailing {mail} from the address on your account. We respond within 30 days.
          </li>
        </ul>
        <p>
          Depending on where you live (for example the EU, UK or California), you may have additional rights, such as
          to object to or restrict processing. You can exercise them the same way, and you may complain to your local
          data protection authority.
        </p>
      </Section>

      <Section id="security" title="8. Security">
        <p>
          We use HTTPS, encrypt stored platform credentials, hash passwords and API keys, and limit access to production
          systems. No method of storage or transmission is completely secure, so we cannot guarantee absolute security.
          Please use a strong, unique password and tell us right away if you suspect your account has been compromised.
        </p>
      </Section>

      <Section id="children" title="9. Children">
        <p>
          PostGoblins is not intended for anyone under 13 (or the minimum age for digital consent where you live), and we
          do not knowingly collect their information. If you believe a child has given us information, contact us and we
          will delete it.
        </p>
      </Section>

      <Section id="international" title="10. International users">
        <p>
          We process and store information in the United States. By using PostGoblins you understand that your
          information will be transferred there, where data protection laws may differ from those in your country.
        </p>
      </Section>

      <Section id="changes" title="11. Changes to this policy">
        <p>
          We may update this policy as the service changes. We will post the new version here with a new effective date,
          and tell you by email or in the app before significant changes take effect.
        </p>
      </Section>

      <Section id="contact" title="12. Contact">
        <p>
          {LEGAL.operator} · {mail}
        </p>
      </Section>
    </LegalPage>
  );
}
