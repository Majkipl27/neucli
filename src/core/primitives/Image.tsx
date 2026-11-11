import type { ImgHTMLAttributes } from 'react';

export type ImageProps = ImgHTMLAttributes<HTMLImageElement>;

export default function Image({ alt = '', ...rest }: ImageProps) {
  return <img alt={alt} {...rest} />;
}
