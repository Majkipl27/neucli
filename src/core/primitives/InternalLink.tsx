import type { AnchorHTMLAttributes } from 'react';

export interface InternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/**
 * Link to a page of this site. This default is a plain anchor; generated
 * projects with more than one page replace this file with a React Router
 * version so navigation stays client-side.
 */
export default function InternalLink(props: InternalLinkProps) {
  return <a {...props} />;
}
