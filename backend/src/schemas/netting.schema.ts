import { z } from 'zod';
import { CurrencySchema } from './obligation.schema';

export const ProposeNettingSchema = z.object({
  nettingId: z.string().min(1, 'Netting ID is required').max(128),
  counterparty: z.string().min(1, 'Counterparty is required').max(128),
  obligationIds: z.array(z.string().min(1)).min(1, 'At least one obligation ID is required in netting set'),
  currency: CurrencySchema,
  sourceSystem: z.string().min(1).max(64),
  sourceReference: z.string().min(1).max(128),
  businessUnit: z.string().min(1).max(64)
});

export const RejectNettingSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(1024)
});

export const CancelNettingSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(1024)
});
