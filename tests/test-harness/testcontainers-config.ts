/**
 * Testcontainers Configuration & Harness (Item 37)
 * Provides container definitions for isolated E2E testing with real PostgreSQL,
 * Canton Network Participants, Redpanda/Kafka, and Settlement Gateway.
 */

export interface TestcontainerServiceConfig {
  image: string;
  ports: number[];
  env: Record<string, string>;
  healthcheckUrl?: string;
}

export const TESTCONTAINER_SERVICES: Record<string, TestcontainerServiceConfig> = {
  postgres: {
    image: 'postgres:15-alpine',
    ports: [5432],
    env: {
      POSTGRES_DB: 'obligax_test',
      POSTGRES_USER: 'obligax',
      POSTGRES_PASSWORD: 'test_password_123'
    }
  },
  kafka: {
    image: 'redpandadata/redpanda:v24.2.4',
    ports: [9092],
    env: {
      REDPANDA_MODE: 'dev-container'
    }
  },
  cantonParticipant: {
    image: 'digitalasset/canton-open-source:2.10.0',
    ports: [5011, 5012],
    env: {
      CANTON_CONFIG: '/canton/participant.conf'
    }
  },
  settlementGateway: {
    image: 'ghcr.io/obligax/settlement-gateway:v0.1.0',
    ports: [5020],
    env: {
      PORT: '5020',
      SETTLEMENT_WEBHOOK_SECRET: 'test-webhook-secret-2026'
    },
    healthcheckUrl: 'http://localhost:5020/health'
  }
};
