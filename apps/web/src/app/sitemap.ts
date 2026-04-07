import type { MetadataRoute } from "next";
import {
  resolveHostedAppBaseUrl,
  shouldAllowSearchIndexing
} from "@/lib/hosted-runtime-safety";

const BASE_URL = resolveHostedAppBaseUrl().appBaseUrl;

export default function sitemap(): MetadataRoute.Sitemap {
  if (!shouldAllowSearchIndexing()) {
    return [];
  }

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/help`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
