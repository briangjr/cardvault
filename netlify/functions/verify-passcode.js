const { createToken } = require("./_auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const expected = process.env.VAULT_PASSCODE;
  const secret = process.env.VAULT_TOKEN_SECRET;
  if (!expected || !secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server isn't configured yet — set VAULT_PASSCODE and VAULT_TOKEN_SECRET in your Netlify site's environment variables.",
      }),
    };
  }

  let passcode;
  try {
    passcode = JSON.parse(event.body || "{}").passcode;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad request." }) };
  }

  if (passcode !== expected) {
    return { statusCode: 401, body: JSON.stringify({ error: "Incorrect passcode." }) };
  }

  return { statusCode: 200, body: JSON.stringify({ token: createToken(secret) }) };
};
