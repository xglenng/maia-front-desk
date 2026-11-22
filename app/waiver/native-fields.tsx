'use client';
import type { NativeAnswers } from '@/packages/waivers/forms';
import type { RequestField } from '@/packages/waivers/request-forms';
export default function NativeFields({
  fields,
  answers,
  onChange,
  disabled = false,
  onPhotoIdChange,
  onImageChange,
  maxDobToday = '',
  fieldError = '',
  onFieldErrorClear,
}: {
  fields: RequestField[];
  answers: NativeAnswers;
  onChange: (answers: NativeAnswers) => void;
  disabled?: boolean;
  onPhotoIdChange?: (file: File | null) => void;
  onImageChange?: (fieldId: string, file: File | null) => void;
  maxDobToday?: string;
  fieldError?: string;
  onFieldErrorClear?: () => void;
}) {
  const isDobField = (fieldId: string) => fieldId.endsWith('date_of_birth');
  const isDobError = fieldError.includes('Date of birth') || fieldError.includes('date');

  return (
    <div className="native-question-list">
      {fields.map((field) => {
        if (field.type === 'HEADING')
          return (
            <h2 key={field.id} style={{ fontSize: 22, margin: '28px 0 12px' }}>
              {field.label}
            </h2>
          );
        if (field.type === 'PARAGRAPH')
          return (
            <p key={field.id} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {field.label}
            </p>
          );
        if (field.type === 'DIVIDER')
          return (
            <hr
              key={field.id}
              style={{
                border: 0,
                borderTop: '1px solid #e2e2e2',
                margin: '28px 0',
              }}
            />
          );
        if (field.type === 'IMAGE')
          return (
            <label key={field.id} style={{display:'block',margin:'24px 0'}}>
              {field.label}{field.required ? ' *' : ''}
              <input type="file" accept="image/jpeg,image/png" required={field.required} disabled={disabled}
                onChange={event => onImageChange?.(field.id,event.target.files?.[0] || null)} style={control}/>
              <small>JPEG or PNG, up to 5 MB. Images are stored privately.</small>
            </label>
          );
        if (field.type === 'PHOTO_ID')
          return (
            <label
              key={field.id}
              style={{ display: 'block', margin: '24px 0' }}
            >
              {field.label}
              {field.required ? ' *' : ''}
              <input
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                required={field.required}
                disabled={disabled}
                onChange={(event) =>
                  onPhotoIdChange?.(event.target.files?.[0] || null)
                }
                style={control}
              />
              <small>
                Upload or take a clear JPEG or PNG photo, up to 5 MB. Saved
                privately with your signed form. The studio still needs to
                verify your identity.
              </small>
            </label>
          );
        const value =
          typeof answers[field.id] === 'string'
            ? (answers[field.id] as string)
            : '';
        const change = (text: string) => {
          if (isDobError && isDobField(field.id)) onFieldErrorClear?.();
          onChange({ ...answers, [field.id]: text });
        };
        if (field.type === 'RADIO' || field.type === 'MULTI_CHOICE')
          return (
            <fieldset
              key={field.id}
              style={{ border: 0, padding: 0, margin: '24px 0' }}
            >
              <legend style={{ fontSize: 14, marginBottom: 10 }}>
                {field.label}
                {field.required ? ' *' : ''}
              </legend>
              {field.options.map((option) => (
                <label
                  key={option}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    margin: '10px 0',
                    fontSize: 14,
                  }}
                >
                  <input
                    type={field.type === 'RADIO' ? 'radio' : 'checkbox'}
                    name={`question-${field.id}`}
                    disabled={disabled}
                    required={field.type === 'RADIO' && field.required}
                    checked={
                      field.type === 'RADIO'
                        ? value === option
                        : Array.isArray(answers[field.id]) &&
                          (answers[field.id] as string[]).includes(option)
                    }
                    onChange={(event) => {
                      if (field.type === 'RADIO') {
                        change(option);
                      } else {
                        const previous = Array.isArray(answers[field.id])
                          ? (answers[field.id] as string[])
                          : [];
                        onChange({
                          ...answers,
                          [field.id]: event.target.checked
                            ? [...previous, option]
                            : previous.filter((item) => item !== option),
                        });
                      }
                    }}
                  />
                  {option}
                </label>
              ))}
            </fieldset>
          );

        const hasFieldError = isDobError && isDobField(field.id);
        return (
          <label
            key={field.id}
            style={{
              display: 'block',
              margin: '20px 0',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {field.type === 'ACKNOWLEDGMENT' ? (
              <>
                <input
                  type="checkbox"
                  disabled={disabled}
                  required={field.required}
                  checked={answers[field.id] === true}
                  onChange={(event) =>
                    onChange({
                      ...answers,
                      [field.id]: event.target.checked,
                    })
                  }
                />{' '}
                {field.label}
                {field.required ? ' *' : ''}
              </>
            ) : (
              <>
                {field.label}
                {field.required ? ' *' : ''}
                {field.type === 'CHOICE' ? (
                  <select
                    disabled={disabled}
                    required={field.required}
                    value={value}
                    onChange={(event) => change(event.target.value)}
                    style={control}
                  >
                    <option value="">Choose an answer</option>
                    {field.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : field.type === 'LONG_TEXT' || field.type === 'ADDRESS' ? (
                  <textarea
                    disabled={disabled}
                    required={field.required}
                    maxLength={5000}
                    rows={field.type === 'ADDRESS' ? 3 : 4}
                    autoComplete={
                      field.type === 'ADDRESS' ? 'street-address' : undefined
                    }
                    value={value}
                    onChange={(event) => change(event.target.value)}
                    style={control}
                  />
                ) : (
                  <input
                    type={
                      field.type === 'EMAIL'
                        ? 'email'
                        : field.type === 'PHONE'
                          ? 'tel'
                          : field.type === 'DATE'
                            ? 'date'
                            : field.type === 'NUMBER'
                              ? 'number'
                              : 'text'
                    }
                    step={field.type === 'NUMBER' ? 'any' : undefined}
                    max={
                      field.type === 'DATE' && isDobField(field.id)
                        ? maxDobToday
                        : undefined
                    }
                    autoComplete={
                      field.type === 'FULL_NAME'
                        ? 'name'
                        : field.type === 'EMAIL'
                          ? 'email'
                          : field.type === 'PHONE'
                            ? 'tel'
                            : undefined
                    }
                    disabled={disabled}
                    required={field.required}
                    maxLength={500}
                    value={value}
                    onChange={(event) => change(event.target.value)}
                    style={{
                      ...control,
                      borderColor: hasFieldError ? '#c00' : undefined,
                    }}
                  />
                )}
                {hasFieldError && (
                  <small
                    style={{
                      display: 'block',
                      color: '#c00',
                      marginTop: 4,
                    }}
                  >
                    {fieldError}
                  </small>
                )}
              </>
            )}
          </label>
        );
      })}
    </div>
  );
}
const control = {
  display: 'block',
  boxSizing: 'border-box' as const,
  width: '100%',
  font: 'inherit',
  padding: 12,
  marginTop: 8,
  border: '1px solid #d7d7d7',
  borderRadius: 10,
  background: '#fff',
};
