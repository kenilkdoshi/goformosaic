import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GoForMosaic — Turn your photos into a mosaic",
  description: "Upload a base photo and 20–40 tile photos. We'll create your custom photo mosaic within 3 days.",
  metadataBase: new URL(process.env.SITE_URL || "https://goformosaic.com"),
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className="flex min-h-dvh flex-col font-sans antialiased">{children}</body>
    </html>
  );
}
