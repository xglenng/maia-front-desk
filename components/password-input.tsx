'use client';
import { useId, useState, type InputHTMLAttributes } from 'react';
import UiIcon from './ui-icon';
import './password-input.css';

export default function PasswordInput({ id, label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  return <div>
    <label htmlFor={inputId}>{label}</label>
    <span className="password-input">
    <input {...props} id={inputId} type={visible ? 'text' : 'password'} />
    <button type="button" className="password-input-toggle" aria-label={visible ? 'Hide password' : 'Show password'}
      aria-controls={inputId} aria-pressed={visible} onClick={() => setVisible(!visible)}>
      <UiIcon name={visible ? 'eye-off' : 'eye'} />
    </button>
    </span>
  </div>;
}
