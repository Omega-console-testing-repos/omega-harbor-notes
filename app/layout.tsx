import "./globals.css";

export const metadata = {
  title: "Omega × Harbor — Notes",
  description: "Sample app using a Harbor backend provisioned through Omega.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
