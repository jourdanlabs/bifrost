// Bare-code detection.
//
// METEOR (intentionally) only recognizes code inside triple-fence markers,
// because that is what a chat UI returns. The CLI use case is different —
// when output is piped from another tool (`codex foo | bifrost verify`),
// the text comes in as raw source with no fences.
//
// This module sits beside METEOR (it does not modify it) and exposes a
// single helper that tells the pipeline whether to treat the input as a
// bare code block. The pipeline merges this finding into the MeteorClaims
// it already has, so PULSAR's edge-case probe sees the same shape it
// would for a fenced code block.

const BARE_CODE_SIGNATURES: RegExp[] = [
  /\bfunction\s+\w+\s*\(/,
  /\b(?:const|let|var)\s+\w+\s*=\s*(?:\([^)]*\)|\w+)\s*=>/,
  /\bdef\s+\w+\s*\(/,
  /\bclass\s+\w+(?:\s*\([^)]*\))?\s*[:{]/,
  /\b(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?\w[\w<>,\s]*\s+\w+\s*\([^)]*\)\s*\{/,
  /\bfn\s+\w+\s*[<(]/,
  /\bfunc\s+\w+\s*\(/,
];

const MIN_BARE_CODE_LEN = 12;

export function looksLikeBareCode(text: string): boolean {
  if (!text || text.length < MIN_BARE_CODE_LEN) return false;
  return BARE_CODE_SIGNATURES.some((re) => re.test(text));
}

// Convenience for the pipeline: returns the synthesized code-block array
// to add to MeteorClaims.code_blocks, or null if the text isn't bare code
// (or if the caller already found fenced code, which takes precedence).
export function bareCodeBlock(text: string, existingCodeBlocks: number): string[] | null {
  if (existingCodeBlocks > 0) return null;
  if (!looksLikeBareCode(text)) return null;
  return [text];
}
