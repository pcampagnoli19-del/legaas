import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: 'Legaas — Legal Operations Management',
    template: '%s · Legaas',
  },
  description:
    'Plataforma de gestão operacional para serviços jurídicos, societários, paralegais e de regularização.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
