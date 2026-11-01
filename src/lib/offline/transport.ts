/** How a queued operation reaches the server. Separate from the queue so tests can replace it. */
import type { CommandResult } from "@/lib/actions/transactions";
import type { LedgerRecord } from "@/lib/ledger/commands";
import type { QueuedOp } from "@/lib/offline/ops";
import type { SendResult } from "@/lib/offline/queue";

const SEND_TIMEOUT_MS = 20_000;

export type SyncResponse = CommandResult & {
  record?: LedgerRecord | null;
  reason?: string;
  retryable?: boolean;
};

/** Maps the server's answer to what the queue does next. Pure. */
export function toSendResult(result: SyncResponse): SendResult {
  if (result.ok) return { kind: "synced" };
  if (result.status === "conflict" || result.status === "not_found") {
    return {
      kind: "conflict",
      message: result.message,
      reason: result.reason ?? result.status,
      record: result.record ?? null,
    };
  }
  return result.retryable ? { kind: "retry" } : { kind: "failed", message: result.message };
}

export async function sendToServer(op: QueuedOp): Promise<SendResult> {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: op.command, remember: op.remember }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (response.status === 401) return { kind: "signed_out" };
  if (!response.ok) return { kind: "retry" };
  return toSendResult((await response.json()) as SyncResponse);
}
