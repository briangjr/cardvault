const { requireAuth } = require("./_auth");
const { callClaude, extractJson } = require("./_anthropic");

const SYSTEM_PROMPT = `You are a sports trading card market research assistant. You will be given the identifying details of ONE specific card already in a collector's inventory (no photos this time). Use the web_search tool to find REAL, RECENT comparable sales for this exact card (same player/year/set/parallel/card number), preferring a raw/ungraded copy unless told otherwise. Prefer actual completed/sold listings over active asking prices. Cite 2-5 concrete comps with price, approximate date, and source URL when you can find them.

Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly:

{
  "value": {
    "estimate_low": number,
    "estimate_high": number,
    "currency": "USD",
    "basis": string,
    "as_of": "YYYY-MM-DD",
    "comps": [ { "description": string, "price": number, "date": "YYYY-MM-DD", "url": string } ]
  }
}`;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  if (!requireAuth(event)) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Bad request." }) };
  }

  const card = body.card || {};
  const description = [card.year, card.set_name, card.parallel, card.player, card.card_number ? `#${card.card_number}` : "", card.team, Array.isArray(card.features) ? card.features.join(", ") : ""]
    .filter(Boolean)
    .join(" ");

  if (!description) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing card details." }) };
  }

  const content = [
    {
      type: "text",
      text: `Card: ${description}\nSport: ${card.sport || "unknown"}\n\nFind current recent comparable sales and respond with only the JSON object described in your instructions.`,
    },
  ];

  try {
    const { text } = await callClaude({ system: SYSTEM_PROMPT, content, maxTokens: 1500, webSearch: true });
    const result = extractJson(text);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message || "Couldn't refresh the value right now." }) };
  }
};
