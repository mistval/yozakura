export function newId() {
  return crypto.randomUUID().replaceAll('-', '');
}

export function addOrReplaceVersionQueryParam(path: string) {
  const [pathname, search = ''] = path.split('?');

  const params = new URLSearchParams(search);
  params.set('v', newId());
  const query = params.toString();

  return `${pathname}?${query}`;
}
