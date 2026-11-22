import type { RequestField } from './request-forms';

export type RequestStarterKind = 'PIERCING_REQUEST' | 'TATTOO_REQUEST';

export function buildRequestStarter(kind: RequestStarterKind): {
  name: string;
  purpose: 'REQUEST';
  body: string;
  fields: RequestField[];
} {
  const tattoo = kind === 'TATTOO_REQUEST';
  const procedure = tattoo ? 'tattoo' : 'piercing';
  const fields: RequestField[] = [
    { id: 'first_name', type: 'TEXT', label: 'First name', required: true },
    { id: 'last_name', type: 'TEXT', label: 'Last name', required: true },
    { id: 'phone', type: 'PHONE', label: 'Phone number', required: true },
    { id: 'instagram', type: 'TEXT', label: 'Instagram handle', required: false },
    { id: 'location', type: 'TEXT', label: `Location of ${procedure}`, required: false },
  ];
  if (tattoo) fields.push(
    { id: 'size', type: 'TEXT', label: 'Size of tattoo', required: false },
    { id: 'budget', type: 'TEXT', label: 'Budget', required: false },
    { id: 'description', type: 'LONG_TEXT', label: 'Description of tattoo', required: false },
    { id: 'inspiration_1', type: 'IMAGE', label: 'Inspo Pics', required: false },
    { id: 'inspiration_2', type: 'IMAGE', label: 'Inspo Pics', required: false },
    { id: 'inspiration_3', type: 'IMAGE', label: 'Inspo Pics', required: false },
  );
  fields.push(
    { id: 'comments', type: 'LONG_TEXT', label: 'Additional comments/inquiries', required: false },
    { id: 'previous', type: 'RADIO', label: `Have you been ${tattoo ? 'tattooed' : 'pierced'} by me before?`, required: false, options: ['Yes', 'No', 'Other'] },
  );
  return {
    name: `${tattoo ? 'Tattoo' : 'Piercing'} Request Form`,
    purpose: 'REQUEST',
    body: `All ${procedure} inquiries will need to fill out a form. In order to help me streamline the booking process please fill out any relevent information I may need for your appointment. I will contact you through text within 72 hrs. 25% Deposit is due to schedule your appointment.`,
    fields,
  };
}
