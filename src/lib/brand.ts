/**
 * White-label settings. AIMER is the default; when selling EventOS to other
 * institutes, change these env vars (or swap public/brand/*) per deployment.
 */
export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "AIMER Business School",
  product: process.env.NEXT_PUBLIC_PRODUCT_NAME || "AIMER Events",
  logo: process.env.NEXT_PUBLIC_BRAND_LOGO || "/brand/logo.png",
  icon: "/brand/icon.png",
  color: "#127489",      // brand-600 — buttons & links (passes WCAG AA on white)
  colorBright: "#168AA2", // brand-500 — the logo teal
};
