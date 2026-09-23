import type { Metadata } from "next";
import SessionGate from '@/components/session-gate';

export const metadata: Metadata = {
  title: "INKFLOW · AI Tattoo Receptionist",
  description: "AI booking assistant for tattoo artists"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f5f5f5" }}>
        <SessionGate>{children}</SessionGate>
      </body>
    </html>
  );
}
