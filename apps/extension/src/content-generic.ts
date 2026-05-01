// Generic content script — runs on every site that doesn't have a
// dedicated adapter. Detects completed responses only.

import { startEdge } from "./edge";
import { genericAdapter } from "./adapters/generic";

startEdge(genericAdapter);
