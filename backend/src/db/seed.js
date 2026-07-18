import bcrypt from 'bcryptjs';
import { db } from './index.js';

// Idempotent-ish seed: safe to run more than once during development because
// it checks for existing rows before inserting the singleton owner account.
// Run with: npm run seed

const ownerEmail = 'owner@example.com';
const ownerPassword = 'change-me-please'; // dev-only credential, see README

const existingOwner = db.prepare('SELECT id FROM users WHERE email = ?').get(ownerEmail);
if (!existingOwner) {
  const passwordHash = bcrypt.hashSync(ownerPassword, 12);
  db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)').run(
    ownerEmail,
    passwordHash,
    'owner'
  );
  console.log(`Created owner account: ${ownerEmail} / ${ownerPassword}`);
} else {
  console.log('Owner account already exists, skipping.');
}

const staffCount = db.prepare('SELECT COUNT(*) as n FROM staff').get().n;
if (staffCount === 0) {
  const insertStaff = db.prepare('INSERT INTO staff (name, bio) VALUES (?, ?)');
  const insertHours = db.prepare(
    'INSERT INTO working_hours (staff_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?)'
  );

  const staffMembers = [
    { name: 'Rui', bio: 'Owner-barber, 12 years experience. Fades and beard work.' },
    { name: 'Marta', bio: 'Colour specialist and classic cuts.' },
  ];

  for (const member of staffMembers) {
    const { lastInsertRowid: staffId } = insertStaff.run(member.name, member.bio);
    // Tuesday-Saturday, 09:00-18:00. Closed Sunday/Monday.
    for (const weekday of [2, 3, 4, 5, 6]) {
      insertHours.run(staffId, weekday, 9 * 60, 18 * 60);
    }
  }
  console.log(`Seeded ${staffMembers.length} staff members with working hours.`);
} else {
  console.log('Staff already seeded, skipping.');
}

const serviceCount = db.prepare('SELECT COUNT(*) as n FROM services').get().n;
if (serviceCount === 0) {
  const insertService = db.prepare(
    'INSERT INTO services (name, duration_minutes, price_cents, deposit_cents) VALUES (?, ?, ?, ?)'
  );
  const services = [
    { name: 'Haircut', duration: 30, price: 2000, deposit: 500 },
    { name: 'Beard trim', duration: 15, price: 1000, deposit: 300 },
    { name: 'Haircut + beard', duration: 45, price: 2800, deposit: 700 },
    { name: 'Colour', duration: 90, price: 5500, deposit: 1500 },
  ];
  for (const s of services) {
    insertService.run(s.name, s.duration, s.price, s.deposit);
  }
  console.log(`Seeded ${services.length} services.`);
} else {
  console.log('Services already seeded, skipping.');
}
