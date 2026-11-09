export const metadata = { title: "Delhi Night Routes" };

// The map page itself is static (public/index.html); this app serves the API under /api.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
