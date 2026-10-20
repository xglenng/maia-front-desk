import type { Metadata } from "next";
import "./maia-ui.css";
import SessionGate from '@/components/session-gate';

export const metadata: Metadata = {
  title: "Maia Front Desk",
  description: "Your studio’s AI front desk for conversations and appointments",
  applicationName: "Maia",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Maia", statusBarStyle: "default" },
  icons: { apple: [{ url: "/app-icon/180", sizes: "180x180", type: "image/png" }] }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#fff" }}>
        <SessionGate>{children}</SessionGate>
      </body>
    </html>
  );
}
