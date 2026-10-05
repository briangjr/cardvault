const { requireAuth } = require("./_auth");
const { callClaude, extractJson } = require("./_anthropic");

const SYSTEM_PROMPT = `You are a meticulous sports trading card expert and grader, helping a collector catalog their personal inventory.

You will be shown a photo of the FRONT of a card, a photo of the BACK of a card, and optionally one or more close-up photos of edges/corners/surface. From these photos you must:

1. IDENTIFY the card as precisely as possible: sport, player, team, year, manufacturer, set name, card number, parallel/insert name, and notable features (rookie card, autograph, memorabilia/patch, serial numbering visible, etc). If anything is genuinely ambiguous from the images, make your best judgment call and lower your confidence rather than refusing.

2. Use the web_search tool to find REAL, RECENT comparable sales for this exact card (same player/year/set/parallel/number), for a RAW / UNGRADED copy unless the images show it is already graded. Prefer actual completed/sold listings (eBay sold listings, 130point.com, CardLadder, PSA/eBay market data) over active asking prices. Cite 2-5 concrete comps with a price, approximate date, and source URL when you can find them. If you truly can't find this specific card, search for the closest reasonable comp (same player/set/year, different parallel) and say so plainly in "basis".

3. Estimate a PSA grade PURELY from what is visible in the photos: centering (front and back, as a rough ratio), corner sharpness/wear, edge whitening/chipping, and surface (scratches, print dots, scuffs, glare artifacts). Score each category 1-10 and give an overall estimated grade range on the 1-10 PSA scale. Be conservative and honest — note when photo quality, glare, or missing close-ups limit your confidence. This is explicitly a rough visual estimate, never an official grade, and you should say so.

Respond with ONLY valid JSON (no markdown fences, no commentary before or after) matching exactly this shape:

{
  "card": {
    "sport": "football" | "basketball" | "baseball" | "other",
    "player": string,
    "team": string,
    "year": string,
    "manufacturer": string,
    "set_name": string,
    "card_number": string,
    "parallel": string,
    "features": string[],
    "identification_confidence": "high" | "medium" | "low",
    "identification_notes": string
  },
  "value": {
    "estimate_low": number,
    "estimate_high": number,
    "currency": "USD",
    "basis": string,
    "as_of": "YYYY-MM-DD",
    "comps": [ { "description": string, "price": number, "date": "YYYY-MM-DD", "url": string } ]
  },
  "psa_estimate": {
    "grade_low": number,
    "grade_high": number,
    "confidence": "high" | "medium" | "low",
    "categories": {
      "centering": { "score": number, "note": string },
      "corners": { "score": number, "note": string },
      "edges": { "score": number, "note": string },
      "surface": { "score": number, "note": string }
    },
    "summary": string
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

  const { front, back, edges = [] } = body;
  if (!front?.base64 || !back?.base64) {
    return { statusCode: 400, body: JSON.stringify({ error: "Front and back photos are both required." }) };
  }

  const content = [
    { type: "text", text: "FRONT of the card:" },
    { type: "image", source: { type: "base64", media_type: front.mediaType || "image/jpeg", data: front.base64 } },
    { type: "text", text: "BACK of the card:" },
    { type: "image", source: { type: "base64", media_type: back.mediaType || "image/jpeg", data: back.base64 } },
  ];

  edges.forEach((img, i) => {
    content.push({ type: "text", text: `Close-up photo ${i + 1} (edge/corner/surface detail):` });
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType || "image/jpeg", data: img.base64 } });
  });

  content.push({
    type: "text",
    text: "Identify this card, search for recent comparable sales, and give a visual PSA grade estimate. Respond with only the JSON object described in your instructions.",
  });

  try {
    const { text } = await callClaude({ system: SYSTEM_PROMPT, content, maxTokens: 3000, webSearch: true });
    const result = extractJson(text);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message || "Couldn't identify this card right now." }) };
  }
};
