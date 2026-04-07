import type { MetadataRoute } from "next";
import {
  resolveHostedAppBaseUrl,
  shouldAllowSearchIndexing
} from "@/lib/hosted-runtime-safety";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolveHostedAppBaseUrl().appBaseUrl;
  const allowIndexing = shouldAllowSearchIndexing();

  return {
    rules: allowIndexing
      ? {
          userAgent: "*",
          allow: ["/", "/help"],
          disallow: ["/api/", "/returns/", "/auth/"]
        }
      : {
          userAgent: "*",
          disallow: "/"
        },
    sitemap: allowIndexing ? `${baseUrl}/sitemap.xml` : undefined
  };
}
