// ---------------------------------------------------------------------------
// Pure-ish rendering helpers: turn card / AI-result data into HTML strings.
// Kept separate from app.js so the DOM-wiring logic stays readable.
// ---------------------------------------------------------------------------
const Render = (() => {
  function formatMoney(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n >= 1000 ? 0 : 2,
    }).format(n);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function psaGradeClass(gradeMid) {
    if (gradeMid >= 8.5) return "grade-high";
    if (gradeMid >= 6) return "grade-mid";
    return "grade-low";
  }

  function sportLabel(sport) {
    const map = { football: "NFL", basketball: "NBA", baseball: "MLB" };
    return map[sport] || (sport ? sport[0].toUpperCase() + sport.slice(1) : "Other");
  }

  function cardTile(card) {
    const mid = ((card.psa_grade_low || 0) + (card.psa_grade_high || 0)) / 2;
    const psaBadge = card.psa_grade_low
      ? `<span class="psa-badge ${psaGradeClass(mid)}">PSA ${card.psa_grade_low}${
          card.psa_grade_high && card.psa_grade_high !== card.psa_grade_low ? "–" + card.psa_grade_high : ""
        } est.</span>`
      : "";
    return `
      <div class="card-tile" data-id="${card.id}">
        <img class="card-tile-img" src="${escapeHtml(card.front_image_url)}" alt="${escapeHtml(card.player)}" loading="lazy" />
        <div class="card-tile-body">
          <p class="card-tile-name">${escapeHtml(card.player || "Unknown player")}</p>
          <p class="card-tile-meta">${escapeHtml(card.year || "")} ${escapeHtml(card.set_name || "")} ${
      card.card_number ? "#" + escapeHtml(card.card_number) : ""
    }</p>
          <div class="card-tile-footer">
            <span class="card-tile-value">${formatMoney(card.value_mid)}</span>
            ${psaBadge}
          </div>
        </div>
      </div>`;
  }

  function cardGrid(cards) {
    return cards.map(cardTile).join("");
  }

  function psaCatBar(score) {
    const pct = Math.max(0, Math.min(10, score)) * 10;
    const color = score >= 8.5 ? "var(--good)" : score >= 6 ? "var(--mid)" : "var(--low)";
    return `<div class="psa-cat-bar"><div style="width:${pct}%; background:${color};"></div></div>`;
  }

  function psaSection(psa) {
    if (!psa) return "";
    const mid = ((psa.grade_low || 0) + (psa.grade_high || 0)) / 2;
    const cats = psa.categories || {};
    const catRows = Object.entries(cats)
      .map(
        ([name, c]) => `
        <div class="psa-cat">
          <div class="psa-cat-head"><span>${escapeHtml(name[0].toUpperCase() + name.slice(1))}</span><span>${c.score}/10</span></div>
          ${psaCatBar(c.score)}
          <p class="psa-cat-note">${escapeHtml(c.note || "")}</p>
        </div>`
      )
      .join("");

    return `
      <div class="result-section">
        <h3>Estimated PSA grade</h3>
        <div class="psa-hero">
          <div class="psa-grade-circle ${psaGradeClass(mid)}">
            ${psa.grade_low}${psa.grade_high && psa.grade_high !== psa.grade_low ? "–" + psa.grade_high : ""}
            <span>est. grade</span>
          </div>
          <p class="muted" style="font-size:13px; margin:0;">${escapeHtml(psa.summary || "")}</p>
        </div>
        <div class="psa-breakdown">${catRows}</div>
        <p class="psa-disclaimer">⚠️ This is Claude's visual estimate from your photos only — centering, corners, edges, and surface as the camera sees them. It is <strong>not an official PSA grade</strong>. Lighting, glare, and photo angle can all shift this. Submit to PSA for a real grade.</p>
      </div>`;
  }

  function valueSection(value) {
    if (!value) return "";
    const comps = (value.comps || [])
      .map(
        (c) => `
        <div class="comp-row">
          <span>${escapeHtml(c.description || c.source || "Sale")} ${c.date ? "· " + escapeHtml(c.date) : ""}</span>
          <span class="comp-price">${c.url ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${formatMoney(c.price)}</a>` : formatMoney(c.price)}</span>
        </div>`
      )
      .join("");

    return `
      <div class="result-section">
        <h3>Estimated value</h3>
        <div class="value-hero">
          <span class="big-value">${formatMoney(value.estimate_low)}–${formatMoney(value.estimate_high)}</span>
        </div>
        <p class="value-caption">${escapeHtml(value.basis || "")} ${value.as_of ? "· as of " + escapeHtml(value.as_of) : ""}</p>
        ${comps ? `<div class="comps-list">${comps}</div>` : `<p class="muted" style="font-size:13px;">No comparable recent sales were found — this estimate is a rough ballpark.</p>`}
      </div>`;
  }

  function fieldsSection(card) {
    return `
      <div class="result-section">
        <h3>Card details <span style="opacity:.6; font-weight:400;">(tap to fix anything)</span></h3>
        ${editableRow("player", "Player", card.player)}
        ${editableRow("team", "Team", card.team)}
        ${editableRow("sport", "Sport", card.sport)}
        ${editableRow("year", "Year", card.year)}
        ${editableRow("set_name", "Set", card.set_name)}
        ${editableRow("card_number", "Card #", card.card_number)}
        ${editableRow("parallel", "Parallel / variant", card.parallel)}
        ${editableRow("features", "Features", card.features)}
      </div>`;
  }

  function editableRow(field, label, value) {
    const v = Array.isArray(value) ? value.join(", ") : value || "";
    return `
      <div class="field-row">
        <span class="field-label">${escapeHtml(label)}</span>
        <input data-field="${field}" value="${escapeHtml(v)}" />
      </div>`;
  }

  function confidenceNote(card) {
    if (!card.identification_confidence || card.identification_confidence === "high") return "";
    return `<p class="psa-disclaimer" style="margin-bottom:14px;">🔍 Identification confidence: <strong>${escapeHtml(
      card.identification_confidence
    )}</strong>. ${escapeHtml(card.identification_notes || "Double-check the details below before saving.")}</p>`;
  }

  function resultsView(result) {
    return `
      ${confidenceNote(result.card)}
      ${fieldsSection(result.card)}
      ${valueSection(result.value)}
      ${psaSection(result.psa_estimate)}
    `;
  }

  function detailView(card) {
    const mid = (card.value_low + card.value_high) / 2;
    const edgeThumbs = (card.edge_image_urls || [])
      .map((u) => `<img src="${escapeHtml(u)}" />`)
      .join("");

    return `
      <div class="detail-photos">
        <img src="${escapeHtml(card.front_image_url)}" alt="Front" />
        <img src="${escapeHtml(card.back_image_url)}" alt="Back" />
      </div>
      ${edgeThumbs ? `<div class="detail-edges">${edgeThumbs}</div>` : ""}

      <div class="result-section" style="margin-top:14px;">
        <h3>Card details</h3>
        <div class="field-row"><span class="field-label">Player</span><span class="field-value">${escapeHtml(card.player)}</span></div>
        <div class="field-row"><span class="field-label">Team</span><span class="field-value">${escapeHtml(card.team)}</span></div>
        <div class="field-row"><span class="field-label">Sport</span><span class="field-value">${sportLabel(card.sport)}</span></div>
        <div class="field-row"><span class="field-label">Year</span><span class="field-value">${escapeHtml(card.year)}</span></div>
        <div class="field-row"><span class="field-label">Set</span><span class="field-value">${escapeHtml(card.set_name)}</span></div>
        <div class="field-row"><span class="field-label">Card #</span><span class="field-value">${escapeHtml(card.card_number)}</span></div>
        <div class="field-row"><span class="field-label">Parallel</span><span class="field-value">${escapeHtml(card.parallel)}</span></div>
        <div class="field-row"><span class="field-label">Features</span><span class="field-value">${escapeHtml((card.features || []).join(", "))}</span></div>
      </div>

      ${valueSection({
        estimate_low: card.value_low,
        estimate_high: card.value_high,
        basis: card.value_basis,
        as_of: card.value_as_of,
        comps: card.value_comps,
      })}

      ${psaSection({
        grade_low: card.psa_grade_low,
        grade_high: card.psa_grade_high,
        categories: card.psa_categories,
        summary: card.psa_summary,
      })}

      <div class="detail-actions">
        <button class="btn btn-secondary btn-block" id="btn-refresh-value">Refresh value</button>
        <button class="btn btn-ghost btn-block" id="btn-edit-card">Edit details</button>
      </div>
    `;
  }

  return { formatMoney, escapeHtml, psaGradeClass, sportLabel, cardGrid, resultsView, detailView, valueSection, psaSection };
})();
