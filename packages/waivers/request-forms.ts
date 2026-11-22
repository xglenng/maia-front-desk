import { z } from 'zod';
import { nativeQuestion } from './forms';

const imageField = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  type: z.literal('IMAGE'),
  label: z.string().trim().min(1).max(300),
  required: z.boolean(),
});

export const requestDefinition = z.object({
  body: z.string().trim().min(1).max(30000),
  fields: z.array(z.union([nativeQuestion, imageField])).max(40),
  logoAssetId: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (new Set(value.fields.map(field => field.id)).size !== value.fields.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Question IDs must be unique.' });
  }
  if (value.fields.some(field => field.type === 'PHOTO_ID')) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Photo ID fields are only available on consent forms.' });
  }
  if (value.fields.filter(field => field.type === 'IMAGE').length > 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Use at most three image uploads per request form.' });
  }
  for (const [id, type] of [['first_name', 'TEXT'], ['last_name', 'TEXT'], ['phone', 'PHONE']] as const) {
    if (!value.fields.some(field => field.id === id && field.type === type && field.required)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `The required ${id.replace('_', ' ')} field must remain on the form.` });
    }
  }
});

export type RequestDefinition = z.infer<typeof requestDefinition>;
export type RequestField = RequestDefinition['fields'][number];
