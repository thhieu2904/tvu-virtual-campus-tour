import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "TVU Virtual Campus Tour",
  description: "Tham quan ảo khuôn viên Đại học Trà Vinh với AI hướng dẫn viên",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={roboto.variable}>
      <body className="font-[var(--font-roboto)] overflow-hidden">
        {children}
      </body>
    </html>
  );
}
