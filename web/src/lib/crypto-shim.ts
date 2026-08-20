/**
 * `crypto.randomUUID` for insecure contexts, so the app RENDERS on a phone.
 *
 * ## ⚠️ What breaks without this, and why it is not a production concern
 *
 * `crypto.randomUUID` is only exposed in a **secure context** — HTTPS, or the
 * `localhost` exemption. `@neondatabase/auth` calls it at **module
 * evaluation**, and `AuthProvider` is mounted in the root layout, so on an
 * insecure origin the failure is not a broken sign-in button: it is
 * `TypeError: crypto.randomUUID is not a function` thrown out of `RootLayout`
 * and **every route on the site rendering "This page couldn't load"** —
 * including `/about` and `/terms`, which are meant to be readable signed out.
 *
 * | origin | secure context | without this shim |
 * |---|---|---|
 * | production, HTTPS | yes | fine — this never runs |
 * | `http://localhost:3000` | yes (exemption) | fine — this never runs |
 * | ⚠️ `http://192.168.1.166:3000` | **no** | **every page dead** |
 *
 * That third row is not a hypothetical. `next.config.ts` defaults
 * `allowedDevOrigins` to this machine's LAN addresses specifically so the
 * **Network:** URL `next dev` prints works on a phone, and the commit before
 * this one exists to unbreak that same workflow. Measured in a real browser at
 * `http://192.168.1.166:3000`: `isSecureContext: false`,
 * `crypto.randomUUID: undefined`, `crypto.subtle: undefined`,
 * `crypto.getRandomValues: function`.
 *
 * ## ⚠️ This does NOT make signing in work over http-on-LAN, and cannot
 *
 * `crypto.subtle` is missing in the same contexts and there is no honest
 * polyfill for it — a hand-rolled substitute for WebCrypto on the path that
 * handles session tokens is far worse than the failure it replaces. **What
 * this buys is the page rendering**, which is what checking a layout on a
 * phone needs. Actually completing a sign-in needs a secure origin: use
 * `localhost`, or run `next dev --experimental-https`.
 *
 * ## The randomness is real
 *
 * `crypto.getRandomValues` **is** available in insecure contexts — it is one of
 * the few `crypto` members not gated on secure context — so this is a CSPRNG,
 * not `Math.random()` wearing a UUID's shape. `Math.random()` here would be the
 * `ratFor` mistake with worse consequences: session identifiers drawn from a
 * predictable source. If `getRandomValues` is ever missing too, this throws
 * rather than degrading, because a UUID that only looks random is the failure
 * that does not announce itself.
 *
 * ## ⚠️ Import this FIRST, as a side effect, or it does nothing
 *
 * ES module evaluation follows import order, and the SDK reads `randomUUID` at
 * module scope — so this has to be evaluated before `@neondatabase/auth` is.
 * `import "./crypto-shim"` sits above the SDK import in `auth-client.ts` and
 * **the order of those two lines is load-bearing**. An import sorter that
 * moves it below is not a formatting change; it restores the crash. A
 * statement at the top of `auth-client.ts`'s body would not work either —
 * imports are hoisted and all of them run first.
 */

type UUID = `${string}-${string}-${string}-${string}-${string}`;

function uuidv4(): UUID {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // RFC 4122 §4.4: version 4 in the high nibble of byte 6, variant 10x in the
  // top bits of byte 8. Without these two lines the value is 128 random bits
  // that is not a valid v4 UUID, and anything that validates the shape rejects
  // it.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));

  const b = bytes;
  return (
    hex[b[0]] + hex[b[1]] + hex[b[2]] + hex[b[3]] + "-" +
    hex[b[4]] + hex[b[5]] + "-" +
    hex[b[6]] + hex[b[7]] + "-" +
    hex[b[8]] + hex[b[9]] + "-" +
    hex[b[10]] + hex[b[11]] + hex[b[12]] + hex[b[13]] + hex[b[14]] + hex[b[15]]
  ) as UUID;
}

// `globalThis.crypto` is absent during the static export's prerender in some
// Node versions, and there is nothing to shim there — no auth code runs at
// build time. Guarding on it keeps this a no-op rather than a build failure.
if (
  typeof globalThis !== "undefined" &&
  typeof globalThis.crypto !== "undefined" &&
  typeof globalThis.crypto.randomUUID !== "function" &&
  typeof globalThis.crypto.getRandomValues === "function"
) {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: uuidv4,
    writable: true,
    configurable: true,
  });
}

export {};
