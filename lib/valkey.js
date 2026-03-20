import Redis from 'ioredis';

let client = null;

const url = process.env.VALKEY_URL;
if (url) {
  client = new Redis(url, {
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
  });
  client.on('error', err => console.error('Valkey error:', err.message));
  client.on('ready', () => console.log('Valkey ready'));
}

export function connected() {
  return client !== null;
}

export { client };
export default { client, connected };
