import { useEffect, useRef } from 'react';

export function FormError({ message }: { message: string }) {
  const error = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (message) error.current?.focus();
  }, [message]);

  if (!message) return null;
  return (
    <p ref={error} className="notice error" role="alert" tabIndex={-1}>
      {message}
    </p>
  );
}
