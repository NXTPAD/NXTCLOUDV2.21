// NXT Launchpad: four-step guided token setup with real validation and preflight checks.
import { CHAINS, FAMILY_LABEL, chainById } from "./data.js";
import { store } from "./store.js";
import * as wallet from "./wallet.js";
import { openWalletDialog } from "./wallet-ui.js";
import { $, $$, esc, icon, toast, copyText, chainGlyph, openDialog, friendlyError } from "./ui.js";

const STEPS = ["Network", "Token", "Review", "Deploy"];
const U64_MAX = 2n ** 64n - 1n;

const S = {
  step: 1,
  reached: 1,
  name: "",
  symbol: "",
  supply: "",
  decimals: "",
  decimalsTouched: false,
  desc: "",
  confirmed: false,
  errors: {},
  active: false,
};

const chain = () => chainById(store.get().chain);
const decimals = () => (S.decimalsTouched && S.decimals !== "" ? Number(S.decimals) : chain().defaultDecimals);
const familyName = (c) => FAMILY_LABEL[c.family];

/* ---------------- draft persistence ---------------- */

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem("nxt.draft") || "null");
    if (!d) return;
    S.name = String(d.name || "").slice(0, 32);
    S.symbol = String(d.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    S.supply = String(d.supply || "").replace(/\D/g, "").slice(0, 24);
    S.desc = String(d.desc || "").slice(0, 200);
    if (d.decimalsTouched && /^\d{1,2}$/.test(String(d.decimals))) { S.decimals = String(d.decimals); S.decimalsTouched = true; }
  } catch { /* ignore */ }
}
function saveDraft() {
  try {
    localStorage.setItem("nxt.draft", JSON.stringify({ name: S.name, symbol: S.symbol, supply: S.supply, desc: S.desc, decimals: S.decimals, decimalsTouched: S.decimalsTouched }));
  } catch { /* ignore */ }
}

/* ---------------- validation ---------------- */

function validate() {
  const e = {};
  const name = S.name.trim();
  if (name.length < 2) e.name = "Enter a name with at least 2 characters.";
  if (S.symbol.length < 2) e.symbol = "Use 2 to 10 letters or numbers.";

  let supplyOk = false;
  if (!/^\d+$/.test(S.supply) || BigInt(S.supply) <= 0n) e.supply = "Enter a whole number greater than zero.";
  else supplyOk = true;

  const d = decimals();
  if (!Number.isInteger(d) || d < 0 || d > 18) e.decimals = "Use a whole number from 0 to 18.";
  else if (supplyOk && chain().family !== "evm") {
    const raw = BigInt(S.supply) * 10n ** BigInt(d);
    if (raw > U64_MAX) e.supply = `On ${chain().name}, supply × 10^${d} must fit in 64 bits (about 1.8 × 10^19). Lower the supply or the decimals.`;
  }
  return e;
}

const groupSupply = (s) => (/^\d+$/.test(s) ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "—");

function config() {
  const c = chain();
  return {
    schema: "nxt-cloud/token-config@1",
    network: c.name,
    family: c.family,
    token: { name: S.name.trim(), symbol: S.symbol, totalSupply: S.supply, decimals: decimals(), description: S.desc.trim() },
    deployer: wallet.get().address || null,
    createdAt: new Date().toISOString(),
  };
}

/* ---------------- preflight ---------------- */

function preflight() {
  const c = chain();
  const w = wallet.get();
  const checks = [];
  const complete = Object.keys(validate()).length === 0;
  checks.push({
    ok: complete,
    text: complete ? "Token details are complete" : "Some token details are missing or invalid",
    fix: complete ? null : { label: "Edit details", run: () => goto(2) },
  });

  if (c.family === "sui") {
    checks.push({ ok: false, text: "Sui wallets aren't supported yet", fix: null });
    return checks;
  }
  if (!w.address) {
    checks.push({ ok: false, text: `Connect a ${familyName(c)} wallet`, fix: { label: "Connect wallet", run: openWalletDialog } });
    return checks;
  }
  if (!wallet.matchesFamily(c)) {
    checks.push({ ok: false, text: `Your wallet is on ${wallet.networkLabel()}, but ${c.name} needs a ${familyName(c)} wallet`, fix: { label: "Change wallet", run: openWalletDialog } });
    return checks;
  }
  checks.push({ ok: true, text: `${familyName(c)} wallet connected (${wallet.shortAddress()})` });
  if (c.family === "evm") {
    const onChain = w.chainId === c.chainId;
    checks.push({
      ok: onChain,
      text: onChain ? `Wallet is on ${c.name}` : `Wallet is on ${wallet.networkLabel()}. Switch to ${c.name}`,
      fix: onChain ? null : {
        label: `Switch to ${c.name}`,
        run: async () => { try { await wallet.switchEvmChain(c); } catch (e) { toast(friendlyError(e)); } },
      },
    });
  }
  return checks;
}

/* ---------------- rendering ---------------- */

function renderStepper() {
  $("#stepper").innerHTML = STEPS.map((label, i) => {
    const n = i + 1;
    const state = n < S.step ? "done" : n === S.step ? "current" : "todo";
    const reachable = n <= S.reached && n !== S.step;
    return `<li class="${state}">
      <button type="button" data-goto="${n}" ${reachable ? "" : "disabled"} ${n === S.step ? 'aria-current="step"' : ""}>
        <small>${state === "done" ? icon("check") : "Step " + n}</small><span>${label}</span>
      </button></li>`;
  }).join("");
}

function fieldError(key) {
  return S.errors[key] ? `<p class="err" id="err-${key}">${icon("alert")}${esc(S.errors[key])}</p>` : "";
}

function bodyStep1() {
  const cur = chain().id;
  return `
    <h2 class="wiz-title">Choose a network</h2>
    <p class="lede">Your token will live on one network. You can launch the same token on another network later.</p>
    <div class="chain-grid" role="radiogroup" aria-label="Network">
      ${CHAINS.map((c) => `
        <label class="chain-card">
          <input type="radio" name="chain" value="${c.id}" ${c.id === cur ? "checked" : ""}>
          <span class="chain-card-in">${chainGlyph(c, "tok-lg")}<span class="cc-text"><b>${esc(c.name)}</b><small>${familyName(c)} · ${c.tag}</small></span></span>
        </label>`).join("")}
    </div>
    <div class="wiz-actions"><button class="btn btn-primary" type="button" data-next>Continue</button></div>`;
}

function bodyStep2() {
  const d = decimals();
  return `
    <h2 class="wiz-title">Define your token</h2>
    <p class="lede">These details become public on ${esc(chain().name)} once you deploy.</p>
    <div class="fields">
      <div class="f ${S.errors.name ? "bad" : ""}">
        <label for="fName">Token name</label>
        <input id="fName" data-f="name" maxlength="32" placeholder="My Token" autocomplete="off" value="${esc(S.name)}" ${S.errors.name ? 'aria-invalid="true" aria-describedby="err-name"' : ""}>
        ${fieldError("name")}
      </div>
      <div class="f ${S.errors.symbol ? "bad" : ""}">
        <label for="fSymbol">Ticker</label>
        <input id="fSymbol" data-f="symbol" maxlength="10" placeholder="MYTKN" autocomplete="off" autocapitalize="characters" value="${esc(S.symbol)}" ${S.errors.symbol ? 'aria-invalid="true" aria-describedby="err-symbol"' : ""}>
        ${fieldError("symbol")}
      </div>
      <div class="f ${S.errors.supply ? "bad" : ""}">
        <label for="fSupply">Total supply</label>
        <input id="fSupply" data-f="supply" inputmode="numeric" placeholder="1000000000" autocomplete="off" value="${esc(S.supply)}" ${S.errors.supply ? 'aria-invalid="true" aria-describedby="err-supply"' : ""}>
        ${fieldError("supply")}
      </div>
      <div class="f ${S.errors.decimals ? "bad" : ""}">
        <label for="fDecimals">Decimals</label>
        <input id="fDecimals" data-f="decimals" inputmode="numeric" maxlength="2" autocomplete="off" value="${S.decimalsTouched ? esc(S.decimals) : d}" ${S.errors.decimals ? 'aria-invalid="true" aria-describedby="err-decimals"' : ""}>
        <p class="hint">${chain().family === "evm" ? "18 is standard on EVM networks." : `${chain().defaultDecimals} is common on ${esc(chain().name)}.`}</p>
        ${fieldError("decimals")}
      </div>
      <div class="f f-wide">
        <label for="fDesc">Description <span class="opt">optional</span></label>
        <textarea id="fDesc" data-f="desc" rows="3" maxlength="200" placeholder="What is this token for?">${esc(S.desc)}</textarea>
        <p class="hint" id="descCount">${S.desc.length}/200</p>
      </div>
    </div>
    <div class="wiz-actions"><button class="btn btn-quiet" type="button" data-back>Back</button><button class="btn btn-primary" type="button" data-next>Review</button></div>`;
}

function bodyStep3() {
  const c = chain();
  return `
    <h2 class="wiz-title">Review your token</h2>
    <p class="lede">Deployed tokens are permanent. Check every detail before you continue.</p>
    <div class="review">
      <section>
        <div class="review-head"><h3>Network</h3><button class="link" type="button" data-goto="1">Edit</button></div>
        <dl class="kv"><div><dt>Network</dt><dd>${esc(c.name)}</dd></div><div><dt>Type</dt><dd>${familyName(c)}</dd></div></dl>
      </section>
      <section>
        <div class="review-head"><h3>Token</h3><button class="link" type="button" data-goto="2">Edit</button></div>
        <dl class="kv">
          <div><dt>Name</dt><dd>${esc(S.name.trim())}</dd></div>
          <div><dt>Ticker</dt><dd>${esc(S.symbol)}</dd></div>
          <div><dt>Total supply</dt><dd>${groupSupply(S.supply)}</dd></div>
          <div><dt>Decimals</dt><dd>${decimals()}</dd></div>
          ${S.desc.trim() ? `<div><dt>Description</dt><dd>${esc(S.desc.trim())}</dd></div>` : ""}
        </dl>
      </section>
    </div>
    <label class="check ${S.errors.confirm ? "bad" : ""}">
      <input type="checkbox" id="fConfirm" ${S.confirmed ? "checked" : ""}>
      <span>I've checked these details and understand they can't be changed after deployment.</span>
    </label>
    ${S.errors.confirm ? `<p class="err">${icon("alert")}${esc(S.errors.confirm)}</p>` : ""}
    <div class="wiz-actions"><button class="btn btn-quiet" type="button" data-back>Back</button><button class="btn btn-primary" type="button" data-next>Continue</button></div>`;
}

function bodyStep4() {
  const checks = preflight();
  return `
    <h2 class="wiz-title">Deploy</h2>
    <p class="lede">Finish these checks, then deploy from your wallet.</p>
    <ul class="checks">
      ${checks.map((c, i) => `
        <li class="${c.ok ? "ok" : "todo"}">
          <span class="ck">${c.ok ? icon("check") : icon("alert")}</span>
          <span class="ck-text">${esc(c.text)}</span>
          ${c.fix ? `<button class="btn btn-quiet btn-sm" type="button" data-fix="${i}">${esc(c.fix.label)}</button>` : ""}
        </li>`).join("")}
    </ul>
    <div class="wiz-actions">
      <button class="btn btn-quiet" type="button" data-back>Back</button>
      <button class="btn btn-quiet" type="button" data-export>${icon("download")}Export config</button>
      <button class="btn btn-primary" type="button" data-deploy>Deploy token</button>
    </div>`;
}

function renderBody(focus = false) {
  const html = [bodyStep1, bodyStep2, bodyStep3, bodyStep4][S.step - 1]();
  $("#wizBody").innerHTML = html;
  renderStepper();
  renderTicket();
  if (focus) {
    const t = $(".wiz-title", $("#wizBody"));
    if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
  }
}

function renderTicket() {
  const c = chain();
  const valid = S.name.trim() && S.symbol;
  $("#ticket").innerHTML = `
    <div class="ticket-top">
      <span class="tok tok-xl${S.symbol.length > 3 ? " long" : ""}" style="--h:${c.hue}" aria-hidden="true">${esc((S.symbol || "?").slice(0, 4))}</span>
      <div>
        <b class="ticket-name">${valid ? esc(S.name.trim()) : "Your token"}</b>
        <small>${S.symbol ? esc(S.symbol) + " on " : "on "}${esc(c.name)}</small>
      </div>
    </div>
    <div class="ticket-tear" aria-hidden="true"></div>
    <dl class="ticket-rows">
      <div><dt>Network</dt><dd>${esc(c.name)}</dd></div>
      <div><dt>Supply</dt><dd>${groupSupply(S.supply)}</dd></div>
      <div><dt>Decimals</dt><dd>${decimals()}</dd></div>
      <div><dt>Signed by</dt><dd>Your wallet</dd></div>
    </dl>
    <p class="ticket-note">${icon("check")}<span><b>Non-custodial.</b> NXT CLOUD never holds your keys or funds.</span></p>
    <button class="link ticket-reset" type="button" id="resetLaunch">Start over</button>`;
}

/* ---------------- navigation ---------------- */

function goto(n, focus = true) {
  S.step = n;
  S.reached = Math.max(S.reached, n);
  renderBody(focus);
}

function next() {
  if (S.step === 2) {
    S.errors = validate();
    if (Object.keys(S.errors).length) {
      renderBody(false);
      const first = $(".f.bad input, .f.bad textarea");
      if (first) first.focus();
      return;
    }
    S.errors = {};
    S.confirmed = false;
    return goto(3);
  }
  if (S.step === 3) {
    if (!S.confirmed) { S.errors = { confirm: "Confirm the details to continue." }; renderBody(false); return; }
    S.errors = {};
    return goto(4);
  }
  goto(S.step + 1);
}

function back() {
  S.errors = {};
  goto(Math.max(1, S.step - 1));
}

function download() {
  const cfg = config();
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(cfg.token.symbol || "token").toLowerCase()}-${chain().id}-config.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Config downloaded");
}

function deploy() {
  const checks = preflight();
  const blocked = checks.find((c) => !c.ok);
  if (blocked) {
    toast(blocked.fix ? blocked.text : "Fix the highlighted check to continue.");
    const fix = $("[data-fix]", $("#wizBody"));
    if (fix) fix.focus();
    return;
  }
  const cfg = config();
  $("#deployBody").innerHTML = `
    <dl class="kv">
      <div><dt>Token</dt><dd>${esc(cfg.token.name)} (${esc(cfg.token.symbol)})</dd></div>
      <div><dt>Network</dt><dd>${esc(cfg.network)}</dd></div>
      <div><dt>Supply</dt><dd>${groupSupply(cfg.token.totalSupply)}</dd></div>
      <div><dt>Deployer</dt><dd>${esc(wallet.shortAddress())}</dd></div>
    </dl>
    <div class="callout">${icon("alert")}<p><b>On-chain deployment isn't connected yet.</b> Your checks passed, but this build has no token program or contract to send to your wallet, so nothing was signed or spent. Export the config to keep your setup.</p></div>
    <div class="sheet-actions">
      <button class="btn btn-quiet" type="button" id="depCopy">${icon("copy")}Copy config</button>
      <button class="btn btn-primary" type="button" id="depDownload">${icon("download")}Download config</button>
    </div>`;
  $("#depCopy").addEventListener("click", async () => toast((await copyText(JSON.stringify(config(), null, 2))) ? "Config copied" : "Couldn't copy the config"));
  $("#depDownload").addEventListener("click", download);
  openDialog($("#deployDialog"));
}

function resetAll() {
  Object.assign(S, { step: 1, reached: 1, name: "", symbol: "", supply: "", decimals: "", decimalsTouched: false, desc: "", confirmed: false, errors: {} });
  try { localStorage.removeItem("nxt.draft"); } catch { /* ignore */ }
  renderBody(true);
  toast("Started over");
}

/* ---------------- init ---------------- */

export function init() {
  loadDraft();
  const root = $("#launchpad");

  root.addEventListener("click", (e) => {
    const t = e.target;
    const go = t.closest("[data-goto]");
    if (go && !go.disabled) return goto(Number(go.dataset.goto));
    if (t.closest("[data-next]")) return next();
    if (t.closest("[data-back]")) return back();
    if (t.closest("[data-export]")) return download();
    if (t.closest("[data-deploy]")) return deploy();
    if (t.closest("#resetLaunch")) return resetAll();
    const fix = t.closest("[data-fix]");
    if (fix) { const item = preflight()[Number(fix.dataset.fix)]; if (item && item.fix) item.fix.run(); }
  });

  root.addEventListener("change", (e) => {
    if (e.target.name === "chain") {
      store.set({ chain: e.target.value });
      const checked = $('input[name="chain"]:checked', root);
      if (checked) checked.focus();   // the step re-renders; keep keyboard focus on the group
    }
    if (e.target.id === "fConfirm") { S.confirmed = e.target.checked; if (S.confirmed) { S.errors = {}; renderBody(false); $("#fConfirm").focus(); } }
  });

  root.addEventListener("input", (e) => {
    const key = e.target.dataset.f;
    if (!key) return;
    let v = e.target.value;
    if (key === "symbol") v = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    if (key === "supply") v = v.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 24);
    if (key === "decimals") { v = v.replace(/\D/g, "").slice(0, 2); S.decimalsTouched = v !== ""; }
    if (v !== e.target.value) e.target.value = v;
    S[key] = v;
    if (S.errors[key]) {                      // clear an error once the value is fixed
      const now = validate();
      if (!now[key]) { delete S.errors[key]; const box = e.target.closest(".f"); box.classList.remove("bad"); const er = $(".err", box); if (er) er.remove(); e.target.removeAttribute("aria-invalid"); }
    }
    if (key === "desc") $("#descCount").textContent = `${v.length}/200`;
    saveDraft();
    renderTicket();
  });

  store.subscribe(() => {
    S.errors = {};
    if (S.active) renderBody(false); else renderTicket();
  });
  wallet.subscribe(() => { if (S.active && S.step === 4) renderBody(false); });

  document.addEventListener("route", (e) => {
    S.active = e.detail === "launchpad";
    if (S.active) renderBody(false);
  });

  renderBody(false);
}
