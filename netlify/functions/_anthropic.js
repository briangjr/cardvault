// ---------------------------------------------------------------------------
// Small wrapper around the Anthropic Messages API using plain fetch (no SDK
// dependency to install/keep in sync). Used by identify-card.js and
// refresh-value.js.
//
// Model: configurable via ANTHROPIC_MODEL env var so you can bump it later
// without a code change. Check https://docs.claude.com/en/docs/about-claude/models
// for the current model names if you want to change the default below.
// ---------------------------------------------------------------------------
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";

async function callClaude({ system, content, maxTokens = 2500, webSearch = true, timeoutMs = 28000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Server isn't configured yet — set ANTHROPIC_API_KEY in your Netlify site's environment variables.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content }],
        tools: webSearch ? [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }] : undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `Anthropic API error (${res.status})`;
      throw new Error(msg);
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const sources = (data.content || [])
      .filter((b) => b.type === "web_search_tool_result")
      .flatMap((b) => (Array.isArray(b.content) ? b.content : []))
      .filter((r) => r.type === "web_search_result")
      .map((r) => ({ title: r.title, url: r.url }));

    return { text, sources, raw: data };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("The AI took too long to respond. Try again, or with fewer close-up photos.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Claude is told to return ONLY JSON, but strip code fences / stray text
// defensively in case it doesn't.
function extractJson(text) {
  if (!text) throw new Error("Empty response from the AI.");
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Couldn't parse the AI's response.");
  const jsonSlice = cleaned.slice(start, end + 1);
  return JSON.parse(jsonSlice);
}

module.exports = { callClaude, extractJson };
