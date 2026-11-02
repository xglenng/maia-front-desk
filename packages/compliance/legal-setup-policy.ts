export type LegalSetupSnapshot = {
  savedBusinessName?: string|null;
  defaultArtistId?: string|null;
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

/** A blocked account needs an actionable explanation, not a disabled Next button. */
export function legalSetupReviewReason(setup: LegalSetupSnapshot|null):string|null {
  if(!setup)return null;
  const actions=legalSetupActions(setup);
  if(actions.bound||actions.canBind||actions.canCreate)return null;
  if(setup.customers.length>1)return 'More than one business identity is recorded. Maia must confirm which business owns messaging.';
  if(!actions.customer)return null;
  if(setup.accounts.length>1)return 'Multiple existing messaging accounts were found. Maia must review them before choosing the live account.';
  if(actions.account&&!/^AC[0-9a-f]{32}$/i.test(actions.account.accountSid))return 'The existing messaging account is a test or invalid account record. Maia must reconcile it with a live account before you can create a number.';
  if(actions.account&&actions.account.status!=='ACTIVE')return 'The existing messaging account is not active. Maia must check its status before setup can continue.';
  if(setup.intents.length)return 'An earlier account setup attempt needs review. Maia must confirm its outcome before another account can be created.';
  if(setup.bindings.length)return 'The saved account connection does not match this business. Maia must review account ownership.';
  if(!setup.liveCreationEnabled)return 'Live messaging account setup has not been enabled for this environment. Maia must finish the platform configuration.';
  if(!setup.artists.length)return 'Add an artist profile before setting up the business messaging account.';
  return 'The business messaging account needs review before setup can continue.';
}
