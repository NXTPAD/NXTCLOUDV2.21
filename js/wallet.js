// Wallet connection for Solana (Phantom) and EVM (any injected wallet).
// Nothing here ever touches keys: every signature happens inside the wallet.
import { chainByEvmId } from "./data.js";

const state = { type: null, address: null, chainId: null };
const subs = new Set();
let listening = { solana: false, evm: false };

export const get = () => ({ ...state });
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
const emit = () => subs.forEach((fn) => fn(get()));

const remember = (v) => { try { v ? localStorage.setItem("nxt.wallet", v) : localStorage.removeItem("nxt.wallet"); } catch { /* ignore */ } };
const remembered = () => { try { return localStorage.getItem("nxt.wallet"); } catch { return null; } };

function normalizeChainId(id) {
  if (typeof id === "number") return "0x" + id.toString(16);
  return String(id || "").toLowerCase();
}

export function providers() {
  const phantom = window.phantom && window.phantom.solana && window.phantom.solana.isPhantom
    ? window.phantom.solana
    : window.solana && window.solana.isPhantom ? window.solana : null;
  let evm = window.ethereum || null;
  if (evm && Array.isArray(evm.providers) && evm.providers.length) {
    evm = evm.providers.find((p) => !p.isPhantom) || evm.providers[0];
  }
  return { solana: phantom, evm };
}

export function shortAddress(address = state.address) {
  if (!address) return "";
  return address.startsWith("0x") ? address.slice(0, 6) + "…" + address.slice(-4) : address.slice(0, 4) + "…" + address.slice(-4);
}

export function networkLabel() {
  if (state.type === "solana") return "Solana";
  if (state.type === "evm") {
    const c = chainByEvmId(state.chainId);
    return c ? c.name : `Unknown network (${state.chainId})`;
  }
  return "";
}

function clear() {
  state.type = null; state.address = null; state.chainId = null;
  remember(null);
  emit();
}

function listenSolana(p) {
  if (listening.solana || !p.on) return;
  listening.solana = true;
  p.on("disconnect", () => { if (state.type === "solana") clear(); });
  p.on("accountChanged", (pk) => {
    if (state.type !== "solana") return;
    if (pk) { state.address = pk.toString(); emit(); } else clear();
  });
}

function listenEvm(p) {
  if (listening.evm || !p.on) return;
  listening.evm = true;
  p.on("accountsChanged", (accounts) => {
    if (state.type !== "evm") return;
    if (!accounts || !accounts.length) clear();
    else { state.address = accounts[0]; emit(); }
  });
  p.on("chainChanged", (id) => {
    if (state.type !== "evm") return;
    state.chainId = normalizeChainId(id);
    emit();
  });
  p.on("disconnect", () => { if (state.type === "evm") clear(); });
}

export async function connect(kind) {
  const { solana, evm } = providers();
  if (kind === "solana") {
    if (!solana) throw new Error("Phantom wasn't found. Install it, then reload this page.");
    const res = await solana.connect();
    const pk = (res && res.publicKey) || solana.publicKey;
    if (!pk) throw new Error("Phantom didn't return an address.");
    listenSolana(solana);
    state.type = "solana"; state.address = pk.toString(); state.chainId = null;
  } else if (kind === "evm") {
    if (!evm) throw new Error("No browser wallet was found. Install one such as MetaMask, then reload this page.");
    const accounts = await evm.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts.length) throw new Error("The wallet didn't share an account.");
    const chainId = await evm.request({ method: "eth_chainId" });
    listenEvm(evm);
    state.type = "evm"; state.address = accounts[0]; state.chainId = normalizeChainId(chainId);
  } else {
    throw new Error("That wallet type isn't supported yet.");
  }
  remember(state.type);
  emit();
}

export async function disconnect() {
  if (state.type === "solana") {
    try { await providers().solana.disconnect(); } catch { /* wallet may already be disconnected */ }
  }
  clear();
}

/** Reconnect silently if the person connected before and the wallet still trusts this site. */
export async function autoConnect() {
  const last = remembered();
  const { solana, evm } = providers();
  try {
    if (last === "solana" && solana) {
      const res = await solana.connect({ onlyIfTrusted: true });
      const pk = (res && res.publicKey) || solana.publicKey;
      if (pk) { listenSolana(solana); state.type = "solana"; state.address = pk.toString(); emit(); }
    } else if (last === "evm" && evm) {
      const accounts = await evm.request({ method: "eth_accounts" });
      if (accounts && accounts.length) {
        const chainId = await evm.request({ method: "eth_chainId" });
        listenEvm(evm);
        state.type = "evm"; state.address = accounts[0]; state.chainId = normalizeChainId(chainId);
        emit();
      }
    }
  } catch { /* stay disconnected */ }
}

export async function switchEvmChain(chain) {
  const { evm } = providers();
  if (!evm || !chain.chainId) throw new Error("No EVM wallet is connected.");
  try {
    await evm.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
  } catch (e) {
    const code = e && (e.code ?? (e.data && e.data.originalError && e.data.originalError.code));
    if (code === 4902 && chain.add) {
      await evm.request({ method: "wallet_addEthereumChain", params: [{ chainId: chain.chainId, ...chain.add }] });
    } else {
      throw e;
    }
  }
  state.chainId = normalizeChainId(await evm.request({ method: "eth_chainId" }));
  emit();
}

/** Native-token balance as a number, or null when it can't be read. */
export async function nativeBalance(chain) {
  if (!state.address) return null;
  try {
    if (state.type === "evm" && chain.family === "evm" && state.chainId === chain.chainId) {
      const hex = await providers().evm.request({ method: "eth_getBalance", params: [state.address, "latest"] });
      return Number(BigInt(hex)) / 1e18;
    }
    if (state.type === "solana" && chain.family === "solana") {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch("https://api.mainnet-beta.solana.com", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [state.address] }),
          signal: ctrl.signal,
        });
        const body = await res.json();
        return body && body.result && typeof body.result.value === "number" ? body.result.value / 1e9 : null;
      } finally {
        clearTimeout(timer);
      }
    }
  } catch { /* balance is optional */ }
  return null;
}

/** Does the connected wallet match the family a network needs? */
export function matchesFamily(chain) {
  return (chain.family === "solana" && state.type === "solana") || (chain.family === "evm" && state.type === "evm");
}
