// NXT AI: chat against /api/chat (Cloudflare Workers AI).
import { sendChat } from "./api.js";
import { $, esc, icon, toast } from "./ui.js";

const PROMPTS = [
  "What should I check before buying a new token?",
  "Explain how a swap on a DEX works, step by step.",
  "How do fees and speed differ between Base and Arbitrum?",
  "What does slippage mean, and how do I choose it?",
];

const WELCOME = "Hi, I'm NXT AI. Ask me about tokens, transactions, wallets or how the eight networks compare. I can't see live prices or look up a specific transaction, but I can explain what to look for.";

const S = { history: [], pending: false, status: "checking", lastUser: null, gen: 0 };

/** Minimal, safe formatting: escapes first, then supports **bold**, `code`, lists and paragraphs. */
export function renderMarkdown(text) {
  const blocks = String(text).replace(/\r\n/g, "\n").split(/\n{2,}/);
  const inline = (s) => esc(s)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return blocks.map((block) => {
    const lines = block.split("\n").filter((l) => l.trim());
    if (!lines.length) return "";
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
    }
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

function scrollDown() {
  const box = $("#messages");
  if (getComputedStyle(box).overflowY === "visible") {
    window.scrollTo(0, document.documentElement.scrollHeight);   // mobile: the page scrolls, not the panel
  } else {
    box.scrollTop = box.scrollHeight;
  }
}

function avatar() {
  return `<span class="msg-av" aria-hidden="true"><img class="logo" src="assets/img/logo.png" alt="" width="30" height="30"></span>`;
}

function addMessage(role, html, extra = "") {
  const el = document.createElement("div");
  el.className = `msg msg-${role} ${extra}`;
  el.innerHTML = role === "assistant" ? `${avatar()}<div class="bubble">${html}</div>` : `<div class="bubble">${html}</div>`;
  $("#messages").appendChild(el);
  scrollDown();
  return el;
}

function resetChat() {
  S.gen++;
  setTyping(false);
  setPending(false);
  S.history = [];
  S.lastUser = null;
  $("#messages").innerHTML = "";
  addMessage("assistant", `<p>${esc(WELCOME)}</p>`);
}

function setPending(on) {
  S.pending = on;
  $("#sendBtn").disabled = on || S.status === "offline";
  $("#chatInput").disabled = S.status === "offline";
}

function applyStatus(state) {
  S.status = state;
  const input = $("#chatInput");
  const offline = state === "offline";
  input.disabled = offline;
  input.placeholder = offline ? "NXT AI is offline on this deployment" : "Ask NXT AI anything";
  $("#sendBtn").disabled = offline || S.pending;
  const existing = $("#aiOffline");
  if (offline && !existing) {
    const note = document.createElement("div");
    note.className = "callout";
    note.id = "aiOffline";
    note.innerHTML = `${icon("alert")}<p><b>NXT AI isn't enabled here.</b> The deployment needs a Cloudflare Workers AI binding named <code>AI</code>. The README explains how to add it.</p>`;
    $("#messages").after(note);
  } else if (!offline && existing) {
    existing.remove();
  }
}

async function ask(text) {
  const clean = text.trim();
  if (!clean || S.pending || S.status === "offline") return;

  S.history.push({ role: "user", content: clean });
  S.lastUser = clean;
  addMessage("user", `<p>${esc(clean).replace(/\n/g, "<br>")}</p>`);
  await respond();
}

let typingEl = null;
function setTyping(on) {
  if (on && !typingEl) {
    typingEl = addMessage("assistant", '<span class="typing" aria-label="NXT AI is typing"><i></i><i></i><i></i></span>');
  } else if (!on && typingEl) {
    typingEl.remove();
    typingEl = null;
  }
}

async function respond() {
  const gen = S.gen;
  setPending(true);
  setTyping(true);
  try {
    const reply = await sendChat(S.history);
    if (gen !== S.gen) return;              // chat was reset while waiting
    setTyping(false);
    S.history.push({ role: "assistant", content: reply });
    addMessage("assistant", renderMarkdown(reply));
  } catch (e) {
    if (gen !== S.gen) return;
    setTyping(false);
    const el = addMessage("assistant", `<p>${esc(e.message || "Something went wrong.")}</p><button class="btn btn-quiet btn-sm" type="button" data-retry>${icon("refresh")}Try again</button>`, "is-error");
    $("[data-retry]", el).addEventListener("click", async () => {
      if (S.pending) return;
      el.remove();
      await respond();
    }, { once: true });
  } finally {
    if (gen === S.gen) {
      setPending(false);
      if (S.status !== "offline") $("#chatInput").focus({ preventScroll: true });
    }
  }
}

function autoGrow() {
  const t = $("#chatInput");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 160) + "px";
}

export function init() {
  $("#prompts").innerHTML = PROMPTS.map((p) => `<button type="button" class="prompt">${esc(p)}</button>`).join("");
  $("#prompts").addEventListener("click", (e) => {
    const b = e.target.closest(".prompt");
    if (b) ask(b.textContent);
  });

  $("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chatInput");
    const text = input.value;
    if (!text.trim()) return;
    input.value = "";
    autoGrow();
    ask(text);
  });

  $("#chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("#chatForm").requestSubmit();
    }
  });
  $("#chatInput").addEventListener("input", autoGrow);

  $("#newChat").addEventListener("click", () => { resetChat(); toast("Started a new chat"); });

  document.addEventListener("ai-status", (e) => applyStatus(e.detail));

  resetChat();
}
