import { z } from 'zod';
import { CurrencySchema } from './obligation.schema';
import { ParticipantRoleSchema } from './participant.schema';

export const CreatePolicySchema = z.object({
  policyId: z.string().min(1).max(64),
  policyVersion: z.number().int().positive().default(1),
  supportedCurrencies: z.array(CurrencySchema).min(1),
  maximumObligationAmount: z.string().regex(/^\d+(\.\d{1,10})?$/),
  maximumNettingAmount: z.string().regex(/^\d+(\.\d{1,10})?$/),
  maximumSettlementAmount: z.string().regex(/^\d+(\.\d{1,10})?$/),
  allowedRoles: z.array(ParticipantRoleSchema).min(1)
});
