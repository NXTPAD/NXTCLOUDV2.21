// Tiny shared store: the active network follows the person across DEX and Launchpad.
import { CHAINS } from "./data.js";

const state = { chain: "solana" };
const subs = new Set();

try {
  const saved = localStorage.getItem("nxt.chain");
  if (CHAINS.some((c) => c.id === saved)) state.chain = saved;
} catch { /* storage may be unavailable */ }

export const store = {
  get: () => state,
  set(patch) {
    const before = state.chain;
    Object.assign(state, patch);
    if (state.chain !== before) {
      try { localStorage.setItem("nxt.chain", state.chain); } catch { /* ignore */ }
    }
    subs.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
