// NXT DEX: indicative quotes from live prices, token picker, slippage, chart.
import { CHAINS, TOKENS, chainById, chainTokens } from "./data.js";
import { store } from "./store.js";
import { getPrices, getChart } from "./api.js";
import * as wallet from "./wallet.js";
import { openWalletDialog } from "./wallet-ui.js";
import { $, $$, esc, icon, toast, fmtUsd, fmtAmount, fmtChange, plain, tokenAvatar, chainGlyph, openDialog, friendlyError } from "./ui.js";

const SLIP_PRESETS = [0.1, 0.5, 1];

const S = {
  pay: "SOL",
  receive: "USDC",
  amount: "",
  slip: 0.5,
  prices: {},            // symbol -> { usd, change }
  pricesState: "idle",   // idle | loading | ok | error
  range: 7,
  view: null,            // token being charted, overrides the automatic choice
  balance: null,
  chart: { state: "idle", points: [], sym: null, days: null },
  pickSide: "pay",
  active: false,
};

let pricesReq = 0;
let chartReq = 0;
let balReq = 0;
let timer = null;
let action = { label: "", disabled: false, run: () => {} };

const chain = () => chainById(store.get().chain);
const symbolsHere = () => chainTokens(chain().id).map((t) => t.symbol);

function loadSlip() {
  try {
    const v = parseFloat(localStorage.getItem("nxt.slip"));
    if (v >= 0.01 && v <= 50) S.slip = v;
  } catch { /* ignore */ }
}

function normalizePair() {
  const list = symbolsHere();
  if (!list.includes(S.pay)) S.pay = list[0];
  if (!list.includes(S.receive) || S.receive === S.pay) {
    S.receive = list.find((s) => s !== S.pay && TOKENS[s].stable) || list.find((s) => s !== S.pay);
  }
}

function chartSymbol() {
  if (S.view && symbolsHere().includes(S.view)) return S.view;
  return TOKENS[S.pay].stable && !TOKENS[S.receive].stable ? S.receive : S.pay;
}

/* ---------------- prices ---------------- */

async function refreshPrices() {
  const req = ++pricesReq;
  const tokens = chainTokens(chain().id);
  if (!tokens.every((t) => S.prices[t.symbol])) { S.pricesState = "loading"; renderAll(); }
  try {
    const data = await getPrices(tokens.map((t) => t.cg));
    if (req !== pricesReq) return;
    for (const t of tokens) {
      if (data[t.cg]) S.prices[t.symbol] = { usd: data[t.cg].usd, change: data[t.cg].change24h };
    }
    S.pricesState = S.prices[S.pay] && S.prices[S.receive] ? "ok" : "error";
  } catch {
    if (req !== pricesReq) return;
    S.pricesState = S.prices[S.pay] && S.prices[S.receive] ? "ok" : "error";
  }
  renderAll();
}

function startPolling() {
  stopPolling();
  refreshPrices();
  loadChart();
  refreshBalance();
  timer = setInterval(() => { if (!document.hidden) refreshPrices(); }, 30000);
}
function stopPolling() { clearInterval(timer); timer = null; }

/* ---------------- quote ---------------- */

function quote() {
  const p = S.prices[S.pay];
  const r = S.prices[S.receive];
  if (!p || !r || !p.usd || !r.usd) return null;
  const rate = p.usd / r.usd;
  const amt = parseFloat(S.amount);
  if (!(amt > 0)) return { rate, amt: 0 };
  const out = amt * rate;
  return { rate, amt, out, min: out * (1 - S.slip / 100), usdIn: amt * p.usd, usdOut: out * r.usd };
}

/* ---------------- rendering ---------------- */

function renderTokens() {
  const pay = TOKENS[S.pay];
  const rec = TOKENS[S.receive];
  $("#payToken").innerHTML = `${tokenAvatar(pay)}<span>${pay.symbol}</span>${icon("chevron")}`;
  $("#payToken").setAttribute("aria-label", `Pay with ${pay.symbol}. Change token`);
  $("#receiveToken").innerHTML = `${tokenAvatar(rec)}<span>${rec.symbol}</span>${icon("chevron")}`;
  $("#receiveToken").setAttribute("aria-label", `Receive ${rec.symbol}. Change token`);
}

function renderQuote() {
  const q = quote();
  const c = chain();
  $("#receiveAmount").value = q && q.out ? plain(q.out) : "";
  $("#payUsd").textContent = q && q.usdIn ? "≈ " + fmtUsd(q.usdIn) : "$0.00";
  $("#receiveUsd").textContent = q && q.usdOut ? "≈ " + fmtUsd(q.usdOut) : "$0.00";

  const details = $("#details");
  if (q) {
    details.hidden = false;
    $("#dRate").textContent = `1 ${S.pay} ≈ ${fmtAmount(q.rate)} ${S.receive}`;
    $("#dMin").textContent = q.min ? `${fmtAmount(q.min)} ${S.receive}` : "—";
    $("#dSlip").textContent = `${S.slip}%`;
    $("#dNet").textContent = c.name;
  } else {
    details.hidden = true;
  }
}

function renderBalance() {
  const el = $("#payBalance");
  const max = $("#maxBtn");
  if (S.balance == null) {
    el.textContent = "Balance —";
    max.hidden = true;
  } else {
    el.textContent = `Balance ${fmtAmount(S.balance)} ${S.pay}`;
    max.hidden = !(S.balance > 0);
  }
}

function computeAction() {
  const c = chain();
  const w = wallet.get();
  const amt = parseFloat(S.amount);
  const noop = () => {};

  if (c.family === "sui") return { label: "Sui wallets aren't supported yet", disabled: true, run: noop };
  if (!w.address) return { label: "Connect wallet", disabled: false, run: openWalletDialog };
  if (!wallet.matchesFamily(c)) {
    return { label: `Connect a ${c.family === "solana" ? "Solana" : "EVM"} wallet`, disabled: false, run: openWalletDialog };
  }
  if (c.family === "evm" && w.chainId !== c.chainId) {
    return {
      label: `Switch to ${c.name}`,
      disabled: false,
      run: async () => {
        try { await wallet.switchEvmChain(c); toast(`Wallet switched to ${c.name}`); } catch (e) { toast(friendlyError(e)); }
      },
    };
  }
  if (S.pricesState === "loading") return { label: "Loading prices…", disabled: true, run: noop };
  if (!quote()) return { label: "Quote unavailable", disabled: true, run: noop };
  if (!(amt > 0)) return { label: "Enter an amount", disabled: true, run: noop };
  if (S.balance != null && amt > S.balance) return { label: `Not enough ${S.pay}`, disabled: true, run: noop };
  return { label: "Preview swap", disabled: false, run: openReview };
}

function renderAction() {
  action = computeAction();
  const btn = $("#swapBtn");
  btn.textContent = action.label;
  btn.disabled = action.disabled;
}

function renderChainSelect() {
  const sel = $("#chainSelect");
  if (!sel.options.length) {
    sel.innerHTML = CHAINS.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  }
  sel.value = chain().id;
  $("#chainGlyph").innerHTML = chainGlyph(chain());
}

function renderSlip() {
  $("#slipValue").textContent = `${S.slip}%`;
  $("#slipPresets").innerHTML = SLIP_PRESETS.map((v) => `<button type="button" data-slip="${v}" aria-pressed="${v === S.slip}">${v}%</button>`).join("");
  const custom = $("#slipCustom");
  if (!SLIP_PRESETS.includes(S.slip) && document.activeElement !== custom) custom.value = String(S.slip);
  const msg = $("#slipMsg");
  msg.textContent = S.slip > 5 ? "High slippage can cost you a lot if the price moves." : S.slip < 0.1 ? "Very low slippage may make swaps fail." : "";
}

function renderMarketHead() {
  const sym = chartSymbol();
  const t = TOKENS[sym];
  const p = S.prices[sym];
  $("#mkId").innerHTML = `${tokenAvatar(t, "tok-lg")}<div><b>${esc(t.name)}</b><small>${sym} / USD</small></div>`;
  $("#mkPrice").textContent = p ? fmtUsd(p.usd) : "—";

  // Prefer the change over the selected chart range; fall back to the 24h figure.
  let change = p ? p.change : null;
  let span = "past 24 hours";
  const c = S.chart;
  if (c.state === "ready" && c.sym === sym && c.points.length > 1) {
    const first = c.points[0][1];
    const last = c.points[c.points.length - 1][1];
    change = ((last - first) / first) * 100;
    span = { 1: "past 24 hours", 7: "past 7 days", 30: "past 30 days" }[c.days] || span;
  }
  const f = fmtChange(change);
  const chg = $("#mkChange");
  chg.textContent = f.text;
  chg.dataset.dir = f.dir;
  $("#mkSpan").textContent = change == null ? "" : span;

  $$("#rangeTabs button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === S.range)));
}

function renderList() {
  const c = chain();
  $("#listTitle").textContent = `Tokens on ${c.name}`;
  const sym = chartSymbol();
  $("#tokenList").innerHTML = chainTokens(c.id).map((t) => {
    const p = S.prices[t.symbol];
    const f = fmtChange(p ? p.change : null);
    return `<li class="trow" ${t.symbol === sym ? 'data-selected="true"' : ""}>
      <button class="trow-main" type="button" data-view="${t.symbol}" aria-label="Show ${esc(t.name)} chart">
        <span class="trow-id">${tokenAvatar(t)}<span><b>${esc(t.name)}</b><small>${t.symbol}</small></span></span>
        <span class="trow-price">${p ? fmtUsd(p.usd) : "—"}</span>
        <span class="chg" data-dir="${f.dir}">${f.text}</span>
      </button>
      <button class="btn btn-quiet btn-sm" type="button" data-swap-to="${t.symbol}" aria-label="Swap to ${esc(t.name)}">Swap</button>
    </li>`;
  }).join("");
}

function renderAll() {
  renderChainSelect();
  renderTokens();
  renderQuote();
  renderBalance();
  renderAction();
  renderMarketHead();
  renderList();
  renderSlip();
}

/* ---------------- chart ---------------- */

async function loadChart() {
  const sym = chartSymbol();
  const days = S.range;
  const req = ++chartReq;
  S.chart = { state: "loading", points: [], sym, days };
  renderChart();
  renderMarketHead();
  try {
    const points = await getChart(TOKENS[sym].cg, days);
    if (req !== chartReq) return;
    S.chart = { state: "ready", points, sym, days };
  } catch {
    if (req !== chartReq) return;
    S.chart = { state: "error", points: [], sym, days };
  }
  renderChart();
  renderMarketHead();
}

function renderChart() {
  const box = $("#chart");
  const c = S.chart;
  if (c.state === "loading" || c.state === "idle") {
    box.innerHTML = '<div class="chart-skel" aria-busy="true"><span class="sr-only">Loading chart</span></div>';
    return;
  }
  if (c.state === "error") {
    box.innerHTML = `<div class="chart-msg"><p>Chart data isn't available right now.</p><button class="btn btn-quiet btn-sm" type="button" data-retry-chart>${icon("refresh")}Try again</button></div>`;
    return;
  }

  const pts = c.points;
  const W = 640, H = 260, top = 18, bottom = 18;
  const vals = pts.map((p) => p[1]);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const pad = (max - min || max * 0.01 || 1) * 0.08;
  min -= pad; max += pad;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => top + (1 - (v - min) / (max - min)) * (H - top - bottom);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const area = `${line}L${W},${H}L0,${H}Z`;
  const first = vals[0], last = vals[vals.length - 1];
  const label = `${c.sym} price over the last ${c.days === 1 ? "day" : c.days + " days"}: from ${fmtUsd(first)} to ${fmtUsd(last)}. Low ${fmtUsd(Math.min(...vals))}, high ${fmtUsd(Math.max(...vals))}.`;

  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">
      <defs><linearGradient id="cfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cs1"/><stop offset="1" class="cs2"/></linearGradient></defs>
      <path class="c-area" d="${area}" fill="url(#cfill)"/>
      <path class="c-line" d="${line}"/>
    </svg>
    <span class="c-axis c-hi">${fmtUsd(Math.max(...vals))}</span>
    <span class="c-axis c-lo">${fmtUsd(Math.min(...vals))}</span>
    <div class="c-cross" hidden><i></i><span class="c-dot"></span><div class="c-tip"></div></div>`;

  const svg = $("svg", box);
  const cross = $(".c-cross", box);
  const tip = $(".c-tip", box);
  const dot = $(".c-dot", box);

  const show = (clientX) => {
    const r = svg.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const i = Math.round(ratio * (pts.length - 1));
    const [t, v] = pts[i];
    const px = (i / (pts.length - 1)) * 100;
    const py = (y(v) / H) * 100;
    cross.hidden = false;
    cross.style.left = px + "%";
    dot.style.top = py + "%";
    const when = new Date(t).toLocaleString([], c.days === 1 ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric" });
    tip.innerHTML = `<b>${fmtUsd(v)}</b><small>${esc(when)}</small>`;
    tip.classList.toggle("flip", px > 62);
  };
  svg.addEventListener("pointermove", (e) => show(e.clientX));
  svg.addEventListener("pointerdown", (e) => show(e.clientX));
  svg.addEventListener("pointerleave", () => { cross.hidden = true; });
}

/* ---------------- actions ---------------- */

async function refreshBalance() {
  const req = ++balReq;
  S.balance = null;
  renderBalance();
  renderAction();
  const c = chain();
  if (!wallet.get().address || S.pay !== c.native) return;
  const b = await wallet.nativeBalance(c);
  if (req !== balReq) return;
  S.balance = b;
  renderBalance();
  renderAction();
}

function setPair(patch) {
  Object.assign(S, patch);
  normalizePair();
  renderAll();
  loadChart();
  refreshBalance();
}

function applyChain() {
  normalizePair();
  S.view = null;
  S.pricesState = "idle";
  renderAll();
  if (S.active) { refreshPrices(); loadChart(); refreshBalance(); }
}

function openReview() {
  const q = quote();
  if (!q || !q.out) return;
  const c = chain();
  $("#reviewBody").innerHTML = `
    <div class="rv-legs">
      <div class="rv-leg"><small>You pay</small><b>${fmtAmount(q.amt)} ${S.pay}</b><span>≈ ${fmtUsd(q.usdIn)}</span></div>
      <span class="rv-arrow">${icon("chevron")}</span>
      <div class="rv-leg"><small>You receive (estimate)</small><b>${fmtAmount(q.out)} ${S.receive}</b><span>≈ ${fmtUsd(q.usdOut)}</span></div>
    </div>
    <dl class="details">
      <div><dt>Rate</dt><dd>1 ${S.pay} ≈ ${fmtAmount(q.rate)} ${S.receive}</dd></div>
      <div><dt>Minimum received</dt><dd>${fmtAmount(q.min)} ${S.receive}</dd></div>
      <div><dt>Max slippage</dt><dd>${S.slip}%</dd></div>
      <div><dt>Network</dt><dd>${esc(c.name)}</dd></div>
      <div><dt>Wallet</dt><dd>${esc(wallet.shortAddress())}</dd></div>
    </dl>
    <div class="callout">${icon("alert")}<p><b>Swap execution isn't connected yet.</b> This preview uses market prices, so real fees and price impact will differ. Nothing has been sent from your wallet.</p></div>
    <div class="sheet-actions"><button class="btn btn-primary" type="button" data-close>Close preview</button></div>`;
  openDialog($("#reviewDialog"));
}

function renderPicker() {
  const term = $("#tokenSearch").value.trim().toLowerCase();
  const other = S.pickSide === "pay" ? S.receive : S.pay;
  const current = S[S.pickSide];
  const list = chainTokens(chain().id).filter((t) => !term || t.symbol.toLowerCase().includes(term) || t.name.toLowerCase().includes(term));
  $("#pickList").innerHTML = list.length
    ? list.map((t) => {
        const p = S.prices[t.symbol];
        return `<li><button type="button" class="pick" data-pick="${t.symbol}" ${t.symbol === current ? 'aria-current="true"' : ""}>
          ${tokenAvatar(t, "tok-lg")}
          <span class="pick-name"><b>${t.symbol}</b><small>${esc(t.name)}${t.symbol === other ? " · in use" : ""}</small></span>
          <span class="pick-price">${p ? fmtUsd(p.usd) : ""}</span>
          ${t.symbol === current ? icon("check") : ""}
        </button></li>`;
      }).join("")
    : `<li class="pick-empty">No token matches “${esc(term)}” on ${esc(chain().name)}.</li>`;
}

function openPicker(side) {
  S.pickSide = side;
  $("#tokenDialogTitle").textContent = side === "pay" ? "Pay with" : "Receive";
  $("#tokenSearch").value = "";
  renderPicker();
  openDialog($("#tokenDialog"));
}

function pick(sym) {
  const side = S.pickSide;
  const other = side === "pay" ? "receive" : "pay";
  const patch = { [side]: sym, view: null };
  if (S[other] === sym) patch[other] = S[side];   // choosing the other side's token swaps them
  $("#tokenDialog").close();
  setPair(patch);
}

function setSlip(v) {
  if (!(v >= 0.01 && v <= 50)) return false;
  S.slip = Math.round(v * 100) / 100;
  try { localStorage.setItem("nxt.slip", String(S.slip)); } catch { /* ignore */ }
  renderSlip();
  renderQuote();
  return true;
}

/** Called from the home page tape: open the DEX with this token as the "pay" side. */
export function openToken(sym) {
  const t = TOKENS[sym];
  if (!t) return;
  S.pay = sym;
  S.view = null;
  if (!symbolsHere().includes(sym)) store.set({ chain: t.home });
  else applyChain();
}

/* ---------------- init ---------------- */

export function init() {
  loadSlip();
  normalizePair();

  $("#chainSelect").addEventListener("change", (e) => store.set({ chain: e.target.value }));
  store.subscribe(() => applyChain());
  wallet.subscribe(() => { renderAction(); if (S.active) refreshBalance(); });

  $("#payAmount").addEventListener("input", (e) => {
    let v = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
    const dot = v.indexOf(".");
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "");
    v = v.slice(0, 18);
    if (v !== e.target.value) e.target.value = v;
    S.amount = v;
    renderQuote();
    renderAction();
  });

  $("#maxBtn").addEventListener("click", () => {
    if (S.balance == null) return;
    const max = Math.max(0, S.balance - chain().reserve);
    if (max <= 0) { toast(`Your ${S.pay} balance is too low to leave enough for network fees.`); return; }
    S.amount = plain(max);
    $("#payAmount").value = S.amount;
    renderQuote();
    renderAction();
    toast("Max leaves a little for network fees");
  });

  $("#flipBtn").addEventListener("click", () => {
    $("#flipBtn").classList.toggle("turned");
    setPair({ pay: S.receive, receive: S.pay, view: null });
  });

  $("#payToken").addEventListener("click", () => openPicker("pay"));
  $("#receiveToken").addEventListener("click", () => openPicker("receive"));
  $("#tokenSearch").addEventListener("input", renderPicker);
  $("#pickList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (b) pick(b.dataset.pick);
  });

  $("#swapBtn").addEventListener("click", () => action.run());

  $("#slipToggle").addEventListener("click", () => {
    const panel = $("#slipPanel");
    panel.hidden = !panel.hidden;
    $("#slipToggle").setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("#slipPresets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-slip]");
    if (!b) return;
    $("#slipCustom").value = "";
    setSlip(parseFloat(b.dataset.slip));
  });
  $("#slipCustom").addEventListener("input", (e) => {
    const v = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
    if (v !== e.target.value) e.target.value = v;
    if (v === "") return;
    const n = parseFloat(v);
    if (!setSlip(n)) $("#slipMsg").textContent = "Enter a value between 0.01% and 50%.";
  });

  $("#rangeTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-days]");
    if (!b) return;
    S.range = Number(b.dataset.days);
    loadChart();
  });
  $("#chart").addEventListener("click", (e) => { if (e.target.closest("[data-retry-chart]")) loadChart(); });

  $("#tokenList").addEventListener("click", (e) => {
    const view = e.target.closest("[data-view]");
    const swap = e.target.closest("[data-swap-to]");
    if (view) { S.view = view.dataset.view; renderList(); loadChart(); }
    if (swap) {
      const sym = swap.dataset.swapTo;
      if (sym === S.receive) return toast(`Already receiving ${sym}`);
      const patch = { receive: sym, view: null };
      if (S.pay === sym) patch.pay = S.receive;
      setPair(patch);
      toast(`Receiving ${sym}`);
      $(".swap")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    }
  });

  document.addEventListener("route", (e) => {
    S.active = e.detail === "dex";
    if (S.active) startPolling(); else stopPolling();
  });

  renderAll();
}
