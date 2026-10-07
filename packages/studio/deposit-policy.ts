export type ServiceDepositType = 'NONE' | 'FIXED' | 'PERCENT';

export type ServiceDepositConfiguration = {
  depositType: string;
  depositAmountCents: number | null;
  depositPercent: number | null;
};

export type DepositInput = {
  depositType?: ServiceDepositType;
  depositAmountCents?: number | null;
  depositPercent?: number | null;
};

export function normalizeServiceDeposit(input: DepositInput, current?: ServiceDepositConfiguration): ServiceDepositConfiguration {
  const type = input.depositType ?? current?.depositType ?? 'NONE';
  const amountWasSupplied = Object.prototype.hasOwnProperty.call(input, 'depositAmountCents');
  const percentWasSupplied = Object.prototype.hasOwnProperty.call(input, 'depositPercent');
  return {
    depositType: type,
    depositAmountCents: type === 'FIXED'
      ? amountWasSupplied ? input.depositAmountCents ?? null : current?.depositType === type ? current.depositAmountCents : null
      : null,
    depositPercent: type === 'PERCENT'
      ? percentWasSupplied ? input.depositPercent ?? null : current?.depositType === type ? current.depositPercent : null
      : null,
  };
}

export function validServiceDeposit(configuration: ServiceDepositConfiguration) {
  if (configuration.depositType === 'NONE') return configuration.depositAmountCents === null && configuration.depositPercent === null;
  if (configuration.depositType === 'FIXED') return configuration.depositAmountCents != null && Number.isSafeInteger(configuration.depositAmountCents) && configuration.depositAmountCents > 0 && configuration.depositPercent === null;
  if (configuration.depositType === 'PERCENT') return configuration.depositPercent != null && Number.isSafeInteger(configuration.depositPercent) && configuration.depositPercent >= 1 && configuration.depositPercent <= 100 && configuration.depositAmountCents === null;
  return false;
}
