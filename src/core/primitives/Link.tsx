import type { AnchorHTMLAttributes } from 'react';
import InternalLink from './InternalLink';

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  /** Open in a new tab. */
  newTab?: boolean;
}

/** Same-site paths like `/pricing` or `/#features`, but not `//cdn...`. */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

export default function Link({ href, newTab, ...rest }: LinkProps) {
  if (newTab) return <a href={href} target="_blank" rel="noopener noreferrer" {...rest} />;
  if (isInternalHref(href)) return <InternalLink href={href} {...rest} />;
  return <a href={href} {...rest} />;
}
