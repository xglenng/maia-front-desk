import { normalizePhone } from '@/packages/consent';
import { validateNativeAnswers, type NativeField } from './forms';
import type { RequestDefinition } from './request-forms';

export function validateRequestAnswers(definition: RequestDefinition, input: unknown, uploadedFieldIds: string[]) {
  const imageFields = definition.fields.filter(field => field.type === 'IMAGE');
  if (new Set(uploadedFieldIds).size !== uploadedFieldIds.length ||
      uploadedFieldIds.some(id => !imageFields.some(field => field.id === id))) {
    return { success: false as const, error: 'Invalid image upload.' };
  }
  const missingImage = imageFields.find(field => field.required && !uploadedFieldIds.includes(field.id));
  if (missingImage) return { success: false as const, error: `Please upload: ${missingImage.label}` };

  const fields: NativeField[] = definition.fields.filter((field): field is NativeField => field.type !== 'IMAGE');
  const checked = validateNativeAnswers({ body: definition.body, fields }, input);
  if (!checked.success) return checked;
  for (const field of fields) {
    if (field.type !== 'PHONE') continue;
    const value = checked.data[field.id];
    if (typeof value !== 'string' || !value) continue;
    try {
      checked.data[field.id] = normalizePhone(value);
    } catch {
      return { success: false as const, error: 'Enter a valid US phone number or an international number beginning with +.' };
    }
  }
  return checked;
}
