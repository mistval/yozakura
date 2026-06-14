import { uid } from 'uid';

export function newId() {
  return uid(18);
}

export function addOrReplaceVersionQueryParam(path: string) {
  const [pathname, search = ''] = path.split('?');

  const params = new URLSearchParams(search);
  params.set('v', newId());
  const query = params.toString();

  return `${pathname}?${query}`;
}
