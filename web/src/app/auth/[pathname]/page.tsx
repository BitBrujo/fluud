import { AUTH_VIEW_PATHS } from "@/lib/auth-views";

import { AuthPageClient } from "./auth-page-client";

/**
 * Every auth view except sign-in, which is `/` itself.
 *
 * ⚠️ **This is what makes the route exist in production at all.**
 * `output: "export"` resolves no dynamic segment on demand — the list is
 * enumerated at build time and nothing outside it is ever reachable. The views
 * and the reasoning behind which ones ship are in `lib/auth-views.ts`, which
 * is a directive-free module for a build reason recorded there.
 *
 * This is the same trap `trailingSlash: true` exists for, arriving through a
 * different door. Both reduce to one rule: **a route in this app is a
 * DIRECTORY in the export, or it does not exist.**
 */
export function generateStaticParams() {
  return AUTH_VIEW_PATHS.map((pathname) => ({ pathname }));
}

/**
 * ⚠️ Required under `output: "export"`. Without it Next treats an unknown
 * segment as renderable on demand, which there is no server to do.
 */
export const dynamicParams = false;

export default async function AuthPage({
  params,
}: {
  params: Promise<{ pathname: string }>;
}) {
  const { pathname } = await params;
  return <AuthPageClient pathname={pathname} />;
}
