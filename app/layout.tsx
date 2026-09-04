import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "dress-up! · 酷酷衣柜",
    description: "4 AI 观战或 1 人 + 3 AI：用可解释启发式 AI 测试身份、呈现与互卡。",
    icons: { icon: "/favicon.svg?v=2", shortcut: "/favicon.svg?v=2" },
    openGraph: {
      title: "DRESS-UP!",
      description: "四人身份卡牌游戏 · Heuristic AI Prototype",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "DRESS-UP! 四人身份卡牌游戏" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "DRESS-UP!",
      description: "四人身份卡牌游戏 · Heuristic AI Prototype",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
