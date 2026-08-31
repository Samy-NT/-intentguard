import type { ReactNode } from "react";
import "./globals.css";
import { AUREL, absoluteUrl, SITE_URL } from "@/lib/seo";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Aurel - The Intent Firewall for Autonomous Actions",
    template: "%s | Aurel",
  },
  description: AUREL.description,
  applicationName: AUREL.name,
  keywords: [...AUREL.keywords],
  authors: [{ name: "Aurel" }],
  creator: "Aurel",
  publisher: "Aurel",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: AUREL.name,
    title: "Aurel - The Intent Firewall for Autonomous Actions",
    description: AUREL.description,
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Aurel logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aurel - The Intent Firewall for Autonomous Actions",
    description: AUREL.description,
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": absoluteUrl("/#organization"),
        name: AUREL.name,
        legalName: AUREL.legalName,
        url: SITE_URL,
        logo: absoluteUrl("/logo.png"),
        email: AUREL.email,
        sameAs: [AUREL.github],
      },
      {
        "@type": "SoftwareApplication",
        "@id": absoluteUrl("/#software"),
        name: AUREL.name,
        applicationCategory: "SecurityApplication",
        operatingSystem: "Web, API",
        url: SITE_URL,
        description: AUREL.description,
        offers: {
          "@type": "Offer",
          category: "Private beta",
          price: "0",
          priceCurrency: "USD",
        },
        publisher: {
          "@id": absoluteUrl("/#organization"),
        },
        featureList: [
          "Deterministic action policy",
          "Velocity and behavioral checks",
          "Semantic prompt-injection detection",
          "Mission-drift detection",
          "Signed audit trail",
          "LangChain and CrewAI adapters",
        ],
      },
      {
        "@type": "WebSite",
        "@id": absoluteUrl("/#website"),
        name: AUREL.name,
        url: SITE_URL,
        description: AUREL.shortDescription,
        publisher: {
          "@id": absoluteUrl("/#organization"),
        },
      },
    ],
  };

  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="aurel-bg text-white antialiased">{children}</body>
    </html>
  );
}
