import { z } from 'zod';
import { CurrencySchema } from './obligation.schema';

export const ParticipantRoleSchema = z.enum([
  'Issuer',
  'ObligationCounterparty',
  'SettlementParticipant',
  'NettingParticipant',
  'Auditor',
  'Regulator'
]);

export const ParticipantTierSchema = z.enum(['Tier1', 'Tier2', 'Tier3']);

export const RegisterParticipantSchema = z.object({
  participantId: z.string().min(1).max(64),
  party: z.string().min(1).max(128),
  participantName: z.string().min(1).max(256),
  legalName: z.string().min(1).max(256),
  legalEntityIdentifier: z.string().min(1).max(64),
  jurisdiction: z.string().min(2).max(10),
  businessUnit: z.string().min(1).max(64),
  sourceSystem: z.string().min(1).max(64),
  tier: ParticipantTierSchema.default('Tier2'),
  roles: z.array(ParticipantRoleSchema).min(1),
  supportedCurrencies: z.array(CurrencySchema).min(1),
  maximumObligationAmount: z.string().regex(/^\d+(\.\d{1,10})?$/),
  maximumDailyGrossVolume: z.string().regex(/^\d+(\.\d{1,10})?$/),
  maximumNettingAmount: z.string().regex(/^\d+(\.\d{1,10})?$/)
});

export const SuspendParticipantSchema = z.object({
  reason: z.string().min(1).max(1024)
});
