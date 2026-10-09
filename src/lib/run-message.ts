import type { UIMessage } from "ai";
import type { RunConditions } from "./conditions";

export type RunMessage = UIMessage<{ conditions: RunConditions }>;
