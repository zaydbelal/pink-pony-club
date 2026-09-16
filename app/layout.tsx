import type { Metadata } from "next";
import { Geist, Newsreader, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { PonyMascot, ThemeToggle, themeInitScript } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ClassPilot AI",
  description: "Autonomous management platform for small tutoring centers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <nav className="nav">
          <Link href="/" className="brand">
            <span className="brand-mark" /> ClassPilot
          </Link>
          <Link href="/student">Student</Link>
          <Link href="/teacher">Teacher / Admin</Link>
          <ThemeToggle />
        </nav>
        {children}
        <PonyMascot />
      </body>
    </html>
  );
}
