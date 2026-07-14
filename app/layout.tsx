import type { Metadata, Viewport } from "next";
import "./globals.css";

const githubPagesBasePath = process.env.GITHUB_PAGES === "1" ? "/class-message-board" : "";

export const metadata: Metadata = {
    title: "クラスメッセージボード",
    description: "卒業記念撮影で、一人ひとりの担当文字をiPadに大きく表示するクラス向けWebアプリです。",
    applicationName: "クラスメッセージボード",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "メッセージボード" },
    manifest: `${githubPagesBasePath}/manifest.webmanifest`,
    openGraph: { title: "クラスメッセージボード", description: "みんなの文字を、ひとつのメッセージに。", type: "website", images: [{ url: `${githubPagesBasePath}/og.png`, width: 1200, height: 630, alt: "クラスメッセージボード" }] },
    twitter: { card: "summary_large_image", title: "クラスメッセージボード", description: "みんなの文字を、ひとつのメッセージに。", images: [`${githubPagesBasePath}/og.png`] },
  };

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
