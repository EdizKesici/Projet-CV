import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LuxTalent V2 — Pré-sélection CV",
  description: "Système de pré-sélection CV fairness-aware avec explications SHAP et audit d'équité. LuxTalent Advisory Group.",
  keywords: ["LuxTalent", "CV screening", "fairness", "SHAP", "ML", "hiring"],
  authors: [{ name: "LuxTalent Advisory Group" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
