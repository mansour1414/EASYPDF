import React, { useState } from 'react';

interface LogoImageProps {
  className?: string;
  alt?: string;
  /** Standard site logos are static by default. Kept for splash compatibility. */
  animateEntrance?: boolean;
  /** Legacy prop retained for existing auth callers; normal logos stay static. */
  hero?: boolean;
  /** Legacy alias for the supplied splash artwork. */
  illustration?: boolean;
  /** Kept for callers that distinguish the splash presentation. The source asset is shared. */
  variant?: 'standard' | 'splash';
}

/** The single authoritative EasyPDF artwork served from Vite's public assets. */
const OFFICIAL_LOGO_SRC = '/assets/logo.png';

export const LogoImage: React.FC<LogoImageProps> = ({
  className = "w-9 h-9",
  alt = "EasyPDF Logo",
  animateEntrance = false,
  variant,
}) => {
  const [hasError, setHasError] = useState(false);

  const entranceClass = animateEntrance ? 'logo-entrance' : '';

  if (hasError) {
    return (
      <span
        className={`logo-anchor ${entranceClass} ${className}`}
        role="img"
        aria-label={alt}
      >
      </span>
    );
  }

  return (
    <span className={`logo-anchor ${entranceClass}`}>
        <img
        src={OFFICIAL_LOGO_SRC}
        alt={alt}
        onError={() => setHasError(true)}
        referrerPolicy="no-referrer"
        loading={variant === 'splash' ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        className={`${className} logo-image object-contain`}
      />
    </span>
  );
};

export default LogoImage;
