'use client';

import { useState } from 'react';
import { RequestForm } from '@/app/request/request-form';
import styles from './studio.module.css';

export default function RequestCard({ name, artist, token }: { name: string; artist: string; token: string }) {
  const [opened, setOpened] = useState(false);
  return <details className={styles.requestCard} onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary><span><strong>{name}</strong><span className={styles.artistName}>{artist}</span></span><span className={styles.openLabel}>Open form <span aria-hidden="true">+</span></span></summary>
    {opened && <RequestForm formToken={token} embedded/>}
  </details>;
}
