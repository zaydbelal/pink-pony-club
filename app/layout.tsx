import type { Metadata } from "next";
import { Geist, Newsreader, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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
      className={`dark ${geistSans.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <nav className="nav">
          <Link href="/" className="brand">
            <span className="brand-mark">■</span> ClassPilot
          </Link>
          <Link href="/student">Student</Link>
          <Link href="/teacher">Teacher / Admin</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
