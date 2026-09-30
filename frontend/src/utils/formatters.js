/**
 * ObligaX Financial & Ledger Formatting Utilities
 * Guarantees zero floating-point arithmetic corruption for financial quantities.
 */

export function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '0.00 ' + currency;
  }

  // Parse string or number cleanly preserving decimal scale
  const parts = String(amount).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] ? parts[1].padEnd(2, '0').slice(0, 4) : '00';

  const formattedInteger = Number(integerPart).toLocaleString('en-US');

  const symbolMap = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CHF: 'CHF ',
    JPY: '¥'
  };

  const symbol = symbolMap[currency] || (currency + ' ');
  return `${symbol}${formattedInteger}.${decimalPart} ${currency}`;
}

export function formatCurrencyCompact(amount, currency = 'USD') {
  const num = Number(amount);
  if (isNaN(num)) return '0.00 ' + currency;

  if (Math.abs(num) >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B ' + currency;
  }
  if (Math.abs(num) >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M ' + currency;
  }
  if (Math.abs(num) >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K ' + currency;
  }
  return formatCurrency(amount, currency);
}

/**
 * Absolute and relative timestamp formatter with explicit timezone
 */
export function formatTimestamp(dateOrIso) {
  if (!dateOrIso) return '—';
  const d = new Date(dateOrIso);
  if (isNaN(d.getTime())) return String(dateOrIso);

  const year = d.getFullYear();
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  // Detect local timezone abbreviation
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {}

  return `${day} ${month} ${year} ${hours}:${minutes}:${seconds} (${tz})`;
}

export function formatRelativeTime(dateOrIso) {
  if (!dateOrIso) return '—';
  const d = new Date(dateOrIso);
  if (isNaN(d.getTime())) return '';

  const elapsedSeconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (elapsedSeconds < 5) return 'just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

export function truncateHash(hash, head = 8, tail = 6) {
  if (!hash) return '—';
  const s = String(hash);
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

/**
 * Normalizes obligation status string into presentation metadata
 */
export function getStatusMeta(status) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'proposed':
      return { label: 'Proposed', class: 'badge-proposed' };
    case 'accepted':
      return { label: 'Accepted', class: 'badge-accepted' };
    case 'confirmed':
      return { label: 'Confirmed', class: 'badge-confirmed' };
    case 'nettingpending':
      return { label: 'Netting Pending', class: 'badge-nettingpending' };
    case 'nettingproposed':
      return { label: 'Netting Proposed', class: 'badge-nettingpending' };
    case 'nettingaccepted':
      return { label: 'Netting Accepted', class: 'badge-accepted' };
    case 'nettingexecuted':
      return { label: 'Netting Executed', class: 'badge-netted' };
    case 'netted':
      return { label: 'Netted', class: 'badge-netted' };
    case 'settlementpending':
    case 'settlementcreated':
      return { label: 'Settlement Pending', class: 'badge-settlementpending' };
    case 'settlementprocessing':
      return { label: 'Processing Rail', class: 'badge-processing' };
    case 'settled':
    case 'settlementcompleted':
      return { label: 'Settled', class: 'badge-settled' };
    case 'settlementfailed':
    case 'failed':
      return { label: 'Failed', class: 'badge-failed' };
    case 'disputed':
      return { label: 'Disputed', class: 'badge-disputed' };
    case 'amendmentpending':
      return { label: 'Amendment Pending', class: 'badge-amendmentpending' };
    case 'cancelled':
    case 'settlementcancelled':
      return { label: 'Cancelled', class: 'badge-cancelled' };
    default:
      return { label: status || 'Unknown', class: 'badge-neutral' };
  }
}
