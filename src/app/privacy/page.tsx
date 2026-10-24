import { LegalPage } from "@/components/LegalPage";
import { APP_NAME } from "@/lib/brand";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains how {APP_NAME} collects and uses your personal data, in line with the Nigeria Data
        Protection Act 2023 (NDPA).
      </p>
      <h2>What we collect</h2>
      <p>
        Your email address, date of birth, display name, language preference, the partner you create, your chat
        messages, message counts, and payment status (we never see or store your card or bank details; our payment provider processes
        payments).
      </p>
      <h2>Why we use it</h2>
      <p>
        To provide the service, enforce the 18+ age requirement, keep you safe (including detecting when you may need
        support), process subscriptions, prevent abuse, and understand our costs.
      </p>
      <h2>How we protect it</h2>
      <p>
        Chat messages are encrypted at rest. Access is restricted so that only you can read your data through the app.
        Our AI model provider processes your messages to generate replies.
      </p>
      <h2>Your rights</h2>
      <p>
        You can access, correct or delete your data. Use &ldquo;Delete my account and data&rdquo; in Settings to
        permanently erase your account, chats and partner. You may also contact us or complain to the Nigeria Data
        Protection Commission.
      </p>
      <h2>Contact</h2>
      <p>[Company name, address and data protection contact email]</p>
    </LegalPage>
  );
}
