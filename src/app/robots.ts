import type { MetadataRoute } from "next";
import { APP_URL } from "@/lib/utils";
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/", "/e/"], disallow: ["/dashboard", "/api", "/j/"] }], sitemap: undefined, host: APP_URL };
}
