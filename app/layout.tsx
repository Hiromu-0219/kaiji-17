import type { Metadata, Viewport } from "next";
import "./globals.css";

const basePath = process.env.GITHUB_PAGES === "true" ? "/kaiji-17" : "";

export const metadata: Metadata = {
  title: "十七歩｜卓上計時盤",
  description: "実牌で遊ぶ二人麻雀「17歩」のための横向き卓上タイマー",
  manifest: `${basePath}/manifest.json`,
  appleWebApp: { capable: true, title: "十七歩" },
  icons: { icon: `${basePath}/favicon.svg`, apple: `${basePath}/icon-192.svg` },
};

export const viewport: Viewport = {
  themeColor: "#07120f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
