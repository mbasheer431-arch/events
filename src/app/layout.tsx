import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AIMER Events — Webinars by AIMER Business School", template: "%s · AIMER Business School" },
  description: "Create webinars, collect registrations, track real attendance and follow up on WhatsApp and email.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
