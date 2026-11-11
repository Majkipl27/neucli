import type { AllHTMLAttributes, ElementType, ReactNode } from 'react';

export interface TextProps extends AllHTMLAttributes<HTMLElement> {
  /** HTML tag to render, default `p`. */
  tag?: ElementType;
  children?: ReactNode;
}

export default function Text({ tag: Tag = 'p', ...rest }: TextProps) {
  return <Tag {...rest} />;
}
