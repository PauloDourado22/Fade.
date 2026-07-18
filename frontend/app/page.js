import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <nav className="nav">
        <span className="brand">Rui &amp; Marta Barbershop</span>
        <Link href="/login" className="action-link">Staff login</Link>
      </nav>
      <div className="hero">
        <h1>Book your next cut in under a minute</h1>
        <p>Pick a service, pick a barber, pick a time. Pay a small deposit to hold your slot.</p>
        <Link href="/book" className="btn">Book now</Link>
      </div>
    </main>
  );
}
