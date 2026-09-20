// Home page: live price tape, mini rate, network chips and AI status.
import { CHAINS, TOKENS, TAPE, FAMILY_LABEL } from "./data.js";
import { store } from "./store.js";
import { getPrices, getConfig } from "./api.js";
import { $, $$, esc, fmtUsd, fmtChange, chainGlyph } from "./ui.js";

let timer = null;

function renderTape(prices) {
  const items = TAPE.map((sym) => {
    const t = TOKENS[sym];
    const p = prices[t.cg];
    return p ? { sym, price: p.usd, change: p.change24h } : null;
  }).filter(Boolean);
  const tape = $("#tape");
  if (items.length < 3) { tape.hidden = true; return; }

  const html = (hidden) => items.map((it) => {
    const c = fmtChange(it.change);
    return `<a class="tape-item" href="#dex" data-token="${it.sym}" ${hidden ? 'tabindex="-1" aria-hidden="true"' : ""}>
      <b>${it.sym}</b><span>${fmtUsd(it.price)}</span><em class="chg" data-dir="${c.dir}">${c.text}</em></a>`;
  }).join("");

  $("#tapeTrack").innerHTML = `<div class="tape-set">${html(false)}</div><div class="tape-set" aria-hidden="true">${html(true)}</div>`;
  tape.hidden = false;

  const sol = prices[TOKENS.SOL.cg];
  if (sol) $("#miniRate").textContent = fmtUsd(sol.usd);
}

async function refresh() {
  try {
    renderTape(await getPrices(TAPE.map((s) => TOKENS[s].cg)));
  } catch { /* tape stays hidden when prices are unavailable */ }
}

function renderChips() {
  $("#chainChips").innerHTML = CHAINS.map((c) => `
    <a class="chain-chip" href="#dex" data-chain="${c.id}">
      ${chainGlyph(c, "tok-lg")}
      <span><b>${esc(c.name)}</b><small>${FAMILY_LABEL[c.family]}</small></span>
    </a>`).join("");
}

export function setStatus(el, state) {
  const label = { online: "Online", offline: "Offline", checking: "Checking…", unknown: "Unavailable" }[state] || "Unavailable";
  el.dataset.state = state;
  el.textContent = label;
}

async function checkAi() {
  const cfg = await getConfig();
  const state = !cfg ? "unknown" : cfg.features && cfg.features.ai ? "online" : "offline";
  setStatus($("#homeAiStatus"), state);
  setStatus($("#aiStatus"), state);
  document.dispatchEvent(new CustomEvent("ai-status", { detail: state }));
}

export function init(openToken) {
  renderChips();
  checkAi();
  $("#chainChips").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-chain]");
    if (chip) store.set({ chain: chip.dataset.chain });
  });
  $("#tapeTrack").addEventListener("click", (e) => {
    const item = e.target.closest("[data-token]");
    if (item) openToken(item.dataset.token);
  });
  document.addEventListener("route", (e) => {
    clearInterval(timer);
    if (e.detail === "home") {
      refresh();
      timer = setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    }
  });
}
