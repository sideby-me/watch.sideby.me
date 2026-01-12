import Redis from 'ioredis';
import { logEvent } from '@/server/logger';

// Redis client setup with Upstash support
const createRedisClient = () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  logEvent({ level: 'info', domain: 'other', event: 'redis_init', message: 'redis.init: spinning up connection...' });

  // For Upstash Redis, we need to configure TLS properly
  if (redisUrl.includes('upstash.io')) {
    logEvent({
      level: 'info',
      domain: 'other',
      event: 'redis_upstash',
      message: 'redis.init: detected Upstash, configuring TLS',
    });
    const url = new URL(redisUrl);
    return new Redis({
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      username: url.username || 'default',
      password: url.password,
      tls: {
        rejectUnauthorized: false,
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });
  }

  // For local Redis
  logEvent({ level: 'info', domain: 'other', event: 'redis_local', message: 'redis.init: using local configuration' });
  return new Redis(redisUrl, {
    lazyConnect: true,
    keepAlive: 30000,
  });
};

const redis = createRedisClient();

// Add error handling for connection issues
redis.on('error', error => {
  logEvent({
    level: 'error',
    domain: 'other',
    event: 'redis_error',
    message: 'redis.error: connection issue',
    meta: { error: String(error) },
  });
});

redis.on('connect', () => {
  logEvent({
    level: 'info',
    domain: 'other',
    event: 'redis_connected',
    message: 'redis.connect: connected successfully',
  });
});

redis.on('ready', () => {
  logEvent({ level: 'info', domain: 'other', event: 'redis_ready', message: 'redis.ready: ready for commands' });
});

redis.on('close', () => {
  logEvent({ level: 'info', domain: 'other', event: 'redis_closed', message: 'redis.close: connection closed' });
});

redis.on('reconnecting', () => {
  logEvent({
    level: 'info',
    domain: 'other',
    event: 'redis_reconnecting',
    message: 'redis.reconnect: attempting reconnection...',
  });
});

export { redis };
