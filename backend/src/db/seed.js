import bcrypt from 'bcryptjs';
import { db } from './index.js';

// Idempotent: safe to run more than once, on a brand-new database or one
// that's already been seeded before this file changed. Run with: npm run seed
//
// This matters more than it might look - the FADE. rebrand changed the
// crew (2 barbers -> 3), the menu (placeholder names/prices -> the exact
// FADE menu), and working hours (09:00-18:00 -> 10:00-20:00). A seed script
// that only inserts "if empty" would apply none of that to a database that
// already had the old data in it, which is exactly the bug that bit the
// working-hours change earlier. Every block below either inserts-if-missing
// by name, or unconditionally updates existing rows to the canonical value.

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

// Matches the crew shown in the FADE. design direction exactly (three
// chairs, not two) - see docs/adr/0002-fade-rebrand-implementation.md.
const staffMembers = [
  { name: 'Rui', bio: 'Owner-barber, 12 years experience. Fades and beard work.' },
  { name: 'Marta', bio: 'Colour specialist, fades, and straight-razor work.' },
  { name: 'Tomás', bio: 'Junior barber — every cut 20% off while he builds his book.' },
];

const insertStaff = db.prepare('INSERT INTO staff (name, bio) VALUES (?, ?)');
const insertHours = db.prepare(
  'INSERT INTO working_hours (staff_id, weekday, start_minute, end_minute) VALUES (?, ?, ?, ?)'
);
const findStaffByName = db.prepare('SELECT id FROM staff WHERE name = ?');

let addedStaff = 0;
for (const member of staffMembers) {
  const existing = findStaffByName.get(member.name);
  if (existing) continue;

  const { lastInsertRowid: staffId } = insertStaff.run(member.name, member.bio);
  // Tuesday-Saturday, 10:00-20:00. Closed Sunday/Monday.
  for (const weekday of [2, 3, 4, 5, 6]) {
    insertHours.run(staffId, weekday, 10 * 60, 20 * 60);
  }
  addedStaff += 1;
}
console.log(
  addedStaff > 0
    ? `Added ${addedStaff} new staff member(s) with working hours.`
    : 'All staff already present, skipping insert.'
);

// Unconditional, unlike the insert above: fixes working hours on staff that
// already existed before the 09:00-18:00 -> 10:00-20:00 change.
const hoursUpdate = db.prepare(
  'UPDATE working_hours SET start_minute = ?, end_minute = ? WHERE weekday IN (2, 3, 4, 5, 6)'
);
const { changes: updatedHoursRows } = hoursUpdate.run(10 * 60, 20 * 60);
if (updatedHoursRows > 0) {
  console.log(`Updated ${updatedHoursRows} working_hours row(s) to 10:00-20:00.`);
}

// Names, durations, and prices matched exactly to the FADE. design
// direction's menu (see docs/mockups / the uploaded Design Directions doc)
// rather than the placeholder Haircut/Beard trim/Colour set. Deposit kept
// flat at $15 to match "drop a $15 deposit" copy used throughout the
// mockup, rather than a percentage of price.
const services = [
  { name: 'Classic Cut', duration: 45, price: 4000, deposit: 1500 },
  { name: 'Skin Fade', duration: 45, price: 4800, deposit: 1500 },
  { name: 'Beard Sculpt', duration: 30, price: 2800, deposit: 1500 },
  { name: 'The Full Works', duration: 75, price: 7500, deposit: 1500 },
];

const findServiceByName = db.prepare('SELECT id FROM services WHERE name = ?');
const insertService = db.prepare(
  'INSERT INTO services (name, duration_minutes, price_cents, deposit_cents) VALUES (?, ?, ?, ?)'
);
const updateService = db.prepare(
  'UPDATE services SET duration_minutes = ?, price_cents = ?, deposit_cents = ?, active = 1 WHERE id = ?'
);

let addedServices = 0;
let updatedServices = 0;
for (const s of services) {
  const existing = findServiceByName.get(s.name);
  if (existing) {
    updateService.run(s.duration, s.price, s.deposit, existing.id);
    updatedServices += 1;
  } else {
    insertService.run(s.name, s.duration, s.price, s.deposit);
    addedServices += 1;
  }
}
console.log(`Services: ${addedServices} added, ${updatedServices} updated to current FADE menu.`);

// Retire (not delete) any services from the old placeholder menu that
// aren't part of the FADE menu above. Deleting outright would violate the
// foreign key from appointments.service_id on any existing booking that
// references one of these rows; marking inactive just hides them from
// GET /api/public/services (see routes/public.js's `WHERE active = 1`)
// without touching booking history.
const currentNames = services.map((s) => s.name);
const placeholders = currentNames.map(() => '?').join(',');
const { changes: retiredCount } = db
  .prepare(`UPDATE services SET active = 0 WHERE name NOT IN (${placeholders})`)
  .run(...currentNames);
if (retiredCount > 0) {
  console.log(`Retired ${retiredCount} old placeholder service(s) (marked inactive, not deleted).`);
}
