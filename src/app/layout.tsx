import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SiaMA Qualif AO",
  description: "Dashboard de qualification et suivi des appels d'offres"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
