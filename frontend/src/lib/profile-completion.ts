/** Mirror of backend/src/users/profile-completion.ts (server is authoritative). */
export const REQUIRED_PROFILE_FIELDS = ['name', 'companyName', 'businessType', 'country', 'phone'] as const;
export type ProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];
export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = { name: 'Full name', companyName: 'Company name', businessType: 'Business type', country: 'Country', phone: 'Business phone' };
export const missingProfileFields = (u: any): ProfileField[] => REQUIRED_PROFILE_FIELDS.filter((k) => !String(u?.[k] ?? '').trim());
/** Only accounts that started without a profile (onboardingCompleted === false) are asked to finish it. */
export const needsProfile = (u: any) => !!u && u.onboardingCompleted === false && missingProfileFields(u).length > 0;
