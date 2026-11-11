import type { AllHTMLAttributes, ElementType, ReactNode } from 'react';

export interface FrameProps extends AllHTMLAttributes<HTMLElement> {
  /** HTML tag to render, default `div`. */
  tag?: ElementType;
  children?: ReactNode;
}

/** An auto layout box. Its layout comes entirely from className. */
export default function Frame({ tag: Tag = 'div', ...rest }: FrameProps) {
  return <Tag {...rest} />;
}
