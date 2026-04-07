import Image from "next/image";
import Link from "next/link";
import { resolveDeploymentMode } from "@/lib/deployment-mode";
import { headers } from "next/headers";

export async function NavBar() {
  const mode = resolveDeploymentMode();
  let userLabel: string | null = null;

  if (mode === "hosted") {
    try {
      const { resolveHostedWorkspaceActor } = await import("@/lib/hosted-auth");
      const actor = await resolveHostedWorkspaceActor({
        requestHeaders: await headers()
      });
      userLabel = actor?.label ?? null;
    } catch {
      // Session check failed — show unauthenticated state
    }
  }

  return (
    <nav className="site-nav" aria-label="Main navigation">
      <div className="site-nav-inner">
        <Link href="/" className="site-nav-logo" aria-label="Viva La Tax home">
          <Image
            src="/brand/logo-128.png"
            alt=""
            width={48}
            height={48}
            className="site-nav-mark"
          />
          <span className="site-nav-wordmark">
            <span className="site-nav-wordmark-title">Viva La Tax</span>
            <span className="site-nav-wordmark-subtitle">Open-source tax software.</span>
          </span>
        </Link>
        <div className="site-nav-links">
          <Link href="/" className="site-nav-link">
            My Returns
          </Link>
          <Link href="/help" className="site-nav-link">
            Help
          </Link>
          {mode === "self-host" ? (
            <span className="site-nav-badge">Local Mode</span>
          ) : userLabel ? (
            <span className="site-nav-user">
              <span className="site-nav-user-label">{userLabel}</span>
              <Link href="/billing" className="site-nav-link site-nav-link-small">
                Billing
              </Link>
              <Link href="/api/auth/sign-out" className="site-nav-link site-nav-link-small">
                Sign Out
              </Link>
            </span>
          ) : (
            <Link href="/account?mode=sign-in" className="site-nav-link">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
