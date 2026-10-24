# Heartline: AI companion app

"A partner who helps you get ready for real love." An AI boyfriend or girlfriend who also coaches users on dating
and relationships. Africa-first: Nigerian context, Pidgin support, Naira pricing via Bachs (card or bank transfer).

`Heartline` is a placeholder name; change it in `src/lib/brand.ts`.

## Stack

Next.js 15 (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, RLS) · Anthropic API behind a
provider-agnostic wrapper (`src/lib/llm.ts`) · Bachs payments (Paystack kept as a fallback) · Vercel.

## Pricing and allowances

| Plan | Price | Billing | Daily message cap |
|---|---|---|---|
| Free | ₦0 | none | 10 on signup day, then 3/day |
| 2 Weeks | ₦1,500 | one-time pass (does not renew) | 60 |
| Monthly | ₦2,500 | one-time 30-day pass (does not renew) | 100 |
| 6 Months / Yearly | ₦12,000 / ₦21,000 | seeded but `active = false` | 120 |

* Prices, caps and features live in the `plans` table, so you can change them without a deploy.
* Longer plans are always cheaper per day (₦107 → ₦83 → ₦66 → ₦58).
* **Every plan is a pass.** Bachs can't bill Naira subscriptions yet (its subscriptions are USD-card only), so
  each payment adds the plan's days and early renewals stack on top of the time left. Users can pay by Nigerian
  card **or bank transfer**, which suits how many Nigerians pay. A banner in chat reminds users in the last 3 days
  of a pass and for a week after it ends.
* If Bachs enables NGN subscriptions on your account, the monthly plan can go back to auto-renewing; see
  "Payment providers" below.
* Every paid plan gets the same core features. Longer plans add bonuses (coins, exclusive items) instead of withholding
  core features.
* Daily limits reset at midnight Africa/Lagos.
* Turn on 6-month/yearly once you have about 60 days of retention data: set `active = true`.

## Setup

1. **Install:** `npm install`
2. **Supabase:** create a project, then run `supabase/migrations/0001_phase1.sql` and then
   `0002_phase2.sql` and `0003_bachs.sql` in the SQL editor (or use `supabase db push`).
   * Auth → Providers: enable Email and Google.
   * Auth → URL configuration: add `http://localhost:3000/auth/callback` and your production `/auth/callback` URL.
3. **Bachs** (sign up at https://app.bachs.io/signup; build in the sandbox, then go live by swapping keys):
   * Developers → API keys: copy a sandbox secret key (`sk_sandbox_...`) into `BACHS_API_KEY`.
   * Developers → Webhooks: add `https://<your-domain>/api/payments/bachs/webhook`, subscribed to
     `collection.succeeded`. Copy its signing secret (`whsec_...`) into `BACHS_WEBHOOK_SECRET`.
   * Make sure the NGN card and NGN bank transfer methods are enabled on your account.
   * No products need creating: checkouts are created from the prices in the `plans` and `coin_packs` tables.
   * Locally: Bachs refuses `localhost` return URLs, so set `NEXT_PUBLIC_APP_URL` to a public tunnel or deployment.
     To receive webhooks locally, run `bachs listen --forward-to localhost:3000/api/payments/bachs/webhook
     --events collection.succeeded` and use the secret the CLI prints.
   * Going live: verify your account, switch to an `sk_live_` key with `BACHS_API_URL=https://api.bachs.io`, and
     register the production webhook.
4. **Env:** `cp .env.example .env.local` and fill in the values below.
5. **Run:** `npm run dev`, then open http://localhost:3000.

### Environment variables

| Variable | Where it comes from | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | your domain | Payment return URLs. Must be public (Bachs refuses localhost) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API | Safe in the browser; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API | **Server only.** Bypasses RLS |
| `MESSAGE_ENCRYPTION_KEY` | `openssl rand -base64 32` | Encrypts chat content. Losing it makes history unreadable; back it up |
| `LLM_PROVIDER` | `anthropic` or `mock` | `mock` gives canned replies, no key needed |
| `ANTHROPIC_API_KEY` | console.anthropic.com | |
| `LLM_MODEL` | see Cost control | Default `claude-opus-5-5` |
| `LLM_UTILITY_MODEL` | optional | Model for memory extraction. Defaults to `LLM_MODEL` |
| `PAYMENT_PROVIDER` | `bachs` or `paystack` | Default `bachs` |
| `BACHS_API_URL` | Bachs docs | `https://sandbox-api.bachs.io` (default) or `https://api.bachs.io` for live |
| `BACHS_API_KEY` | Bachs → API keys | **Server only.** `sk_sandbox_...` or `sk_live_...` |
| `BACHS_WEBHOOK_SECRET` | Bachs → Webhooks | `whsec_...`, verifies `X-Bachs-Signature-V2` |
| `PAYSTACK_SECRET_KEY` | Paystack → API Keys | Only if `PAYMENT_PROVIDER=paystack` |
| `ADMIN_EMAILS` | you | Comma-separated emails that can open `/admin` |
| `NGN_PER_USD` | current rate | Used to show AI costs in Naira on `/admin`. Default 1500 |

## Tests

```bash
npm test
```

Covers the four required areas: the free message limit (`tests/freeLimit.test.ts`), the paywall lock
(`tests/paywall.test.ts`), webhook subscription updates (`tests/webhook.test.ts`) and the crisis detection trigger
(`tests/crisis.test.ts`). It also covers moderation, the age gate, encryption and the persona rules.

Phase 2 tests: memory extraction and retrieval (`memory.test.ts`), gift triggers (`gifts.test.ts`), coin
purchases and bonus coins (`coins.test.ts`), the wardrobe shop and avatar studio (`shop.test.ts`, which also checks
that the catalogue matches the database seed), and the admin metrics (`admin.test.ts`). Bachs payments (`bachs.test.ts`): signature checks including secret
rotation and replay windows, kobo/decimal conversion, passes, coins, duplicate delivery and the renewal reminder.
The core logic (`handleChat`, `handleBachsWebhook`, `handlePaystackWebhook`) takes its database and LLM as injected dependencies, so tests run against
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
* **Billing** (`src/lib/billing/`):
  * `/api/checkout` prices the plan or coin pack from the database and creates a hosted checkout. On Bachs that's a
    raw-amount NGN checkout limited to Nigerian card and bank transfer, created with an `Idempotency-Key`.
  * `/api/payments/bachs/webhook` verifies `X-Bachs-Signature-V2` (HMAC-SHA256, 5-minute replay window, secret
    rotation supported) and handles `collection.succeeded`.
  * Every provider's payments go through one function, `applyPayment`. It checks the amount and currency against
    the database price and applies each payment only once (`payment_events`), whether it arrives by webhook,
    redelivery, or the callback page.
  * `/billing/callback` reads the payment from the provider directly, so access starts even if the webhook is slow.
    Bank transfers can take a few minutes to confirm; the page says so.
* **Safety:** crisis messages log a `safety_events` row (type only, no content), add a care instruction to the
  prompt, and show the helpline card. AI messages have a Report button.
* **Privacy:**
  * RLS on every table; users can't edit their own DOB or blocked flag.
  * Chat content is AES-256-GCM encrypted by the app.
  * "Delete my account" cancels any Paystack subscription and then deletes the auth user. Every table cascades from
    `auth.users`, so all of the user's data is hard-deleted.

## Payment providers

`PAYMENT_PROVIDER` picks the gateway. Both feed the same `applyPayment`, so plans, coins, limits and the admin
dashboard work the same either way.

| | Bachs (default) | Paystack |
|---|---|---|
| NGN card | ✓ | ✓ |
| NGN bank transfer | ✓ | ✓ |
| NGN auto-renewing subscriptions | ✗ (USD cards only today) | ✓ |
| Webhook route | `/api/payments/bachs/webhook` | `/api/paystack/webhook` |

To auto-renew the monthly plan, either ask Bachs to enable NGN subscriptions on your account, or switch to Paystack:
set `PAYMENT_PROVIDER=paystack`, create a ₦2,500 monthly plan in Paystack, then run
`update plans set billing = 'recurring', paystack_plan_code = 'PLN_xxx' where id = 'monthly';`. The checkout route
refuses to sell a recurring plan on a provider that can't renew it.

## Phase 2 features

| Feature | Who gets it | Where |
|---|---|---|
| Long-term memory | Everyone (see note) | `src/lib/memory/`, Settings → "What X remembers" |
| Coach mode | Everyone | Toggle above the chat input |
| Avatar studio | Paid plans | `/studio`, `src/components/Avatar.tsx` |
| Wardrobe shop and coins | Paid plans | `/shop`, `purchase_item` / `credit_coins` SQL functions |
| Gifts from the character | Paid plans | `src/lib/gifts/triggers.ts`, 🎁 in the chat header |
| Admin dashboard | `ADMIN_EMAILS` | `/admin`, `admin_metrics()` SQL function |

* **Memory.** After a reply, a background call pulls durable facts out of the user's message and stores them
  encrypted. Messages that don't talk about the user are skipped, and crisis messages are never turned into memories.
  The most relevant facts (up to 15) go into the prompt. Users can see and delete every memory in Settings, and each
  partner keeps at most 100.
  * Memory is on for free users too: being remembered is what makes people pay, and the free tier allows only 3
    messages a day, so the extra cost is small. Set `MEMORY_FOR_FREE_USERS = false` in `src/lib/features.ts` to make it
    paid-only, as the original spec had it.
* **Coach mode** is free because it is the product's positioning ("helps you get ready for real love").
* **Avatars** are layered SVG drawn in code, so there are no image assets to make. Choices:
  * 6 skin tones (darkest first), 9 hairstyles including afro, braids, locs and puff, and 4 body types.
  * Outfits including ankara prints, kaftans, gele and fila.
  * Empty clothing slots fall back to neutral basics, so the avatar is always fully clothed.
* **Coins:**
  * Packs cost ₦500, ₦1,000 and ₦2,500, and bigger packs give more coins per Naira.
  * Monthly subscribers get 150 bonus coins on every charge.
  * Coin purchases are capped at **₦10,000 per user per day**. Companion apps attract emotionally attached users;
    this cap is a deliberate guardrail.
  * Coins are only sold to users on a plan that includes the wardrobe.
  * Every credit and purchase is in an append-only ledger, and replayed webhooks can't credit twice.
* **Gifts** are always free:
  * Triggers: 3-, 7- and 30-day streaks, the user's birthday (from their date of birth; 29 February falls back to
    28 February), 100/500/1,000 messages, and the 1-month and 1-year anniversaries.
  * Each gift is unique per trigger, so re-checking is safe.
  * Outfit gifts the user already owns become coins instead.
  * The character can mention recent gifts but is told never to ask for anything back.
* **Background work** (memory extraction and gift checks) runs after the reply has been sent, using Next.js
  `after()`, so it doesn't slow down chat.

### Deferred from Phase 3 (deliberately)

* **Voice (TTS):** text-to-speech for each reply would likely cost more than the reply itself. Add it only once
  `/admin` shows healthy margins, and as a paid add-on.
* **Native app:** the web app is mobile-first and works on phones. A React Native app is worth building once you
  have retention and conversion data, not before.

## Cost control

Every assistant message stores `input_tokens`, `output_tokens`, `cache_read_tokens` and `cost_usd`, and background
calls (memory extraction) are logged in `llm_usage`. `/admin` shows cost per paying user and gross margin after AI
costs. You can also query it directly:

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
* **Not yet tested end to end** against a live Supabase project and the Bachs sandbox. All three SQL migrations were
  run and checked on Postgres 16 with a stubbed `auth` schema (limits, RLS, coin ledger, purchases, cascading
  deletes).
* **Payment records are deleted with the account.** Nigerian tax rules may require keeping financial records for
  several years. Ask your lawyer whether `payments` should be anonymised instead of deleted.
* **Memory retrieval is keyword-based.** It works well up to the 100-fact cap; move to embeddings if you raise the cap.
* **Gift checks run during chat and on opening the chat page**, not on a schedule, so a birthday gift arrives when
  the user next opens the app. Add a daily cron job if you want push notifications.
