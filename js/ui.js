// Small DOM + formatting helpers shared by every module.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const icon = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function tokenAvatar(token, size = "") {
  const long = token.symbol.length > 3 ? " long" : "";
  return `<span class="tok ${size}${long}" style="--h:${token.hue}" aria-hidden="true">${esc(token.symbol.slice(0, 4))}</span>`;
}

export function chainGlyph(chain, size = "") {
  return `<span class="tok ${size}" style="--h:${chain.hue}" aria-hidden="true">${esc(chain.name[0])}</span>`;
}

let toastTimer;
export function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/** USD price with sensible precision for both $60,000 assets and $0.00002 assets. */
export function fmtUsd(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n <= 0) return "$0.00";
  const decimals = Math.min(12, Math.max(2, 2 - Math.floor(Math.log10(n))));
  return "$" + n.toFixed(decimals);
}

/** Plain machine-friendly number string (no grouping, no exponent, trailing zeros trimmed). */
export function plain(n) {
  if (n == null || !isFinite(n)) return "";
  let s;
  if (n >= 1000) s = n.toFixed(2);
  else if (n >= 1) s = n.toFixed(4);
  else if (n <= 0) s = "0";
  else s = n.toFixed(Math.min(12, Math.max(6, 3 - Math.floor(Math.log10(n)))));
  return s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

/** Grouped amount for display. */
export function fmtAmount(n) {
  if (n == null || !isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return Number(plain(n)).toLocaleString("en-US", { maximumFractionDigits: 12 });
}

export function fmtChange(n) {
  if (n == null || !isFinite(n)) return { text: "—", dir: "flat" };
  const dir = n > 0.005 ? "up" : n < -0.005 ? "down" : "flat";
  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "•";
  return { text: `${glyph} ${Math.abs(n).toFixed(2)}%`, dir };
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
}

/** Wire backdrop-click and [data-close] buttons on every dialog once. */
export function initDialogs() {
  $$("dialog.sheet").forEach((dlg) => {
    // Delegated so buttons rendered into a dialog later (previews, deploy summary) also close it.
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
    });
  });
}

export function friendlyError(e) {
  const msg = (e && (e.message || e.reason)) || "";
  if (e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|declin|cancel/i.test(msg))) return "You cancelled the request in your wallet.";
  if (e && e.code === -32002) return "A request is already open in your wallet. Check the extension.";
  return msg || "The wallet request failed. Try again.";
}
