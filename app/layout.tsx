import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { StoreProvider } from "@/lib/store";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "agentic.do — AI teammates that get work done",
  description:
    "Hire AI teammates that connect to your tools, understand your context and finish work on schedule. Bring every AI subscription you already pay for.",
};

// Apply the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('agentic.do:theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <StoreProvider>
          {children}
          <Toaster />
        </StoreProvider>
      </body>
    </html>
  );
}
