import { CantonLedgerConfig } from '../../types/canton.types';

export const getCantonConfig = (): CantonLedgerConfig => {
  return {
    host: process.env.CANTON_HOST || 'localhost',
    port: parseInt(process.env.CANTON_LEDGER_PORT || '5011', 10),
    adminPort: parseInt(process.env.CANTON_ADMIN_PORT || '5012', 10),
    useTls: process.env.CANTON_USE_TLS === 'true',
    tlsCaCertPath: process.env.CANTON_TLS_CA_CERT,
    tlsClientCertPath: process.env.CANTON_TLS_CLIENT_CERT,
    tlsClientKeyPath: process.env.CANTON_TLS_CLIENT_KEY,
    operatorParty: process.env.CANTON_PARTY_OPERATOR || 'NetworkOperator::1220d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1b2c3',
    participantId: process.env.CANTON_PARTICIPANT_ID || 'participant1',
    synchronizerId: process.env.CANTON_SYNCHRONIZER_ID || 'synchronizer1',
    token: process.env.CANTON_TOKEN,
    timeoutMs: parseInt(process.env.CANTON_TIMEOUT_MS || '15000', 10),
    ledgerApiVersion: process.env.CANTON_LEDGER_API_VERSION || 'v2'
  };
};
