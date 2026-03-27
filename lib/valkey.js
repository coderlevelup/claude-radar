import Redis from 'ioredis';

// Connection pool keyed by "url:password" — reuses connections across projects
// sharing the same Valkey instance.
const clients = new Map();

export function getClient(url, password = '') {
  const key = `${url}:${password}`;
  if (clients.has(key)) return clients.get(key);
  const client = new Redis(url, {
    password: password || undefined,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 500, 10000),
  });
  client.on('error', err => console.error(`Valkey(${url}): ${err.message}`));
  client.on('ready', () => console.log(`Valkey ready: ${url}`));
  clients.set(key, client);
  return client;
}

export function isReady(url, password = '') {
  const c = clients.get(`${url}:${password}`);
  return c?.status === 'ready';
}
