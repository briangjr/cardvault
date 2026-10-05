# Card Vault

A private, mobile-first inventory app for your sports card collection. Scan the front and back of a card (plus optional edge close-ups), and it:

- identifies the card (player, team, year, set, parallel, card number)
- searches the web for recent comparable sales and gives an estimated value range
- gives a rough **visual PSA grade estimate** (clearly labeled as an AI estimate, not a real grade) based on centering, corners, edges, and surface from your photos
- stores everything — including the original full-resolution photos — in your own inventory, with your total collection value at a glance

It's built the same way as your other projects: a static site + Netlify Functions, deployed from GitHub to Netlify. The only new piece is **Supabase**, which is where your card data and photos actually live (free tier is plenty for a personal collection).

## How it's put together

- `public/` — the app itself (HTML/CSS/JS, no build step, no framework)
- `netlify/functions/` — three small serverless functions:
  - `verify-passcode.js` — checks your passcode, hands back a short-lived token
  - `identify-card.js` — sends your photos to Claude (vision + live web search) to identify the card, estimate value, and estimate the PSA grade
  - `refresh-value.js` — re-checks recent sales for a card already in your inventory, without re-sending photos
- `supabase/schema.sql` — the database table + storage bucket your inventory lives in

Your Anthropic API key never touches the browser — it's only ever read inside the Netlify functions, from an environment variable.

## One-time setup

### 1. Create your Supabase project (free)

1. Go to [supabase.com](https://supabase.com) → New project. Pick any name/region, save the database password somewhere.
2. Once it's ready, open **SQL Editor** → New query → paste in the contents of `supabase/schema.sql` → Run. This creates the `cards` table and a public `card-images` storage bucket with the permissions the app needs.
3. Go to **Project Settings → API**. Copy the **Project URL** and the **`anon` public key**.
4. Open `public/js/config.js` and paste them in:
   ```js
   window.CARD_VAULT_CONFIG = {
     SUPABASE_URL: "https://xxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJ...",
     STORAGE_BUCKET: "card-images",
   };
   ```
   This key is meant to be public (it's what Supabase calls the "anon" key) — see **Security notes** below for what that does and doesn't protect.

### 2. Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key.
2. This is pay-as-you-go, no subscription. A single card scan (2-3 images + a grading analysis + a few web searches) typically costs a few cents. Keep an eye on usage under **Billing** if you're scanning a big collection in one sitting.

### 3. Push to GitHub and connect Netlify

Same as your other projects:

1. Create a new GitHub repo and push this folder to it.
2. In Netlify: **Add new site → Import an existing project** → pick the repo.
3. Build settings: publish directory `public`, functions directory `netlify/functions` (already set in `netlify.toml`, Netlify should pick these up automatically — no build command needed).

### 4. Set Netlify environment variables

In Netlify: **Site configuration → Environment variables**, add:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key from step 2 |
| `VAULT_PASSCODE` | any passcode you'll type to open the app, e.g. `246810` |
| `VAULT_TOKEN_SECRET` | any long random string (just mash the keyboard) — used to sign your session, not something you type in |
| `ANTHROPIC_MODEL` *(optional)* | defaults to `claude-sonnet-5` if unset |

Then trigger a deploy (push a commit, or **Deploys → Trigger deploy**).

### 5. Open it on your phone

Visit your Netlify URL on your phone, enter your passcode, and tap "Share → Add to Home Screen" in your browser so it behaves like a regular app icon. The camera input opens your phone's camera directly when you tap "Choose photo" on the scan screens.

## Updating the app later

Same as your other projects: when you want changes, replace the files in your repo with the latest versions and push — Netlify redeploys automatically. `config.js` and your Netlify environment variables don't need to be touched again unless you rotate a key.

## Good photos = good results

- Flat surface, even lighting, no glare across the card face.
- Fill the frame with the card — crop in close rather than photographing it from far away.
- For the PSA estimate, the optional close-up edge/corner photos matter a lot — a single full-card photo usually isn't sharp enough to judge whitening on an edge.

## Known limitations (read this)

- **The PSA estimate is a rough visual guess from your photos** — lighting, glare, and camera angle all shift it. It is not, and can't replace, an actual PSA submission. The app labels it as an estimate everywhere it appears.
- **The value estimate is AI-researched, not a live price feed.** Claude searches the web for recent comps at the moment you scan, but it can miss listings, misjudge a parallel, or (rarely) find nothing and fall back to a rough ballpark — the "basis" text under the value always says what it actually found. Use "Refresh value" on a card's detail page to re-check later.
- **Function timeout:** identifying a card calls Claude with several images plus live web searches, which can take 15-25 seconds — occasionally longer with many close-up photos. Netlify's free tier allows up to 10 seconds for a normal function and this can exceed that; if you hit timeouts often, either keep close-ups to 2-3 well-chosen shots, or upgrade your Netlify function timeout (Pro plans support up to 26s, and Background Functions support much longer if you want to convert `identify-card.js` later).
- **Security model:** the passcode screen keeps casual visitors out, and your Anthropic key is safe (server-side only). But the Supabase `anon` key in `config.js` is visible in your browser's page source by design — the database policies in `schema.sql` deliberately allow that key full read/write, since this app has no login system. That's fine as long as you don't share your Netlify URL or Supabase project URL publicly. If you ever want this locked down harder, Supabase Auth is the next step.
- **Card identification can be wrong**, especially for obscure inserts, 1-of-1s, or heavily cropped photos — that's what the editable fields on the review screen are for. Always glance over the identified details before saving.
