/** Owner-controlled configuration, never wallet keys, RPCs, provider URLs or reward recipients. */
export type HostedStrategy = "conservative" | "balanced" | "aggressive";
export interface AgentSettings { name: string; modelId: string; strategy: HostedStrategy; perRunBudgetRaw: string; totalBudgetRaw: string; allowCredit: boolean }
export interface HostedBinding { chainId: string; agentId: string; wallet: string }
export interface HostedAgent extends AgentSettings {
  id: string; owner: string; wallet: string; createdAt: string; updatedAt: string;
  status: "Pending" | "Ready" | "Paused"; binding?: HostedBinding;
  spentRaw: string; reservedRaw: string; activeRequestId?: string;
}
export type HostedAction = "provision" | "deposit" | "task" | "game" | "credits";
export interface HostedRun {
  requestId: string; agentId: string; action: HostedAction; rewardKind?: "usdc" | "llm-credits"; amountRaw?: string;
  status: "Queued" | "Running" | "Paused" | "Succeeded" | "Failed";
  createdAt: string; updatedAt: string; reservedRaw: string; chargedRaw: string; recoverable: boolean;
  reason?: string; result?: HostedResult;
}
/** Explicit public projection: adapters must not return private state or model text. */
export interface HostedResult {
  phase: string; terminal: boolean; success: boolean; chargedRaw: string; reason?: string;
  binding?: HostedBinding; taskId?: string; paymentId?: string; txHash?: string; matchId?: string;
  cashRaw?: string; principalRaw?: string; feeRaw?: string; rewardRaw?: string;
  creditsGranted?: number; creditsUsed?: number;
}
export interface HostedExecution {
  agent: HostedAgent; run: HostedRun; directory: string; keyFile: string; recover: boolean;
}
export interface HostedExecutor { execute(input: HostedExecution): Promise<HostedResult> }
export interface HostedCatalogModel { id: string; label: string }
export interface HostedConfig {
  directory: string; origin: string; chainId: "31337" | "10143"; models: HostedCatalogModel[];
  maxAgentsPerOwner: number; maxTotalBudgetRaw: string; maxPerRunBudgetRaw: string;
}
export class HostedError extends Error { constructor(readonly code: string, readonly status = 400) { super(code); } }
