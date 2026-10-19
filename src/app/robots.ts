import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: "https://structur-md.vercel.app/sitemap.xml",
    host: "https://structur-md.vercel.app",
  };
}
