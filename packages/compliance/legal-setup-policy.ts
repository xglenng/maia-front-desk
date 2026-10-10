export type LegalSetupSnapshot = {
  customers: { id: string; legalName: string; customerType: string }[];
  accounts: { id: string; accountSid: string; status: string }[];
  bindings: { legalCustomerId: string; accountId: string }[];
  artists: { id: string; displayName: string }[];
  intents: { id: string; status: string }[];
  liveCreationEnabled: boolean;
};

/** UI eligibility only; server ownership and preflight checks remain authoritative. */
export function legalSetupActions(setup: LegalSetupSnapshot | null) {
  const customer = setup?.customers.length === 1 ? setup.customers[0] : null;
  const account = setup?.accounts.length === 1 ? setup.accounts[0] : null;
  const active = Boolean(account && account.status === 'ACTIVE' && /^AC[0-9a-f]{32}$/i.test(account.accountSid));
  const bound = Boolean(customer && active && setup?.bindings.length === 1 && setup.bindings[0].legalCustomerId === customer.id && setup.bindings[0].accountId === account?.id);
  const unbound = setup?.bindings.length === 0;
  return { customer, account, bound,
    canBind: Boolean(customer && active && unbound && !setup?.intents.some(intent => intent.status !== 'COMPLETED')),
    canCreate: Boolean(customer && unbound && setup?.accounts.length === 0 && setup.intents.length === 0 && setup.liveCreationEnabled && setup.artists.length > 0),
  };
}
