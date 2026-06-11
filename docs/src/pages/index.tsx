import useBaseUrl from '@docusaurus/useBaseUrl';
import type { ReactNode } from 'react';
import { Redirect } from '@docusaurus/router';

export default function Home(): ReactNode {
  const target = useBaseUrl('/docs/what-is-yozakura');
  return <Redirect to={target} />;
}
