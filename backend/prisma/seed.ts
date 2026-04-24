import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Admin user — username stored lowercase for case-insensitive login
  const hash = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin', password: hash,
      name: 'Administrator', role: 'admin',
      // SQLite stores arrays as JSON strings
      permissions: JSON.stringify([]),
      isActive: true,
    },
  });

  // Counters
  await prisma.counter.upsert({ where: { key: 'saleInvoice' }, update: {}, create: { key: 'saleInvoice', value: 1 } });
  await prisma.counter.upsert({ where: { key: 'purchaseInvoice' }, update: {}, create: { key: 'purchaseInvoice', value: 1 } });
  await prisma.counter.upsert({ where: { key: 'sku' }, update: {}, create: { key: 'sku', value: 1001 } });
  await prisma.counter.upsert({ where: { key: 'production' }, update: {}, create: { key: 'production', value: 1 } });
  await prisma.counter.upsert({ where: { key: 'saleReturn' }, update: {}, create: { key: 'saleReturn', value: 1 } });
  await prisma.counter.upsert({ where: { key: 'purchaseReturn' }, update: {}, create: { key: 'purchaseReturn', value: 1 } });
  await prisma.counter.upsert({ where: { key: 'quotation' }, update: {}, create: { key: 'quotation', value: 1 } });

  // Default settings — stored as JSON string in SQLite
  const defaultData = {
    company: { name: 'My Trading Co.', address: '', phone: '', email: '', gstin: '', state: 'Maharashtra', stateCode: '27', logo: null },
    invoice: { salePrefix: 'SI', purchasePrefix: 'PI', defaultDueDays: 14, showHSN: true, bankDetails: '', terms: 'Goods once sold will not be returned.' },
    tax: { defaultGSTRate: 0, intraState: true },
    lowStockThreshold: 10,
    reminders: { enabled: true, schedule: [0, 3, 7], messageTemplate: '' },
  };
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', data: JSON.stringify(defaultData) },
  });

  console.log('✅ Seed complete. Login: admin / admin123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
