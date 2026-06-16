import Image from 'next/image';
import logoNoGlow from '@/assets/LOGO_noBG_noGlow.png';
import logoGlow from '@/assets/LOGO_noBG_wGlow.png';
import { cn } from '@/lib/utils';

interface CompanyLogoProps {
  glow?: boolean;
  className?: string;
  priority?: boolean;
}

export default function CompanyLogo({ glow = false, className, priority = false }: CompanyLogoProps) {
  return (
    <Image
      src={glow ? logoGlow : logoNoGlow}
      alt="Company logo"
      priority={priority}
      className={cn('h-auto w-auto object-contain', className)}
    />
  );
}
