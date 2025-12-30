export function logVideoEvent(record: object) {
  const payload = { ...record, service: 'watch', ts: Date.now() };
  console.log('[video-event]', JSON.stringify(payload));
}
