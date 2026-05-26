import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "MobileClient",
  description: "Twilio Voice + SMS mobile web client",
  manifest: "/manifest.webmanifest",
  // Apple's home-screen install support keys off these. `apple-mobile-web-
  // app-capable = yes` is the older name for `mobile-web-app-capable` and
  // iOS Safari still looks at it.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MobileClient",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
  // respects iOS notch — PWA full-screen mode shifts content under the bar
  // without this.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
