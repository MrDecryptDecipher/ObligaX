#!/usr/bin/env bash
set -euo pipefail

# Enterprise mTLS Certificate Generation for ObligaX Canton Network
CERTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CERTS_DIR"

echo "=== Generating ObligaX Root Certificate Authority (CA) ==="
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj "/C=US/ST=NewYork/L=NewYork/O=ObligaX Network/OU=Security/CN=ObligaX-Root-CA"

generate_cert() {
  local name=$1
  local cn=$2

  echo "=== Generating Certificate for ${name} (${cn}) ==="
  openssl genrsa -out "${name}.key" 2048
  openssl req -new -key "${name}.key" -out "${name}.csr" \
    -subj "/C=US/ST=NewYork/L=NewYork/O=ObligaX Network/OU=Nodes/CN=${cn}"

  cat > "${name}.ext" <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${cn}
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF

  openssl x509 -req -in "${name}.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out "${name}.crt" -days 825 -sha256 -extfile "${name}.ext"

  rm -f "${name}.csr" "${name}.ext"
  chmod 600 "${name}.key"
  chmod 644 "${name}.crt"
}

generate_cert "participant1" "participant1.obligax.local"
generate_cert "participant2" "participant2.obligax.local"
generate_cert "participant3" "participant3.obligax.local"
generate_cert "synchronizer" "synchronizer.obligax.local"
generate_cert "obligax-api" "api.obligax.local"
generate_cert "settlement-gateway" "gateway.settlement.local"

echo "=== Enterprise TLS/mTLS Certificates Successfully Generated ==="
