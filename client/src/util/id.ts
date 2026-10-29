import { uid } from 'uid';
import z from 'zod';

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

export const idSchema = z.string().regex(/^[a-f0-9]{18}$/);
