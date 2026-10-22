import { PasswordResetForm } from '@/components/password-reset-form';
export const metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };
export default function ResetPassword() { return <PasswordResetForm complete />; }
