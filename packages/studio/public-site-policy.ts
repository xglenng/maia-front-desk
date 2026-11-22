import { industry, industryOptions } from '@/packages/onboarding/industry';
import { requestStarterMetadata } from '@/packages/waivers/request-starters';

const headlines = {
  TATTOO: ['Your next piece.', 'Starts here.'],
  PIERCING: ['A new detail.', 'All your own.'],
  HAIR: ['Your next look.', 'Starts here.'],
  NAILS: ['Your next set.', 'Starts here.'],
  ESTHETICS: ['Time for you.', 'Starts here.'],
  OTHER: ['Your next appointment.', 'Starts here.'],
} as const;

export function publicSiteIndustry(values: string[]) {
  // Organizations created before industry setup keep their original specialties.
  const selected = [...new Set((values.length ? values : ['TATTOO', 'PIERCING']).flatMap(value => {
    const parsed = industry.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  }))];
  const headline = selected.length === 1 ? headlines[selected[0]] : ['Your next appointment.', 'Made for you.'];
  const labels = industryOptions.filter(option => option.value !== 'OTHER' && selected.includes(option.value)).map(option => option.label);
  return {
    headline,
    specialties: labels.join(' · '),
    requestTypes: requestStarterMetadata.filter(template => selected.includes(template.industry)).map(template => template.kind),
  };
}
