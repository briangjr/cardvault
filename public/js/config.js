// ---------------------------------------------------------------------------
// Public, client-side config.
//
// The Supabase "anon" key below is DESIGNED to be public — it is safe to ship
// in frontend code. What keeps this app private is (a) the passcode gate in
// front of the UI, and (b) nobody else knowing your Supabase/Netlify URLs.
// Your real secret — the Anthropic API key — never goes here; it lives only
// as a Netlify environment variable used by the serverless functions.
//
// Fill these two values in after you create your Supabase project
// (see README.md "Set up Supabase").
// ---------------------------------------------------------------------------
window.CARD_VAULT_CONFIG = {
  SUPABASE_URL: "https://wuombxgemgikjmuulo.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_V38pgJUoTKg6d5UzrHJx_A_tLdycmbj",
  STORAGE_BUCKET: "card-images",
};
