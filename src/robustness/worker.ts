import { runRobustness } from "./engine.js";
import type { RobustnessRequest } from "./types.js";

export interface RobustnessWorkerRequest {
  type: "run" | "cancel";
  request?: RobustnessRequest;
  cancellationBuffer?: SharedArrayBuffer;
}

export interface RobustnessWorkerResponse {
  type: "progress" | "complete" | "error";
  completed?: number;
  total?: number;
  label?: string;
  result?: ReturnType<typeof runRobustness>;
  error?: string;
}

const workerScope = globalThis as unknown as { postMessage: (message: RobustnessWorkerResponse) => void; addEventListener: (type: "message", listener: (event: MessageEvent<RobustnessWorkerRequest>) => void) => void };
let cancelled = false;

workerScope.addEventListener("message", (event) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    if (event.data.cancellationBuffer) Atomics.store(new Int32Array(event.data.cancellationBuffer), 0, 1);
    return;
  }
  if (event.data.type !== "run" || !event.data.request) return;
  cancelled = false;
  const cancellationFlag = event.data.cancellationBuffer ? new Int32Array(event.data.cancellationBuffer) : undefined;
  try {
    const result = runRobustness(event.data.request, { isCancelled: () => cancelled || (cancellationFlag ? Atomics.load(cancellationFlag, 0) === 1 : false), onProgress: (progress) => workerScope.postMessage({ type: "progress", ...progress }) });
    workerScope.postMessage({ type: "complete", result });
  } catch (error) {
    workerScope.postMessage({ type: "error", error: error instanceof Error ? error.message : "Robustness worker failed" });
  }
});

export function cancelRobustnessWorker(): void {
  cancelled = true;
}

export interface RobustnessCancellationToken {
  buffer: SharedArrayBuffer;
  cancel: () => void;
}

export function createRobustnessCancellationToken(): RobustnessCancellationToken {
  const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const view = new Int32Array(buffer);
  return { buffer, cancel: () => Atomics.store(view, 0, 1) };
}
