import type { Metadata } from "next";
import { DM_Sans, Inter, Manrope, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getBranding } from "@/server/settings";
import { themeVars } from "@/lib/theme";
import { setTimeZone } from "@/lib/date";
import { BrandingProvider } from "@/components/providers/BrandingProvider";

// All selectable typefaces are declared; the browser only downloads the one in use.
const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-jakarta", display: "swap", preload: false });
const dmsans = DM_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-dmsans", display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-manrope", display: "swap", preload: false });

// Branding is read per request so a saved change applies immediately.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: b.appName,
    description: `${b.appName} — cold-calling CRM for ${b.agencyName}.`,
    icons: b.logoDataUrl ? { icon: b.logoDataUrl } : undefined,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
  setTimeZone(branding.timezone);
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jakarta.variable} ${dmsans.variable} ${manrope.variable}`}
      style={themeVars(branding) as React.CSSProperties}
      // Browser extensions (ColorZilla, Grammarly, password managers…) add attributes to
      // <html>/<body> before React loads; ignore those so they don't trigger hydration errors.
      suppressHydrationWarning
    >
      <body className="font-sans antialiased" suppressHydrationWarning>
        <BrandingProvider initial={branding}>{children}</BrandingProvider>
      </body>
    </html>
  );
}
