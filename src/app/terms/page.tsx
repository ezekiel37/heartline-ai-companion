import { LegalPage } from "@/components/LegalPage";
import { APP_NAME } from "@/lib/brand";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <h2>Who can use {APP_NAME}</h2>
      <p>You must be at least 18 years old. Accounts found to belong to minors will be closed.</p>
      <h2>Your partner is an AI</h2>
      <p>
        Your partner is an artificial intelligence, not a person. Its replies may be wrong or unsuitable. It is not a
        substitute for professional medical, psychological, legal or financial advice. If you are in crisis, contact
        emergency services (112) or a helpline.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Don&apos;t use the service for sexual content involving minors, to harass others, or to try to make the AI
        produce harmful content. We may suspend accounts that do.
      </p>
      <h2>Plans and payments</h2>
      <p>
        Prices are in Naira and shown before you pay. The 2-week plan is a one-time payment that does not renew. Monthly
        plans renew automatically until cancelled; cancelling keeps access until the end of the paid period.
      </p>
      <h2>Changes</h2>
      <p>We may update these terms and will tell you about material changes.</p>
    </LegalPage>
  );
}
