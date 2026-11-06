import type { Metadata, Viewport } from "next";
import { NavBar } from "@/components/nav-bar";
import { SiteFooter } from "@/components/site-footer";
import {
  resolveHostedAppBaseUrl,
  shouldAllowSearchIndexing
} from "@/lib/hosted-runtime-safety";
import "./globals.css";

const BASE_URL = resolveHostedAppBaseUrl().appBaseUrl;
const ALLOW_SEARCH_INDEXING = shouldAllowSearchIndexing();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16191d",
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "Viva La Tax — Experimental Tax Engine And Draft Return Builder",
    template: "%s | Viva La Tax",
  },
  description: "Open-source experimental tax software for drafting U.S. returns and reviewing calculations. Not tax advice, not a filing service, and not guaranteed accurate.",
  applicationName: "Viva La Tax",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png"
  },
  openGraph: {
    title: "Viva La Tax — Experimental Tax Engine And Draft Return Builder",
    description: "Open-source experimental tax software for drafting U.S. returns and reviewing calculations. Not tax advice, not a filing service, and not guaranteed accurate.",
    url: BASE_URL,
    siteName: "Viva La Tax",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    site: "@0xb33bs",
    creator: "@0xb33bs",
    title: "Viva La Tax — Experimental Tax Engine And Draft Return Builder",
    description: "Open-source experimental tax software for drafting U.S. returns and reviewing calculations. Not tax advice, not a filing service, and not guaranteed accurate.",
  },
  robots: ALLOW_SEARCH_INDEXING
    ? {
        index: true,
        follow: true
      }
    : {
        index: false,
        follow: false,
        nocache: true,
        googleBot: {
          index: false,
          follow: false,
          noimageindex: true
        }
      },
  other: {
    "apple-mobile-web-app-title": "Viva La Tax",
  },
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="app-shell-body">
        <NavBar />
        <main className="app-shell-main">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
