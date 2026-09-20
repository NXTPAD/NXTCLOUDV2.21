// Header wallet button, connect dialog and account dialog.
import * as wallet from "./wallet.js";
import { $, esc, icon, toast, copyText, openDialog, friendlyError } from "./ui.js";

const walletDialog = () => $("#walletDialog");
const accountDialog = () => $("#accountDialog");

function renderButton() {
  const w = wallet.get();
  const label = $("#walletLabel");
  const btn = $("#walletBtn");
  if (w.address) {
    label.textContent = wallet.shortAddress();
    btn.classList.add("connected");
    btn.setAttribute("aria-label", `Wallet ${wallet.shortAddress()} connected. Open wallet details`);
  } else {
    label.textContent = "Connect wallet";
    btn.classList.remove("connected");
    btn.removeAttribute("aria-label");
  }
}

function renderOptions() {
  const { solana, evm } = wallet.providers();
  const row = (kind, name, sub, present, getUrl, getLabel) => `
    <div class="wallet-opt ${present ? "" : "is-off"}">
      <span class="wo-icon">${icon("wallet")}</span>
      <span class="wo-text"><b>${name}</b><small>${sub}</small></span>
      ${present
        ? `<button class="btn btn-primary btn-sm" type="button" data-connect="${kind}">Connect</button>`
        : `<a class="btn btn-quiet btn-sm" href="${getUrl}" target="_blank" rel="noopener noreferrer">${getLabel}${icon("external")}</a>`}
    </div>`;
  $("#walletOptions").innerHTML = `
    ${row("solana", "Phantom", "Solana", Boolean(solana), "https://phantom.app/download", "Get Phantom")}
    ${row("evm", "Browser wallet", "Ethereum, Base, BNB Chain, Polygon, Arbitrum and Avalanche", Boolean(evm), "https://ethereum.org/en/wallets/find-wallet/", "Find a wallet")}
    <div class="wallet-opt is-off">
      <span class="wo-icon">${icon("wallet")}</span>
      <span class="wo-text"><b>Sui wallets</b><small>Not supported yet</small></span>
    </div>
    <p class="fine">Connecting only shares your public address. Keys never leave your wallet.</p>`;
}

export function openWalletDialog() {
  renderOptions();
  openDialog(walletDialog());
}

async function doConnect(kind) {
  try {
    await wallet.connect(kind);
    walletDialog().close();
    toast(`${wallet.networkLabel()} wallet connected`);
  } catch (e) {
    toast(friendlyError(e));
  }
}

function openAccount() {
  const w = wallet.get();
  if (!w.address) return openWalletDialog();
  $("#accAddress").textContent = w.address;
  $("#accNetwork").textContent = wallet.networkLabel();
  openDialog(accountDialog());
}

export function init() {
  $("#walletBtn").addEventListener("click", () => (wallet.get().address ? openAccount() : openWalletDialog()));
  $("#walletOptions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-connect]");
    if (btn) doConnect(btn.dataset.connect);
  });
  $("#accCopy").addEventListener("click", async () => {
    toast((await copyText(wallet.get().address || "")) ? "Address copied" : "Couldn't copy. Select the address and copy it manually.");
  });
  $("#accDisconnect").addEventListener("click", async () => {
    await wallet.disconnect();
    accountDialog().close();
    toast("Wallet disconnected");
  });
  wallet.subscribe(() => {
    renderButton();
    if (accountDialog().open) {
      if (!wallet.get().address) accountDialog().close();
      else { $("#accAddress").textContent = wallet.get().address; $("#accNetwork").textContent = wallet.networkLabel(); }
    }
  });
  renderButton();
  wallet.autoConnect();
}
