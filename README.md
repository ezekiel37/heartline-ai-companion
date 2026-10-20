# Heartline: AI companion app

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
2. **Supabase:** create a project, then run `supabase/migrations/0001_phase1.sql` and then
   `0002_phase2.sql` in the SQL editor (or use `supabase db push`).
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
| `LLM_UTILITY_MODEL` | optional | Model for memory extraction. Defaults to `LLM_MODEL` |
| `PAYSTACK_SECRET_KEY` | Paystack → API Keys | Also used to verify webhook signatures |
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
that the catalogue matches the database seed), and the admin metrics (`admin.test.ts`). The core logic
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
* **Not yet tested end to end** against a live Supabase project and Paystack test mode. Both SQL migrations were
  run and checked on Postgres 16 with a stubbed `auth` schema (limits, RLS, coin ledger, purchases, cascading
  deletes).
* **Payment records are deleted with the account.** Nigerian tax rules may require keeping financial records for
  several years. Ask your lawyer whether `payments` should be anonymised instead of deleted.
* **Memory retrieval is keyword-based.** It works well up to the 100-fact cap; move to embeddings if you raise the cap.
* **Gift checks run during chat and on opening the chat page**, not on a schedule, so a birthday gift arrives when
  the user next opens the app. Add a daily cron job if you want push notifications.
