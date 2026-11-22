
import './style.css';

import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { bsc } from '@reown/appkit/networks';
import {
  BrowserProvider,
  Contract,
  formatUnits,
  parseUnits
} from 'ethers';

// BNB Smart Chain
const CHAIN_ID = 56;
const CHAIN_HEX = '0x38';

const TOKEN_ADDRESS = '0x252345178fb4E2b5724B96756c47Da89b618CD30';
const SALE_ADDRESS = '0x95969e4888A0afC7bb54c30F020a353407B35e0F';
const MINING_ADDRESS = '0x4203f81841284D6248E4eE45384f2685c07e4070';
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

const PROJECT_ID = 'be63be7be2e8c243abb3a982be799a67';

const metadata = {
  name: 'Tradelix AI',
  description: 'Tradelix AI TLX Mining Platform',
  url: 'https://habib7514.github.io/Tradelix-mining/',
  icons: []
};

const tokenABI = [
  'function balanceOf(address) view returns (uint256)'
];

const usdtABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)'
];

const saleABI = [
  'function buy(uint256)',
  'function firstPurchaseTokens(address) view returns (uint256)',
  'function firstPurchaseTime(address) view returns (uint256)'
];

const miningABI = [
  'function claim()',
  'function lastClaimTime(address) view returns (uint256)',
  'function miningReserveBalance() view returns (uint256)',
  'function remainingRewards() view returns (uint256)'
];

// Page elements
const connectButton = document.getElementById('connectButton');
const walletElement = document.getElementById('wallet');
const statusElement = document.getElementById('status');
const buyButton = document.getElementById('buyButton');
const amountInput = document.getElementById('purchaseAmount');
const balanceElement = document.getElementById('balance');
const eligibleElement = document.getElementById('eligible');
const rewardElement = document.getElementById('reward');
const claimButton = document.querySelector('.claim');
const miningStatusElement = document.querySelector('.card:nth-of-type(4) .status');

let walletProvider = null;
let walletAddress = null;
let busy = false;
let refreshRunning = false;
let listeningProvider = null;
let modal = null;

// Messages
function setStatus(message) {
  if (statusElement) statusElement.textContent = message;
}

function setMiningStatus(message) {
  if (miningStatusElement) miningStatusElement.textContent = message;
}

function showError(error) {
  console.error('TLX Error:', error);

  const message =
    error?.shortMessage ||
    error?.reason ||
    error?.message ||
    'Transaction failed';

  setStatus(message);
  setMiningStatus(message);
}

function shorten(address) {
  return address.slice(0, 8) + '...' + address.slice(-6);
}

function displayAmount(value) {
  return Number(formatUnits(value, 18)).toLocaleString('en-US', {
    maximumFractionDigits: 6
  });
}

// Find the injected wallet provider
function getInjectedProvider() {
  if (!window.ethereum) return null;

  const providers = window.ethereum.providers;

  if (Array.isArray(providers)) {
    return providers.find(
      provider =>
        provider.isTokenPocket ||
        provider.isTP ||
        provider.isMetaMask
    ) || providers[0];
  }

  return window.ethereum;
}

// Attach wallet event listeners
function attachProviderListeners(provider) {
  if (
    !provider ||
    typeof provider.on !== 'function' ||
    listeningProvider === provider
  ) {
    return;
  }

  listeningProvider = provider;

  provider.on('accountsChanged', handleAccountsChanged);
  provider.on('chainChanged', handleChainChanged);
}

// Reset wallet display
function resetWalletDisplay() {
  walletAddress = null;

  if (walletElement) walletElement.textContent = 'Not connected';
  if (connectButton) connectButton.textContent = 'CONNECT WALLET';

  if (balanceElement) balanceElement.textContent = '-- TLX';
  if (eligibleElement) eligibleElement.textContent = '-- TLX';
  if (rewardElement) rewardElement.textContent = '-- TLX';

  if (claimButton) claimButton.disabled = true;

  setStatus('Please connect your wallet');
  setMiningStatus('Connect your wallet to view mining status.');
}

// Connect directly to TokenPocket or another injected wallet
async function connectInjectedWallet() {
  const provider = getInjectedProvider();

  if (!provider) {
    return false;
  }

  walletProvider = provider;
  setStatus('Connecting to your wallet...');

  const accounts = await provider.request({
    method: 'eth_requestAccounts'
  });

  if (!accounts || !accounts[0]) {
    throw new Error('No wallet account was returned.');
  }

  walletAddress = accounts[0];

  if (walletElement) {
    walletElement.textContent = shorten(walletAddress);
  }

  if (connectButton) {
    connectButton.textContent = 'WALLET CONNECTED';
  }

  attachProviderListeners(provider);

  setStatus('Wallet connected. Checking network...');

  await getWallet();

  setStatus('Wallet connected successfully.');
  await refreshDashboard();

  return true;
}

// Get active wallet and verify network
async function getWallet() {
  if (!walletProvider) {
    throw new Error('Please connect your wallet first.');
  }

  let accounts = await walletProvider.request({
    method: 'eth_accounts'
  });

  if (!accounts || !accounts[0]) {
    throw new Error('Please connect your wallet first.');
  }

  const activeAddress = accounts[0];

  walletAddress = activeAddress;

  if (walletElement) {
    walletElement.textContent = shorten(activeAddress);
  }

  let provider = new BrowserProvider(walletProvider, 'any');
  let network = await provider.getNetwork();

  if (Number(network.chainId) !== CHAIN_ID) {
    setStatus('Switching to BNB Smart Chain...');

    await walletProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_HEX }]
    });

    provider = new BrowserProvider(walletProvider, 'any');
    network = await provider.getNetwork();
  }

  if (Number(network.chainId) !== CHAIN_ID) {
    throw new Error('Please switch to BNB Smart Chain.');
  }

  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();

  if (signerAddress.toLowerCase() !== activeAddress.toLowerCase()) {
    throw new Error('Wallet account changed. Please reconnect.');
  }

  return {
    provider,
    signer,
    address: signerAddress
  };
}

// Button loading state
function setBusy(value) {
  busy = value;

  if (buyButton) {
    buyButton.disabled = value;
    buyButton.textContent = value ? 'PLEASE WAIT...' : 'BUY TLX';
  }

  if (claimButton) {
    claimButton.disabled = value;
    claimButton.textContent = value ? 'PLEASE WAIT...' : 'CLAIM MINING';
  }
}

// Refresh balances and mining information
async function refreshDashboard() {
  if (!walletProvider || !walletAddress || refreshRunning) return;

  refreshRunning = true;

  try {
    const { provider, address } = await getWallet();

    const token = new Contract(TOKEN_ADDRESS, tokenABI, provider);
    const sale = new Contract(SALE_ADDRESS, saleABI, provider);
    const mining = new Contract(MINING_ADDRESS, miningABI, provider);

    const [
      tokenBalance,
      eligibleAmount,
      purchaseTime,
      lastClaim,
      reserve,
      remainingRewards
    ] = await Promise.all([
      token.balanceOf(address),
      sale.firstPurchaseTokens(address),
      sale.firstPurchaseTime(address),
      mining.lastClaimTime(address),
      mining.miningReserveBalance(),
      mining.remainingRewards()
    ]);

    if (
      !walletAddress ||
      walletAddress.toLowerCase() !== address.toLowerCase()
    ) return;

    if (balanceElement) {
      balanceElement.textContent = displayAmount(tokenBalance) + ' TLX';
    }

    if (eligibleElement) {
      eligibleElement.textContent = displayAmount(eligibleAmount) + ' TLX';
    }

    const dailyReward =
      Number(formatUnits(eligibleAmount, 18)) * 0.0025;

    if (rewardElement) {
      rewardElement.textContent = dailyReward.toFixed(6) + ' TLX';
    }

    if (claimButton) {
      const previousTime =
        Number(lastClaim) > 0 ? Number(lastClaim) : Number(purchaseTime);

      const now = Math.floor(Date.now() / 1000);

      const ready =
        previousTime > 0 &&
        now >= previousTime + 86400 &&
        eligibleAmount > 0n &&
        reserve > 0n &&
        remainingRewards > 0n &&
        !busy;

      claimButton.disabled = !ready || busy;

      if (eligibleAmount === 0n) {
        setMiningStatus('No eligible purchase found.');
      } else if (reserve === 0n || remainingRewards === 0n) {
        setMiningStatus('Mining rewards are currently unavailable.');
      } else if (ready) {
        setMiningStatus('Mining reward is ready to claim.');
      } else {
        const remaining = Math.max(0, previousTime + 86400 - now);
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);

        setMiningStatus(`Next claim available in ${hours}h ${minutes}m`);
      }
    }

    setStatus('Wallet connected successfully.');
  } catch (error) {
    showError(error);
  } finally {
    refreshRunning = false;
  }
}

// Handle account changes
function handleAccountsChanged(accounts) {
  const nextAddress = accounts?.[0];

  if (!nextAddress) {
    resetWalletDisplay();
    return;
  }

  walletAddress = nextAddress;

  if (walletElement) {
    walletElement.textContent = shorten(nextAddress);
  }

  if (connectButton) {
    connectButton.textContent = 'WALLET CONNECTED';
  }

  setStatus('Wallet account changed.');
  refreshDashboard();
}

// Handle network changes
function handleChainChanged() {
  setStatus('Network changed. Updating dashboard...');
  refreshDashboard();
}

// Register button events immediately
connectButton?.addEventListener('click', async () => {
  if (busy) return;

  try {
    const connected = await connectInjectedWallet();

    if (!connected) {
      if (modal) {
        modal.open();
      } else {
        setStatus('No compatible wallet detected. Open this website inside TokenPocket.');
      }
    }
  } catch (error) {
    showError(error);
  }
});

// Buy TLX
buyButton?.addEventListener('click', async () => {
  if (busy) return;

  try {
    setBusy(true);
    setStatus('Preparing purchase...');

    const { signer, address } = await getWallet();

    const amountText = amountInput?.value?.trim();

    if (
      !amountText ||
      !Number.isFinite(Number(amountText)) ||
      Number(amountText) <= 0
    ) {
      throw new Error('Enter a valid USDT amount.');
    }

    if (Number(amountText) < 5) {
      throw new Error('Minimum purchase is 5 USDT.');
    }

    const amount = parseUnits(amountText, 18);

    const usdt = new Contract(USDT_ADDRESS, usdtABI, signer);
    const sale = new Contract(SALE_ADDRESS, saleABI, signer);

    const allowance = await usdt.allowance(address, SALE_ADDRESS);

    if (allowance < amount) {
      setStatus('Please approve USDT spending...');

      const approval = await usdt.approve(SALE_ADDRESS, amount);

      setStatus('Waiting for USDT approval...');
      await approval.wait();
    }

    setStatus('Sending purchase transaction...');

    const transaction = await sale.buy(amount);

    setStatus('Purchase submitted. Waiting for confirmation...');
    await transaction.wait();

    setStatus('Purchase completed successfully.');

    if (amountInput) amountInput.value = '';

    await refreshDashboard();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
    refreshDashboard();
  }
});

// Claim mining reward
claimButton?.addEventListener('click', async () => {
  if (busy) return;

  try {
    setBusy(true);
    setMiningStatus('Preparing mining claim...');

    const { signer } = await getWallet();

    const mining = new Contract(MINING_ADDRESS, miningABI, signer);

    const transaction = await mining.claim();

    setMiningStatus('Claim submitted. Waiting for confirmation...');

    await transaction.wait();

    setMiningStatus('Mining reward claimed successfully.');

    await refreshDashboard();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
    refreshDashboard();
  }
});

// Initialize Reown as a fallback.
// A Reown initialization error must not disable the direct wallet connection.
try {
  const networks = [bsc];

  const wagmiAdapter = new WagmiAdapter({
    projectId: PROJECT_ID,
    networks
  });

  modal = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId: PROJECT_ID,
    metadata,
    features: {
      analytics: true,
      email: false,
      socials: []
    }
  });

  modal.subscribeAccount(account => {
    if (account?.isConnected && account.address) {
      walletAddress = account.address;

      if (walletElement) {
        walletElement.textContent = shorten(account.address);
      }

      if (connectButton) {
        connectButton.textContent = 'WALLET CONNECTED';
      }

      setStatus('Wallet connected successfully.');
      refreshDashboard();
    } else if (!walletProvider) {
      resetWalletDisplay();
    }
  });

  modal.subscribeProviders(providers => {
    if (!walletProvider && providers?.eip155) {
      walletProvider = providers.eip155;
      attachProviderListeners(walletProvider);

      if (walletAddress) refreshDashboard();
    }
  });
} catch (error) {
  console.error('Reown initialization failed:', error);
  setStatus('Direct wallet connection is available.');
}

// Detect an already authorized injected wallet
async function detectExistingWallet() {
  const provider = getInjectedProvider();

  if (!provider) return;

  walletProvider = provider;
  attachProviderListeners(provider);

  try {
    const accounts = await provider.request({
      method: 'eth_accounts'
    });

    if (accounts?.[0]) {
      walletAddress = accounts[0];

      if (walletElement) {
        walletElement.textContent = shorten(walletAddress);
      }

      if (connectButton) {
        connectButton.textContent = 'WALLET CONNECTED';
      }

      setStatus('Wallet detected. Loading account...');
      await refreshDashboard();
    }
  } catch (error) {
    console.error('Wallet detection:', error);
  }
}

// Initial state
if (claimButton) claimButton.disabled = true;

setMiningStatus('Connect your wallet to view mining status.');

detectExistingWallet();

// Refresh dashboard periodically
setInterval(() => {
  if (walletAddress && walletProvider) {
    refreshDashboard();
  }
}, 30000);
