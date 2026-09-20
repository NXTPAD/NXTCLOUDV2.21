// Entry point: routing, theme, and module wiring.
import * as walletUi from "./wallet-ui.js";
import * as dex from "./dex.js";
import * as launch from "./launch.js";
import * as ai from "./ai.js";
import * as home from "./home.js";
import { $, $$, initDialogs } from "./ui.js";

const ROUTES = ["home", "dex", "launchpad", "ai"];
const TITLES = {
  home: "NXT CLOUD — Swap, launch and ask on any chain",
  dex: "Swap — NXT CLOUD",
  launchpad: "Launch a token — NXT CLOUD",
  ai: "NXT AI — NXT CLOUD",
};

let firstRoute = true;

function route() {
  let id = location.hash.replace(/^#/, "");
  if (!ROUTES.includes(id)) id = "home";

  $$(".page").forEach((p) => { p.hidden = p.id !== id; });
  $$(".nav a").forEach((a) => {
    if (a.dataset.route === id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = TITLES[id];
  window.scrollTo(0, 0);

  if (!firstRoute) {
    const h1 = $(`#${id} h1`);
    if (h1) h1.focus({ preventScroll: true });
  }
  firstRoute = false;
  document.dispatchEvent(new CustomEvent("route", { detail: id }));
}

function initTheme() {
  const btn = $("#themeBtn");
  const apply = (theme, save) => {
    document.documentElement.dataset.theme = theme;
    const dark = theme === "dark";
    btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    btn.innerHTML = `<svg class="i" aria-hidden="true"><use href="#i-${dark ? "sun" : "moon"}"/></svg>`;
    if (save) { try { localStorage.setItem("nxt.theme", theme); } catch { /* ignore */ } }
  };
  apply(document.documentElement.dataset.theme || "light", false);
  btn.addEventListener("click", () => apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
}

initDialogs();
initTheme();
walletUi.init();
dex.init();
launch.init();
ai.init();
home.init(dex.openToken);
window.addEventListener("hashchange", route);
route();
