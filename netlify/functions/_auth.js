// ---------------------------------------------------------------------------
// Minimal signed-token helper shared by the functions below. This is a light
// gate, not full auth: it stops a random visitor from burning your Anthropic
// API quota by hitting identify/refresh directly, using a secret that only
// lives in Netlify env vars (VAULT_TOKEN_SECRET), never in the browser.
// ---------------------------------------------------------------------------
const crypto = require("crypto");

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function createToken(secret) {
  const ts = Date.now().toString();
  const sig = sign(ts, secret);
  return Buffer.from(`${ts}.${sig}`).toString("base64");
}

function verifyToken(token, secret, maxAgeMs = 1000 * 60 * 60 * 24) {
  if (!token || !secret) return false;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const [ts, sig] = decoded.split(".");
    if (!ts || !sig) return false;
    if (sig !== sign(ts, secret)) return false;
    if (Date.now() - Number(ts) > maxAgeMs) return false;
    return true;
  } catch {
    return false;
  }
}

function requireAuth(event) {
  const secret = process.env.VAULT_TOKEN_SECRET;
  const token = event.headers["x-vault-token"] || event.headers["X-Vault-Token"];
  return verifyToken(token, secret);
}

module.exports = { createToken, verifyToken, requireAuth };
