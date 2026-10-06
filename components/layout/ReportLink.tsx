'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentProps } from 'react';
export default function ReportLink(props: ComponentProps<typeof Link>) {
  const prefix = usePathname().match(/^\/tests\/[1-9]\d*/)?.[0];
  const href = prefix && typeof props.href === 'string' && /^\/(overview|categories|questions|testers|responses|themes|export)([/?#]|$)/.test(props.href)
    ? prefix + props.href : props.href;
  return <Link {...props} href={href} prefetch={prefix ? false : props.prefetch} />;
}
