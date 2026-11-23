import type { Metadata, Viewport } from "next";
import "./maia-ui.css";
import SessionGate from '@/components/session-gate';
import { ThemeSync, themeInitScript } from '@/components/theme';
import { BRAND_ASSET_ROOT, BRAND_BACKGROUND, IPHONE_SCREENS, startupImage, startupMedia } from './brand-assets';

export const metadata: Metadata = {
  title: "Maia Front Desk",
  description: "Your studio’s AI front desk for conversations and appointments",
  applicationName: "Maia",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Maia", statusBarStyle: "black" },
  icons: {
    icon: [32, 48].map(size => ({ url: `${BRAND_ASSET_ROOT}/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png" })),
    apple: [{ url: `${BRAND_ASSET_ROOT}/icon-180.png`, sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = { themeColor: BRAND_BACKGROUND };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {IPHONE_SCREENS.flatMap(screen => (['portrait', 'landscape'] as const).map(orientation =>
          <link key={`${screen.width}-${screen.height}-${orientation}`} rel="apple-touch-startup-image"
            href={startupImage(screen, orientation)} media={startupMedia(screen, orientation)} />
        ))}
      </head>
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "transparent" }}>
        <ThemeSync />
        <SessionGate>{children}</SessionGate>
      </body>
    </html>
  );
}
