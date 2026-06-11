export function newId() {
  return crypto.randomUUID().replaceAll('-', '');
}
