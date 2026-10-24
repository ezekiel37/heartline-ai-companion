-- Bachs payment gateway.
-- Bachs can't bill NGN subscriptions yet (USD cards only), so the monthly plan
-- becomes a 30-day pass like the 2-week one: pay once, by card or bank
-- transfer, and renew manually. Reverse the update to go back to a Paystack
-- recurring plan (PAYMENT_PROVIDER=paystack).

alter table public.subscriptions rename column paystack_ref to payment_ref;

update public.plans set billing = 'pass' where id = 'monthly';
