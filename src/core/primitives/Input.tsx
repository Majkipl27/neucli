import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Render a <textarea> instead of an <input>. */
  multiline?: boolean;
}

export default function Input({ multiline, type = 'text', ...rest }: InputProps) {
  if (multiline) return <textarea {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />;
  return <input type={type} {...rest} />;
}
