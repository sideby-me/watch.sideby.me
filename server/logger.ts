import { Logtail } from '@logtail/node';

const token = process.env.LOGTAIL_SOURCE_TOKEN;
const logtail = token ? new Logtail(token) : null;

export function logVideoEvent(record: object) {
  const payload = { ...record, service: 'watch', ts: Date.now() };
  if (logtail) {
    logtail.info('video-event', payload);
  } else {
    console.log('[video-event]', JSON.stringify(payload));
  }
}
