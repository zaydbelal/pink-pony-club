import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ClassPilot AI",
  description: "Autonomous management platform for small tutoring centers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <nav className="nav">
          <Link href="/">ClassPilot AI</Link>
          <Link href="/student">Student</Link>
          <Link href="/teacher">Teacher / Admin</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
