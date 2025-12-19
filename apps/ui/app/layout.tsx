import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "a5cforge",
  description: "Local read-only UI"
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-5xl px-4 py-8">{props.children}</div>
      </body>
    </html>
  );
}


