'use client';

import { useRef, useEffect, forwardRef } from 'react';
import styles from './business-manager-launcher.module.css';

type BusinessManagerLauncherProps = {
  onClick: () => void;
  isMobile?: boolean;
};

export const BusinessManagerLauncher = forwardRef<HTMLButtonElement, BusinessManagerLauncherProps>(
  ({ onClick, isMobile = false }, ref) => {
    const internalRef = useRef<HTMLButtonElement>(null);

    // Use provided ref or internal ref
    useEffect(() => {
      if (ref) {
        if (typeof ref === 'function') {
          ref(internalRef.current);
        } else {
          ref.current = internalRef.current;
        }
      }
    }, [ref]);

    return (
      <button
        ref={internalRef}
        onClick={onClick}
        className={styles.launcherButton}
        aria-label="Open Maia Receptionist"
        title="Maia Receptionist"
        data-mobile={isMobile}
      >
        <span className={styles.sparkleWrapper}>
          <span className={styles.sparkleIcon} aria-hidden="true">
            ✦
          </span>
          <span className={styles.sparkleAnimation} aria-hidden="true" />
        </span>
        {!isMobile && <span className={styles.label}>Maia Receptionist</span>}
      </button>
    );
  }
);
