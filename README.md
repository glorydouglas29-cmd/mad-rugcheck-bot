# Mad Rugcheck Bot — Phase 1

Telegram bot that scans any Solana token CA for mint authority, freeze authority,
and top holder concentration. Reply arrives as a formatted risk card.

Phase 2 (not built yet): LP lock/burn detection, sniper/bundler clustering, deployer
wallet history.

## Setup (no CLI required)

**1. Create the Telegram bot**
- Message @BotFather on Telegram → `/newbot` → follow prompts
- Save the bot token it gives you

**2. Push this code to GitHub**
- Create a new public repo, upload these files through the GitHub web UI
  (drag-and-drop or "Add file" → "Upload files")

**3. Connect to Cloudflare**
- Cloudflare dashboard → Workers & Pages → Create → Connect to Git
- Pick this repo, set build output as-is (no build command needed, this is a plain Worker)

**4. Create the KV namespace**
- Cloudflare dashboard → Workers & Pages → KV → Create namespace → name it `RUGCHECK_KV`
- Copy the namespace ID it gives you
- Edit `wrangler.jsonc` in the repo (via GitHub web UI) and replace
  `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` with that ID, commit — this triggers a redeploy
  and the binding will now survive future redeploys automatically

**5. Set secrets**
- Worker → Settings → Variables and Secrets → add as **secrets** (not plain vars):
  - `HELIUS_API_KEY` — create a NEW Helius account/key for this bot, separate from
    Whale Watch and Reputation Bot, so credit usage doesn't collide
  - `TELEGRAM_BOT_TOKEN` — from step 1
  - `TELEGRAM_WEBHOOK_SECRET` — make up any random string, this just verifies
    incoming requests are actually from Telegram

**6. Register the webhook**
Paste this URL in a browser once (replace the placeholders):
```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-worker-subdomain>.workers.dev&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```
You should get `{"ok":true,"result":true,...}` back.

**7. Test it**
Message your bot on Telegram with any Solana token CA. You should get a risk card back.

## File structure

```
wrangler.jsonc       - Worker config, KV binding
src/index.js          - Webhook handler, entry point
src/helius.js         - Helius RPC calls (mint info, top holders, metadata)
src/risk-engine.js    - Scoring logic
src/kv-cache.js       - Short-TTL scan result caching
src/telegram.js       - Send message + format risk card
```

## Known limitations (phase 1)

- No LP lock/burn check yet — a token can look fine on mint/freeze/holders and
  still have an unlocked LP. Don't treat a low score as "safe," treat it as
  "cleared the basic checks."
- Top holder concentration uses a heuristic to guess which holder is the LP pool
  (if the #1 holder has 3x+ the #2 holder's balance, it's assumed to be the pool
  and excluded from the top-10 sum). This can misfire on tokens with one very
  large legitimate holder.
- `getTokenLargestAccounts` caps at 20 holders — fine for concentration scoring,
  not a full holder list.
