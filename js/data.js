// Networks and tokens known to the interface.

export const FAMILY_LABEL = { solana: "Solana", evm: "EVM", sui: "Sui" };

export const CHAINS = [
  { id: "solana", name: "Solana", family: "solana", native: "SOL", tag: "Popular", hue: 265, defaultDecimals: 9, reserve: 0.01 },
  { id: "ethereum", name: "Ethereum", family: "evm", chainId: "0x1", native: "ETH", tag: "Popular", hue: 225, defaultDecimals: 18, reserve: 0.005 },
  {
    id: "base", name: "Base", family: "evm", chainId: "0x2105", native: "ETH", tag: "Popular", hue: 220, defaultDecimals: 18, reserve: 0.0005,
    add: { chainName: "Base", rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } },
  },
  {
    id: "bnb", name: "BNB Chain", family: "evm", chainId: "0x38", native: "BNB", tag: "Supported", hue: 42, defaultDecimals: 18, reserve: 0.002,
    add: { chainName: "BNB Smart Chain", rpcUrls: ["https://bsc-dataseed.binance.org"], blockExplorerUrls: ["https://bscscan.com"], nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 } },
  },
  {
    id: "polygon", name: "Polygon", family: "evm", chainId: "0x89", native: "POL", tag: "Supported", hue: 275, defaultDecimals: 18, reserve: 0.5,
    add: { chainName: "Polygon", rpcUrls: ["https://polygon-rpc.com"], blockExplorerUrls: ["https://polygonscan.com"], nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 } },
  },
  {
    id: "arbitrum", name: "Arbitrum", family: "evm", chainId: "0xa4b1", native: "ETH", tag: "Supported", hue: 205, defaultDecimals: 18, reserve: 0.0005,
    add: { chainName: "Arbitrum One", rpcUrls: ["https://arb1.arbitrum.io/rpc"], blockExplorerUrls: ["https://arbiscan.io"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } },
  },
  {
    id: "avalanche", name: "Avalanche", family: "evm", chainId: "0xa86a", native: "AVAX", tag: "Supported", hue: 355, defaultDecimals: 18, reserve: 0.02,
    add: { chainName: "Avalanche C-Chain", rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"], blockExplorerUrls: ["https://snowtrace.io"], nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 } },
  },
  { id: "sui", name: "Sui", family: "sui", native: "SUI", tag: "Supported", hue: 195, defaultDecimals: 9, reserve: 0.05 },
];

// cg = CoinGecko asset id, home = the network used when opening this token from the home page.
export const TOKENS = {
  SOL: { symbol: "SOL", name: "Solana", cg: "solana", hue: 265, home: "solana" },
  ETH: { symbol: "ETH", name: "Ether", cg: "ethereum", hue: 225, home: "ethereum" },
  BNB: { symbol: "BNB", name: "BNB", cg: "binancecoin", hue: 42, home: "bnb" },
  POL: { symbol: "POL", name: "Polygon", cg: "polygon-ecosystem-token", hue: 275, home: "polygon" },
  AVAX: { symbol: "AVAX", name: "Avalanche", cg: "avalanche-2", hue: 355, home: "avalanche" },
  SUI: { symbol: "SUI", name: "Sui", cg: "sui", hue: 195, home: "sui" },
  ARB: { symbol: "ARB", name: "Arbitrum", cg: "arbitrum", hue: 205, home: "arbitrum" },
  JUP: { symbol: "JUP", name: "Jupiter", cg: "jupiter-exchange-solana", hue: 150, home: "solana" },
  BONK: { symbol: "BONK", name: "Bonk", cg: "bonk", hue: 24, home: "solana" },
  WBTC: { symbol: "WBTC", name: "Wrapped Bitcoin", cg: "wrapped-bitcoin", hue: 28, home: "ethereum" },
  USDC: { symbol: "USDC", name: "USD Coin", cg: "usd-coin", hue: 212, stable: true, home: "ethereum" },
  USDT: { symbol: "USDT", name: "Tether", cg: "tether", hue: 165, stable: true, home: "ethereum" },
};

export const CHAIN_TOKENS = {
  solana: ["SOL", "USDC", "USDT", "JUP", "BONK"],
  ethereum: ["ETH", "USDC", "USDT", "WBTC"],
  base: ["ETH", "USDC"],
  bnb: ["BNB", "USDT", "USDC"],
  polygon: ["POL", "USDC", "USDT"],
  arbitrum: ["ETH", "ARB", "USDC", "USDT"],
  avalanche: ["AVAX", "USDC", "USDT"],
  sui: ["SUI", "USDC"],
};

export const TAPE = ["SOL", "ETH", "BNB", "POL", "AVAX", "SUI", "ARB", "JUP", "WBTC", "BONK"];

export const chainById = (id) => CHAINS.find((c) => c.id === id) || CHAINS[0];
export const chainTokens = (chainId) => (CHAIN_TOKENS[chainId] || []).map((s) => TOKENS[s]);
export const chainByEvmId = (hex) => CHAINS.find((c) => c.chainId && c.chainId === String(hex).toLowerCase());
