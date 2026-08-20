/**
 * Vitest, scoped to `src/lib/` on purpose.
 *
 * ⚠️ **`environment: "node"`, and there is no jsdom.** That is a rule rather
 * than a default. Every layout fact in this app is measured in a real browser at
 * 1440x900 and 390x844 and written down in `CLAUDE.md` — the legend's 42px
 * reserve, the rail's 256px gauge slot, the masthead's 54.5px. A jsdom assertion
 * about any of those would be a fake version of a real check: it would pass
 * while the page was broken, because jsdom does not lay anything out.
 *
 * So this runner exists for the pure modules under `src/lib/`, which carry the
 * safety rules a compiler cannot see — the SSE dedupe, the timestamp parse, the
 * sensor comparator, the three staleness clocks. Adding `jsdom` and
 * `@testing-library/react` here is one line, and that is exactly why the refusal
 * is written down instead of implied.
 *
 * `include` is therefore narrow by intent. Widening it is a decision.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig's `paths`. Vitest does not read tsconfig paths on its
    // own, and nothing in `src/lib/` imports through the alias today — this is
    // here so that a lib file which starts to cannot silently fail to resolve.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Report every failure rather than stopping at the first, the same rule
    // `scripts/check_escalation.py` follows and for the same reason: a suite
    // that stops early hides how much moved.
    bail: 0,
  },
});
