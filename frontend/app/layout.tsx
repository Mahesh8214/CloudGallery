import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CloudGallery — Personal Photo Vault",
  description:
    "Your personal cloud photo storage powered by GitHub. Upload, organize, and manage your photos securely in your own private repository.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body
        className="min-h-screen"
        style={{ fontFamily: "var(--font-inter, var(--font-sans))" }}
      >
        {children}
      </body>
    </html>
  );
}
