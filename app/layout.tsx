import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "class-message-board.pages.dev";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  return {
    title: "クラスメッセージボード",
    description: "卒業記念撮影で、一人ひとりの担当文字をiPadに大きく表示するクラス向けWebアプリです。",
    applicationName: "クラスメッセージボード",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "メッセージボード" },
    manifest: "/manifest.webmanifest",
    openGraph: { title: "クラスメッセージボード", description: "みんなの文字を、ひとつのメッセージに。", type: "website", images: [{ url: imageUrl, width: 1200, height: 630, alt: "クラスメッセージボード" }] },
    twitter: { card: "summary_large_image", title: "クラスメッセージボード", description: "みんなの文字を、ひとつのメッセージに。", images: [imageUrl] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#17375e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
