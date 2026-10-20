# Heartline: AI companion app (Phase 1)

"A partner who helps you get ready for real love." An AI boyfriend or girlfriend who also coaches users on dating
and relationships. Africa-first: Nigerian context, Pidgin support, Naira pricing via Paystack.

`Heartline` is a placeholder name; change it in `src/lib/brand.ts`.

## Stack

Next.js 15 (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, RLS) · Anthropic API behind a
provider-agnostic wrapper (`src/lib/llm.ts`) · Paystack · Vercel.

## Pricing and allowances

| Plan | Price | Billing | Daily message cap |
|---|---|---|---|
| Free | ₦0 | none | 10 on signup day, then 3/day |
| 2 Weeks | ₦1,500 | one-time pass (does not renew) | 60 |
| Monthly | ₦2,500 | Paystack recurring subscription | 100 |
| 6 Months / Yearly | ₦12,000 / ₦21,000 | seeded but `active = false` | 120 |

* Prices, caps and features live in the `plans` table, so you can change them without a deploy.
* Longer plans are always cheaper per day (₦107 → ₦83 → ₦66 → ₦58).
* **Paystack has no 2-week billing interval.** That's why the 2-week plan is a pass: each payment adds 14 days and
  passes stack. It also fits how many Nigerians pay (transfer/USSD, no saved card).
* Every paid plan gets the same core features. Longer plans add bonuses (coins, exclusive items) instead of withholding
  core features.
* Daily limits reset at midnight Africa/Lagos.
* Turn on 6-month/yearly once you have about 60 days of retention data: set `active = true` and create the Paystack plans.

## Setup

1. **Install:** `npm install`
2. **Supabase:** create a project, then run `supabase/migrations/0001_phase1.sql` in the SQL editor (or use
   `supabase db push`).
   * Auth → Providers: enable Email and Google.
   * Auth → URL configuration: add `http://localhost:3000/auth/callback` and your production `/auth/callback` URL.
3. **Paystack:**
   * Dashboard → Plans: create a **Monthly** plan at ₦2,500 (interval: monthly). Copy its plan code and run
     `update plans set paystack_plan_code = 'PLN_xxx' where id = 'monthly';`.
   * Settings → API Keys & Webhooks: set the webhook URL to `https://<your-domain>/api/paystack/webhook`.
   * For local webhook testing, tunnel with e.g. `ngrok http 3000`.
4. **Env:** `cp .env.example .env.local` and fill in the values below.
5. **Run:** `npm run dev`, then open http://localhost:3000.

### Environment variables

| Variable | Where it comes from | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | your domain | Used to build the Paystack callback URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API | Safe in the browser; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API | **Server only.** Bypasses RLS |
| `MESSAGE_ENCRYPTION_KEY` | `openssl rand -base64 32` | Encrypts chat content. Losing it makes history unreadable; back it up |
| `LLM_PROVIDER` | `anthropic` or `mock` | `mock` gives canned replies, no key needed |
| `ANTHROPIC_API_KEY` | console.anthropic.com | |
| `LLM_MODEL` | see Cost control | Default `claude-opus-5-5` |
| `PAYSTACK_SECRET_KEY` | Paystack → API Keys | Also used to verify webhook signatures |

## Tests

```bash
npm test
```

Covers the four required areas: the free message limit (`tests/freeLimit.test.ts`), the paywall lock
(`tests/paywall.test.ts`), webhook subscription updates (`tests/webhook.test.ts`) and the crisis detection trigger
(`tests/crisis.test.ts`). It also covers moderation, the age gate, encryption and the persona rules. The core logic
(`handleChat`, `handlePaystackWebhook`) takes its database and LLM as injected dependencies, so tests run against
in-memory fakes with no network calls.

## How it works

* **Chat** (`src/app/api/chat/route.ts` → `src/lib/chat/handleChat.ts`):
  1. Authenticate, then check the age gate.
  2. Compute the user's daily allowance and consume one message atomically with the `consume_message` SQL function.
  3. Run crisis detection and input moderation.
  4. Build the persona prompt and stream the reply as NDJSON events.
  5. Moderate the output while it streams.
  6. Save the reply encrypted, with token counts and cost.
  7. If the model call fails, give the message back to the user's allowance.
* **Paywall:** the server returns 402 when a free user is out of messages and 429 when a subscriber hits the
  fair-use cap. The UI locks the input and shows the plans. The character's prompt forbids mentioning payments.
* **Billing** (`src/lib/billing/handleWebhook.ts`):
  * Handles `charge.success`, `subscription.create`, `invoice.payment_failed`, `subscription.not_renew` and
    `subscription.disable`.
  * Verifies the HMAC-SHA512 signature, checks the amount and currency, and applies each payment reference only once
    (`payment_events`).
  * `/billing/callback` also verifies the transaction directly with Paystack, so access starts even if the webhook is
    slow.
* **Safety:** crisis messages log a `safety_events` row (type only, no content), add a care instruction to the
  prompt, and show the helpline card. AI messages have a Report button.
* **Privacy:**
  * RLS on every table; users can't edit their own DOB or blocked flag.
  * Chat content is AES-256-GCM encrypted by the app.
  * "Delete my account" cancels the Paystack subscription and then deletes the auth user. Every table cascades from
    `auth.users`, so all of the user's data is hard-deleted.

## Cost control

Every assistant message stores `input_tokens`, `output_tokens`, `cache_read_tokens` and `cost_usd`. Cost per user:

```sql
select user_id, sum(cost_usd) as usd, count(*) as replies
from messages where role = 'assistant' and created_at > now() - interval '30 days'
group by user_id order by usd desc;
```

**The model choice decides whether this business makes money.** Estimate with about 3,000 input and 250 output
tokens per message, at roughly ₦1,500/$ (check the current rate):

| Model | Cost per message | Monthly user at 100/day cap (worst case) | Revenue |
|---|---|---|---|
| `claude-opus-5-5` | ~$0.017 | ~$51 (≈ ₦76,000) | ₦2,500 |
| `claude-haiku-5-5` | ~$0.0004 | ~$1.30 (≈ ₦1,900) | ₦2,500 |

The default is `claude-opus-5-5`. At these prices every active subscriber on Opus loses money. Test reply quality on
`claude-haiku-5-5` (including Pidgin) and switch `LLM_MODEL` if it holds up. Other cost levers: context is trimmed to
the last 20 messages, prompt caching is on, and replies run at low effort.

## Known gaps to close before launch

* **Crisis detection is keyword-based** (English and Pidgin). It errs toward showing help but misses indirect
  phrasing. Add a model-based classifier.
* **Moderation is keyword-based.** Add a provider moderation API through `ModerationProvider`.
* **Helplines:** verify every number in `src/lib/safety/helplines.ts` by calling it, and add Nigerian NGO lines.
* **Age gate is self-declared.** A blocked minor can sign up again with a new email and a false DOB. Plug in an age
  verification provider later.
* **Legal:** privacy and terms pages are placeholders for a lawyer to review (NDPA).
* **Not yet tested end to end** against a live Supabase project and Paystack test mode. The SQL migration was run and
  checked on Postgres 16 with a stubbed `auth` schema.
* **Phase 2 is not built:** long-term memory, avatar studio, wardrobe and coins, gifts, coaching mode UI.
