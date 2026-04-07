import Image from "next/image";
import Link from "next/link";
import { TAX_ENGINE_REPO_URL } from "@/lib/project-links";

export function SiteFooter() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <div className="site-footer-logo-lockup">
            <Image
              src="/brand/logo-128.png"
              alt=""
              width={64}
              height={64}
              className="site-footer-mark"
            />
            <div>
              <span className="site-footer-logo">Viva La Tax</span>
              <p className="site-footer-rally-cry">Open-source tax software.</p>
            </div>
          </div>
          <p className="site-footer-tagline">
            Open-source draft-return software. Your data can stay on your device.
          </p>
        </div>
        <nav className="site-footer-links" aria-label="Footer navigation">
          <Link href="/" className="site-footer-link">
            Home
          </Link>
          <Link href="/help" className="site-footer-link">
            Help Center
          </Link>
          <Link href="/terms" className="site-footer-link">
            Terms of Service
          </Link>
          <Link href="/privacy" className="site-footer-link">
            Privacy Policy
          </Link>
          <Link href={TAX_ENGINE_REPO_URL} className="site-footer-link">
            Source Code
          </Link>
        </nav>
        <div className="site-footer-legal">
          <p>
            Viva La Tax is open-source software licensed under AGPL-3.0-only, is not a
            substitute for professional tax advice or tax preparation, and is offered as-is. By
            using Viva La Tax, you agree to our{" "}
            <Link href="/terms" className="site-footer-legal-link">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="site-footer-legal-link">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
