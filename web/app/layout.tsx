import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Fareline", template: "%s · Fareline" },
  description: "Search live Skyscanner fares by route and date, sorted by best, cheapest or fastest.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${dmMono.variable} h-full`}>
      <body className="min-h-full">
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          appearance={{
            variables: {
              colorPrimary: "var(--foreground)",
              colorForeground: "var(--foreground)",
              colorMutedForeground: "var(--muted-foreground)",
              colorBackground: "var(--card)",
              colorInput: "var(--inset)",
              colorInputForeground: "var(--foreground)",
              colorPrimaryForeground: "var(--background)",
              colorNeutral: "var(--foreground)",
              colorBorder: "var(--border)",
              fontFamily: "var(--font-dm-sans)",
              borderRadius: "0.625rem",
            },
          }}
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
