import { z } from 'zod';

export const CurrencySchema = z.enum(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CHF', 'SGD', 'AUD', 'CAD']);
export const ObligationPrioritySchema = z.enum(['Low', 'Normal', 'High', 'Urgent']);
export const ObligationStatusSchema = z.enum([
  'Proposed',
  'Accepted',
  'Confirmed',
  'AmendmentPending',
  'NettingPending',
  'SettlementPending',
  'Disputed',
  'Settled',
  'Netted',
  'Cancelled'
]);

export const CreateObligationSchema = z.object({
  obligationId: z.string().min(1, 'Obligation ID is required').max(128),
  creditor: z.string().min(1, 'Creditor party identifier is required').max(128),
  debtor: z.string().min(1, 'Debtor party identifier is required').max(128),
  description: z.string().min(1, 'Description is required').max(1024),
  amount: z.string().regex(/^\d+(\.\d{1,10})?$/, 'Amount must be a valid positive decimal with up to 10 decimal places'),
  currency: CurrencySchema,
  createdDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  priority: ObligationPrioritySchema.optional().default('Normal'),
  sourceSystem: z.string().min(1).max(64),
  sourceReference: z.string().min(1).max(128),
  businessUnit: z.string().min(1).max(64)
}).refine(data => data.creditor !== data.debtor, {
  message: 'Creditor and Debtor cannot be identical',
  path: ['debtor']
});

export const ProposeAmendmentSchema = z.object({
  field: z.enum(['AmendmentAmount', 'AmendmentDueDate', 'AmendmentDescription', 'AmendmentPriority']),
  proposedAmount: z.string().regex(/^\d+(\.\d{1,10})?$/).optional(),
  proposedDueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  proposedDescription: z.string().min(1).max(1024).optional(),
  proposedPriority: ObligationPrioritySchema.optional(),
  reason: z.string().min(1, 'Amendment reason is required').max(1024)
});

export const RaiseDisputeSchema = z.object({
  reason: z.enum([
    'IncorrectAmount',
    'IncorrectCurrency',
    'IncorrectDueDate',
    'DuplicateObligation',
    'UnauthorizedObligation',
    'IncorrectCounterparty',
    'SettlementFailure',
    'NettingError',
    'ContractualDisagreement',
    'OtherReason'
  ]),
  details: z.string().min(1, 'Dispute details are required').max(2048)
});

export const ResolveDisputeSchema = z.object({
  resolutionDetails: z.string().min(1, 'Resolution details are required').max(2048)
});

export const CancelObligationSchema = z.object({
  cancellationReason: z.string().min(1, 'Cancellation reason is required').max(1024)
});
