// ---------------------------------------------------------------------------
// Main app logic: view routing, the scan flow, and wiring everything to
// Supabase (storage + db) and the Netlify functions (AI identify/refresh).
// ---------------------------------------------------------------------------
(() => {
  const FN = {
    verify: "/.netlify/functions/verify-passcode",
    identify: "/.netlify/functions/identify-card",
    refresh: "/.netlify/functions/refresh-value",
  };
  const TOKEN_KEY = "cardvault_token";
  const MAX_EDGE_PHOTOS = 6;

  const state = {
    cards: [],
    filters: { sport: "all", search: "", sort: "recent" },
    flow: { frontFile: null, backFile: null, edgeFiles: [], result: null },
    currentDetailId: null,
  };

  // ---------- small DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showToast(msg, ms = 2600) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (el.hidden = true), ms);
  }

  function showView(id) {
    $$(".view").forEach((v) => v.classList.remove("is-active"));
    $(`#${id}`).classList.add("is-active");
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  async function authedFetch(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vault-token": getToken() || "" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      showGate();
      throw new Error("Your session expired — unlock the app again and retry.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }

  // ======================= GATE =======================
  function showGate() {
    $("#app").hidden = true;
    $("#gate").hidden = false;
  }

  async function unlockApp() {
    $("#gate").hidden = true;
    $("#app").hidden = false;
    showView("view-home");
    try {
      await loadCards();
    } catch (e) {
      showToast(e.message || "Couldn't load your inventory.");
    }
  }

  $("#gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const passcode = $("#gate-input").value.trim();
    $("#gate-error").hidden = true;
    if (!passcode) return;
    try {
      const data = await fetch(FN.verify, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      }).then((r) => r.json());
      if (data.token) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        unlockApp();
      } else {
        $("#gate-error").hidden = false;
      }
    } catch {
      $("#gate-error").hidden = false;
    }
  });

  $("#btn-logout").addEventListener("click", () => {
    sessionStorage.removeItem(TOKEN_KEY);
    showGate();
  });

  // ======================= HOME / INVENTORY =======================
  async function loadCards() {
    state.cards = await CardDB.listCards();
    renderHome();
  }

  function applyFiltersSort() {
    let list = state.cards.slice();
    const { sport, search, sort } = state.filters;

    if (sport !== "all") list = list.filter((c) => (c.sport || "other") === sport);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        [c.player, c.team, c.set_name, c.year, c.parallel].filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "value-desc":
        list.sort((a, b) => (b.value_mid || 0) - (a.value_mid || 0));
        break;
      case "value-asc":
        list.sort((a, b) => (a.value_mid || 0) - (b.value_mid || 0));
        break;
      case "name":
        list.sort((a, b) => (a.player || "").localeCompare(b.player || ""));
        break;
      default:
        list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return list;
  }

  function renderHome() {
    const list = applyFiltersSort();
    const grid = $("#card-grid");
    const empty = $("#empty-state");

    if (state.cards.length === 0) {
      empty.hidden = false;
      grid.innerHTML = "";
    } else {
      empty.hidden = true;
      grid.innerHTML = Render.cardGrid(list);
    }

    const total = state.cards.reduce((sum, c) => sum + (c.value_mid || 0), 0);
    $("#totals-value").textContent = Render.formatMoney(total);
    $("#totals-count").textContent = `${state.cards.length} card${state.cards.length === 1 ? "" : "s"}`;
    const latest = state.cards[0];
    $("#totals-updated").textContent = latest
      ? "last added " + new Date(latest.created_at).toLocaleDateString()
      : "—";

    $$(".card-tile").forEach((tile) => {
      tile.addEventListener("click", () => openDetail(tile.dataset.id));
    });
  }

  $("#search-input").addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    renderHome();
  });
  $("#sort-select").addEventListener("change", (e) => {
    state.filters.sort = e.target.value;
    renderHome();
  });
  $("#sport-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$(".chip").forEach((c) => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    state.filters.sport = chip.dataset.sport;
    renderHome();
  });

  // ======================= ADD CARD FLOW =======================
  const STEPS = ["front", "back", "edges", "scanning", "results", "error"];
  const STEP_TITLES = {
    front: "Scan front",
    back: "Scan back",
    edges: "Close-ups (optional)",
    scanning: "Identifying...",
    results: "Review & save",
    error: "Couldn't identify card",
  };

  function resetFlow() {
    state.flow = { frontFile: null, backFile: null, edgeFiles: [], result: null };
    $("#preview-front").hidden = true;
    $("#preview-front").src = "";
    $("#frame-front").classList.remove("has-image");
    $("#frame-front .shot-placeholder").hidden = false;
    $("#preview-back").hidden = true;
    $("#preview-back").src = "";
    $("#frame-back").classList.remove("has-image");
    $("#frame-back .shot-placeholder").hidden = false;
    $("#next-front").disabled = true;
    $("#next-back").disabled = true;
    $("#edge-grid").innerHTML = "";
    $("#input-front").value = "";
    $("#input-back").value = "";
    $("#input-edge").value = "";
  }

  function showStep(step) {
    STEPS.forEach((s) => ($(`#step-${s}`).hidden = s !== step));
    $("#add-step-title").textContent = STEP_TITLES[step];
    const dotsHost = $("#step-dots");
    if (["front", "back", "edges"].includes(step)) {
      const idx = ["front", "back", "edges"].indexOf(step);
      dotsHost.innerHTML = [0, 1, 2]
        .map((i) => `<span class="${i === idx ? "is-active" : ""}"></span>`)
        .join("");
    } else {
      dotsHost.innerHTML = "";
    }
  }

  $("#fab-add").addEventListener("click", () => {
    resetFlow();
    showView("view-add");
    showStep("front");
  });
  $("#add-back-btn").addEventListener("click", () => {
    showView("view-home");
  });

  $("#input-front").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.flow.frontFile = file;
    const url = await Capture.readAsDataURL(file);
    $("#preview-front").src = url;
    $("#preview-front").hidden = false;
    $("#frame-front .shot-placeholder").hidden = true;
    $("#frame-front").classList.add("has-image");
    $("#next-front").disabled = false;
  });
  $("#next-front").addEventListener("click", () => showStep("back"));

  $("#input-back").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.flow.backFile = file;
    const url = await Capture.readAsDataURL(file);
    $("#preview-back").src = url;
    $("#preview-back").hidden = false;
    $("#frame-back .shot-placeholder").hidden = true;
    $("#frame-back").classList.add("has-image");
    $("#next-back").disabled = false;
  });
  $("#next-back").addEventListener("click", () => showStep("edges"));

  function renderEdgeThumbs() {
    $("#edge-grid").innerHTML = state.flow.edgeFiles
      .map(
        (f, i) => `
      <div class="edge-thumb" data-idx="${i}">
        <img src="${f._previewUrl}" />
        <button class="remove-edge" data-idx="${i}">&times;</button>
      </div>`
      )
      .join("");
    $$(".remove-edge").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const idx = Number(e.target.dataset.idx);
        state.flow.edgeFiles.splice(idx, 1);
        renderEdgeThumbs();
      })
    );
  }

  $("#input-edge").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (state.flow.edgeFiles.length >= MAX_EDGE_PHOTOS) {
      showToast(`You can add up to ${MAX_EDGE_PHOTOS} close-ups.`);
      return;
    }
    file._previewUrl = await Capture.readAsDataURL(file);
    state.flow.edgeFiles.push(file);
    renderEdgeThumbs();
    $("#input-edge").value = "";
  });

  $("#skip-edges").addEventListener("click", () => runIdentify());
  $("#next-edges").addEventListener("click", () => runIdentify());
  $("#btn-retry-identify").addEventListener("click", () => runIdentify());
  $("#btn-discard").addEventListener("click", () => showView("view-home"));

  async function runIdentify() {
    showStep("scanning");
    try {
      const [front, back, ...edges] = await Promise.all([
        Capture.resizeForAI(state.flow.frontFile),
        Capture.resizeForAI(state.flow.backFile),
        ...state.flow.edgeFiles.map((f) => Capture.resizeForAI(f, 1400, 0.9)),
      ]);

      const data = await authedFetch(FN.identify, { front, back, edges });
      state.flow.result = data;
      $("#results-content").innerHTML = Render.resultsView(data);
      wireResultInputs();
      showStep("results");
    } catch (err) {
      $("#error-message").textContent = err.message || "Something went wrong identifying this card.";
      showStep("error");
    }
  }

  function wireResultInputs() {
    $$("#results-content input[data-field]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const field = e.target.dataset.field;
        state.flow.result.card[field] = field === "features" ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : e.target.value;
      });
    });
  }

  $("#btn-save-card").addEventListener("click", async () => {
    const btn = $("#btn-save-card");
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      const [frontUrl, backUrl] = await Promise.all([
        CardDB.uploadImage(state.flow.frontFile, "fronts"),
        CardDB.uploadImage(state.flow.backFile, "backs"),
      ]);
      const edgeUrls = await CardDB.uploadEdgeImages(state.flow.edgeFiles);

      const { card, value, psa_estimate } = state.flow.result;
      const valueMid = ((value?.estimate_low || 0) + (value?.estimate_high || 0)) / 2;

      const record = {
        player: card.player || null,
        team: card.team || null,
        sport: card.sport || "other",
        year: card.year || null,
        set_name: card.set_name || null,
        card_number: card.card_number || null,
        parallel: card.parallel || null,
        features: card.features || [],
        front_image_url: frontUrl,
        back_image_url: backUrl,
        edge_image_urls: edgeUrls,
        value_low: value?.estimate_low || null,
        value_high: value?.estimate_high || null,
        value_mid: valueMid || null,
        value_basis: value?.basis || null,
        value_as_of: value?.as_of || null,
        value_comps: value?.comps || [],
        psa_grade_low: psa_estimate?.grade_low || null,
        psa_grade_high: psa_estimate?.grade_high || null,
        psa_categories: psa_estimate?.categories || null,
        psa_summary: psa_estimate?.summary || null,
      };

      const saved = await CardDB.insertCard(record);
      state.cards.unshift(saved);
      renderHome();
      showView("view-home");
      showToast("Saved to your inventory.");
    } catch (err) {
      showToast(err.message || "Couldn't save this card. Try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save to inventory";
    }
  });

  // ======================= CARD DETAIL =======================
  function openDetail(id) {
    const card = state.cards.find((c) => String(c.id) === String(id));
    if (!card) return;
    state.currentDetailId = id;
    $("#detail-content").innerHTML = Render.detailView(card);
    showView("view-detail");

    $("#btn-refresh-value")?.addEventListener("click", () => refreshValue(card));
    $("#btn-edit-card")?.addEventListener("click", () => editCard(card));
  }

  $("#detail-back-btn").addEventListener("click", () => showView("view-home"));

  $("#detail-delete-btn").addEventListener("click", async () => {
    const card = state.cards.find((c) => String(c.id) === String(state.currentDetailId));
    if (!card) return;
    if (!confirm(`Remove ${card.player || "this card"} from your inventory? This can't be undone.`)) return;
    try {
      await CardDB.deleteCard(card.id);
      state.cards = state.cards.filter((c) => c.id !== card.id);
      renderHome();
      showView("view-home");
      showToast("Card removed.");
    } catch (err) {
      showToast(err.message || "Couldn't delete this card.");
    }
  });

  async function refreshValue(card) {
    const btn = $("#btn-refresh-value");
    btn.disabled = true;
    btn.textContent = "Checking recent sales...";
    try {
      const data = await authedFetch(FN.refresh, {
        card: {
          player: card.player,
          team: card.team,
          sport: card.sport,
          year: card.year,
          set_name: card.set_name,
          card_number: card.card_number,
          parallel: card.parallel,
          features: card.features,
        },
      });
      const valueMid = ((data.value.estimate_low || 0) + (data.value.estimate_high || 0)) / 2;
      const updated = await CardDB.updateCard(card.id, {
        value_low: data.value.estimate_low,
        value_high: data.value.estimate_high,
        value_mid: valueMid,
        value_basis: data.value.basis,
        value_as_of: data.value.as_of,
        value_comps: data.value.comps || [],
      });
      state.cards = state.cards.map((c) => (c.id === updated.id ? updated : c));
      openDetail(card.id);
      renderHome();
      showToast("Value updated.");
    } catch (err) {
      showToast(err.message || "Couldn't refresh the value right now.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Refresh value";
    }
  }

  function editCard(card) {
    const content = $("#detail-content");
    content.innerHTML = `
      <div class="result-section">
        <h3>Edit card details</h3>
        ${["player", "team", "sport", "year", "set_name", "card_number", "parallel"]
          .map(
            (f) => `
          <div class="field-row">
            <span class="field-label">${f.replace("_", " ")}</span>
            <input data-field="${f}" value="${Render.escapeHtml(card[f] || "")}" />
          </div>`
          )
          .join("")}
        <div class="field-row">
          <span class="field-label">features</span>
          <input data-field="features" value="${Render.escapeHtml((card.features || []).join(", "))}" />
        </div>
      </div>
      <div class="detail-actions">
        <button class="btn btn-ghost btn-block" id="btn-cancel-edit">Cancel</button>
        <button class="btn btn-primary btn-block" id="btn-save-edit">Save changes</button>
      </div>
    `;
    $("#btn-cancel-edit").addEventListener("click", () => openDetail(card.id));
    $("#btn-save-edit").addEventListener("click", async () => {
      const fields = {};
      $$("#detail-content input[data-field]").forEach((input) => {
        const f = input.dataset.field;
        fields[f] = f === "features" ? input.value.split(",").map((s) => s.trim()).filter(Boolean) : input.value;
      });
      try {
        const updated = await CardDB.updateCard(card.id, fields);
        state.cards = state.cards.map((c) => (c.id === updated.id ? updated : c));
        renderHome();
        openDetail(card.id);
        showToast("Updated.");
      } catch (err) {
        showToast(err.message || "Couldn't save your edits.");
      }
    });
  }

  // ======================= BOOT =======================
  (function boot() {
    if (getToken()) {
      unlockApp();
    } else {
      showGate();
    }
  })();
})();
