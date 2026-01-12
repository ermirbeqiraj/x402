import { x402Facilitator } from "@x402/core/facilitator";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import dotenv from "dotenv";
import express from "express";
import { createWalletClient, defineChain, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, sepolia } from "viem/chains";

dotenv.config();

// Configuration
const PORT = process.env.PORT || "4022";

// Validate required environment variables
if (!process.env.EVM_PRIVATE_KEY) {
  console.error("❌ EVM_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

// Initialize the EVM account from private key
const evmAccount = privateKeyToAccount(
  process.env.EVM_PRIVATE_KEY as `0x${string}`,
);
console.info(`EVM Facilitator account: ${evmAccount.address}`);

// Define BSC Testnet chain
const bscTestnet = defineChain({
  id: 97,
  name: 'BSC Testnet',
  nativeCurrency: { name: 'BNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://bsc-testnet-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://testnet.bscscan.com' },
  },
  testnet: true,
});

// Define BSC Mainnet chain
const bscMainnet = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://bsc-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
  testnet: false,
});

// Define Arbitrum Sepolia chain
const arbitrumSepolia = defineChain({
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://arbitrum-sepolia-rpc.publicnode.com'] },
  },
  blockExplorers: {
    default: { name: 'Arbiscan', url: 'https://sepolia.arbiscan.io' },
  },
  testnet: true,
});

// Create clients for each supported chain
const baseSepoliaClient = createWalletClient({
  account: evmAccount,
  chain: baseSepolia,
  transport: http(process.env.RPC_BASE_SEPOLIA),
}).extend(publicActions);

const bscTestnetClient = createWalletClient({
  account: evmAccount,
  chain: bscTestnet,
  transport: http(process.env.RPC_BSC_TESTNET),
}).extend(publicActions);

const bscMainnetClient = createWalletClient({
  account: evmAccount,
  chain: bscMainnet,
  transport: http(process.env.RPC_BSC_MAINNET),
}).extend(publicActions);

const ethereumSepoliaClient = createWalletClient({
  account: evmAccount,
  chain: sepolia,
  transport: http(process.env.RPC_ETHEREUM_SEPOLIA),
}).extend(publicActions);

const arbitrumSepoliaClient = createWalletClient({
  account: evmAccount,
  chain: arbitrumSepolia,
  transport: http(process.env.RPC_ARBITRUM_SEPOLIA),
}).extend(publicActions);

// Map network identifiers to clients
const chainClients = new Map([
  ['eip155:84532', baseSepoliaClient],     // Base Sepolia
  ['eip155:97', bscTestnetClient],         // BSC Testnet
  ['eip155:56', bscMainnetClient],         // BSC Mainnet
  ['eip155:11155111', ethereumSepoliaClient], // Ethereum Sepolia
  ['eip155:421614', arbitrumSepoliaClient],   // Arbitrum Sepolia
]);

// Helper to get client for a network
const getClientForNetwork = (network: string) => {
  const client = chainClients.get(network);
  if (!client) {
    throw new Error(`No client configured for network: ${network}`);
  }
  return client;
};

// Initialize the x402 Facilitator with multi-chain EVM support
const evmSigner = toFacilitatorEvmSigner({
  getCode: (args: { address: `0x${string}` }) => {
    // For getCode, use Base Sepolia as default (usually for verification)
    return baseSepoliaClient.getCode(args);
  },
  address: evmAccount.address,
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => {
    // For reads, use Base Sepolia as default
    return baseSepoliaClient.readContract({
      ...args,
      args: args.args || [],
    });
  },
  verifyTypedData: (args: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) => baseSepoliaClient.verifyTypedData(args as any),
  writeContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
    network?: string;
  }) => {
    // @ts-expect-error network is added for multi-chain support
    const client = args.network ? getClientForNetwork(args.network) : baseSepoliaClient;
    return client.writeContract({
      ...args,
      args: args.args || [],
    });
  },
  sendTransaction: (args: { to: `0x${string}`; data: `0x${string}`; network?: string }) => {
    // @ts-expect-error network is added for multi-chain support
    const client = args.network ? getClientForNetwork(args.network) : baseSepoliaClient;
    return client.sendTransaction(args);
  },
  waitForTransactionReceipt: (args: { hash: `0x${string}`; network?: string }) => {
    // @ts-expect-error network is added for multi-chain support
    const client = args.network ? getClientForNetwork(args.network) : baseSepoliaClient;
    return client.waitForTransactionReceipt(args);
  },
});

const facilitator = new x402Facilitator()
  .onBeforeVerify(async (context) => {
    console.log("Before verify", context);
  })
  .onAfterVerify(async (context) => {
    console.log("After verify", context);
  })
  .onVerifyFailure(async (context) => {
    console.log("Verify failure", context);
  })
  .onBeforeSettle(async (context) => {
    console.log("Before settle", context);
  })
  .onAfterSettle(async (context) => {
    console.log("After settle", context);
  })
  .onSettleFailure(async (context) => {
    console.log("Settle failure", context);
  });

// Register only V2 networks (no V1)
facilitator.register(
  [
    "eip155:84532",    // Base Sepolia
    "eip155:97",       // BSC Testnet
    "eip155:56",       // BSC Mainnet
    "eip155:11155111", // Ethereum Sepolia
    "eip155:421614",   // Arbitrum Sepolia
  ],
  new ExactEvmScheme(evmSigner, {
    deployERC4337WithEIP6492: true,
  }),
);

// Initialize Express app
const app = express();

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(express.json());

/**
 * POST /verify
 * Verify a payment against requirements
 *
 * Note: Payment tracking and bazaar discovery are handled by lifecycle hooks
 */
app.post("/verify", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    // Hooks will automatically:
    // - Track verified payment (onAfterVerify)
    // - Extract and catalog discovery info (onAfterVerify)
    const response: VerifyResponse = await facilitator.verify(
      paymentPayload,
      paymentRequirements,
    );

    res.json(response);
  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /settle
 * Settle a payment on-chain
 *
 * Note: Verification validation and cleanup are handled by lifecycle hooks
 */
app.post("/settle", async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    // Hooks will automatically:
    // - Validate payment was verified (onBeforeSettle - will abort if not)
    // - Check verification timeout (onBeforeSettle)
    // - Clean up tracking (onAfterSettle / onSettleFailure)
    const response: SettleResponse = await facilitator.settle(
      paymentPayload as PaymentPayload,
      paymentRequirements as PaymentRequirements,
    );

    res.json(response);
  } catch (error) {
    console.error("Settle error:", error);

    // Check if this was an abort from hook
    if (
      error instanceof Error &&
      error.message.includes("Settlement aborted:")
    ) {
      // Return a proper SettleResponse instead of 500 error
      return res.json({
        success: false,
        errorReason: error.message.replace("Settlement aborted: ", ""),
        network: req.body?.paymentPayload?.network || "unknown",
      } as SettleResponse);
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /supported
 * Get supported payment kinds and extensions
 */
app.get("/supported", async (req, res) => {
  try {
    const response = facilitator.getSupported();
    res.json(response);
  } catch (error) {
    console.error("Supported error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Start the server
console.log(`About to listen on port ${PORT}...`);
app.listen(parseInt(PORT), "0.0.0.0", () => {
  console.log(`Facilitator listening on http://0.0.0.0:${PORT}`);
}).on('error', (err) => {
  console.error(`Failed to start server:`, err);
});
