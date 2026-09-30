import { CantonLedgerConfig } from '../../types/canton.types';

export const getCantonConfig = (): CantonLedgerConfig => {
  return {
    host: process.env.CANTON_HOST || 'localhost',
    port: parseInt(process.env.CANTON_LEDGER_PORT || '5011', 10),
    adminPort: parseInt(process.env.CANTON_ADMIN_PORT || '5012', 10),
    useTls: process.env.CANTON_USE_TLS === 'true',
    operatorParty: process.env.CANTON_PARTY_OPERATOR || 'NetworkOperator',
    token: process.env.CANTON_TOKEN,
    timeoutMs: parseInt(process.env.CANTON_TIMEOUT_MS || '15000', 10)
  };
};
