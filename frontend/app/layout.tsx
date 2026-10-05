import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Security Quote",
  description: "Technical-commercial copilot for security installers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
