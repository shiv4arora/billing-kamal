import { prisma } from '../lib/prisma';

interface LogOpts {
  userId?: string;
  userName?: string;
  action: string;    // CREATE | UPDATE | DELETE | ISSUE | PAYMENT | LOGIN
  entity: string;    // SaleInvoice | PurchaseInvoice | Production | Lead | User
  entityId?: string;
  entityRef?: string; // invoice number, entry number
  details?: string;
}

/**
 * Fire-and-forget activity logger.
 * Never throws — logging failure must never break the main request.
 */
export async function logActivity(opts: LogOpts): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId:    opts.userId    || '',
        userName:  opts.userName  || '',
        action:    opts.action,
        entity:    opts.entity,
        entityId:  opts.entityId  || '',
        entityRef: opts.entityRef || '',
        details:   opts.details   || '',
      },
    });
  } catch {
    // intentionally silent — logging must never break business logic
  }
}
