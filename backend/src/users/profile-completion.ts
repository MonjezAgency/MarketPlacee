/**
 * One definition of a "complete" business profile, used for Google sign-ups,
 * the completion page, order gating and onboarding reminders. These are the
 * same fields the email sign-up already requires.
 */
export const REQUIRED_PROFILE_FIELDS = ['name', 'companyName', 'businessType', 'country', 'phone'] as const;
export type ProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

export function missingProfileFields(u: Partial<Record<ProfileField, unknown>> | null | undefined): ProfileField[] {
    return REQUIRED_PROFILE_FIELDS.filter((k) => !String(u?.[k] ?? '').trim());
}

/** Reminder timing (minutes after the account became eligible). */
export const REMINDER_1_AFTER_MIN = 30;
export const REMINDER_2_AFTER_MIN = 60;
export const REMINDER_MIN_GAP_MIN = 20; // never send #2 right after a delayed #1
export const REMINDER_MAX_FAILURES = 3;

export type ReminderStep = 1 | 2 | null;
/** Which reminder (if any) is due now — pure, so the schedule is testable. */
export function dueReminder(u: {
    onboardingCompleted?: boolean | null; emailVerified?: boolean | null; status?: string | null;
    profileIncompleteSince?: Date | null; profileReminder1SentAt?: Date | null; profileReminder2SentAt?: Date | null;
    profileReminderFailures?: number | null; notificationPrefs?: any;
} & Partial<Record<ProfileField, unknown>>, now = new Date()): ReminderStep {
    if (u.onboardingCompleted !== false || !u.emailVerified || !u.profileIncompleteSince) return null;
    if (['BLOCKED', 'REJECTED', 'DELETED'].includes(String(u.status))) return null;
    if ((u.profileReminderFailures ?? 0) >= REMINDER_MAX_FAILURES) return null;
    if (u.notificationPrefs && (u.notificationPrefs as any).onboardingReminders === false) return null;
    if (missingProfileFields(u).length === 0) return null;
    const mins = (now.getTime() - new Date(u.profileIncompleteSince).getTime()) / 60000;
    if (!u.profileReminder1SentAt) return mins >= REMINDER_1_AFTER_MIN ? 1 : null;
    if (!u.profileReminder2SentAt) {
        const since1 = (now.getTime() - new Date(u.profileReminder1SentAt).getTime()) / 60000;
        return mins >= REMINDER_2_AFTER_MIN && since1 >= REMINDER_MIN_GAP_MIN ? 2 : null;
    }
    return null;
}
