import './globals.css';

export const metadata = {
  title: 'Rui & Marta Barbershop — Book online',
  description: 'Book a haircut, beard trim, or colour appointment online in under a minute.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
