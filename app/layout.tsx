import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Aurel — The Intent Firewall for Agentic Payments",
  description:
    "Block malicious payments before execution. Aurel sits between your AI agent and the payment rail.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#09090e] text-white antialiased">{children}</body>
    </html>
  );
}
