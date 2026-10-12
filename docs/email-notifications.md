# Atlantis email notifications

Status: the authentication emails are implemented. The marketplace notifications below are a **design only**: nothing in this section is built, and no campaign is sent.

## 1. Two separate classes of email

| Class | Examples | Can the user opt out? | Unsubscribe header |
|---|---|---|---|
| **Security / transactional** | Sign-up code, email verified, password reset, change-email code and notices, "someone tried to register with your email" | **No.** These are required to operate the account. | Should not carry `List-Unsubscribe` (see the open issue below). |
| **Marketplace / commercial** | New supplier offers, newly listed products, offers matching a buyer's preferences | **Yes.** Opt-in, configurable, one-click unsubscribe. | Required. |

Security emails are never sent to marketing lists and never contain promotions.

## 2. Authentication emails (implemented)

All of them live in `backend/src/email/auth-email-templates.ts` and share one layout:
- a navy header with the Atlantis wordmark and a teal accent;
- system fonts and a 560px card;
- every user-supplied value is HTML-escaped.

| Trigger | Template | Content |
|---|---|---|
| Sign-up (`POST /auth/register`) and resend | `verifySignupEmail` | A 6-digit code (15 min) plus a link to `/auth/verify-email?email=…`. |
| Code accepted | `emailVerifiedEmail` | Confirmation that the account now goes to the team for review. |
| Sign-up attempted with an existing email | `signupExistingAccountEmail` | Sent only to the real owner. The API response is identical either way, so sign-up can't be used to find out who is registered. |
| Forgot password | `passwordResetEmail` | A single-use link valid for 60 min. Only a SHA-256 hash of the token is stored. |
| Change email requested | `changeEmailCodeEmail` to the new address, plus `changeEmailNoticeEmail` to the old address | Code (15 min) and a heads-up. |
| Change email confirmed | `changeEmailNoticeEmail` (done) to the old address | "If this wasn't you, contact Atlantis." |

Delivery uses the existing `EmailService`: Resend first, with SMTP (Hostinger) as the fallback. The provider credentials live only in Railway environment variables.

## 3. Marketplace notifications (design)

### Triggers
- **New supplier offer:** an `Offer` row moves to `APPROVED`. The trigger is the admin approval, not the supplier's submission.
- **Newly listed product:** a `Product` moves to `APPROVED`.
- **Matching offer:** either of the above, when it matches a buyer's saved preferences.

### Eligibility
A recipient must meet all of these:
- role is `CUSTOMER`, `status = ACTIVE` and `emailVerified = true`;
- has opted in to the relevant category (no default opt-in for promotional mail in the EU);
- the item is visible to them, i.e. `APPROVED` and not expired.

### Preferences
These extend the existing `notificationPrefs` JSON:
- `newOffers`: boolean;
- `newProducts`: boolean;
- `categories` and `brands`: string arrays to narrow the matches;
- `frequency`: `instant` | `daily` | `weekly`, with `daily` as the default once a buyer opts in.

### Delivery workflow (to build)
1. Approval writes a `MarketplaceEvent` row: type, entity id and timestamp.
2. A scheduled job (the existing `ScheduleModule`) groups events by recipient and frequency.
3. Each digest is sent with a per-recipient, signed unsubscribe token.
4. A send log records recipient, event ids and provider result. This prevents duplicates and supports auditing.
5. Rate limits: at most one digest per frequency window, and an overall daily cap per recipient.

### Unsubscribe
- A one-click `List-Unsubscribe` and `List-Unsubscribe-Post` header with a signed token. There should be no plain `?email=` parameter.
- The link turns off the commercial categories only. Security emails continue.
- Settings → Email notifications shows the same switches.

### Review before launch
- Template copy and any legal/consent wording need business sign-off.
- Run a test send to internal addresses before the first real digest.

## 4. Open issue in the current mailer

`EmailService.sendMailDetailed` adds a `List-Unsubscribe` header pointing at `/unsubscribe?email=<address>` to **every** email, including security codes. This should be split:
- transactional sends should have no unsubscribe header;
- commercial sends should use a signed token instead of the raw address.

This isn't changed in this release, because it affects all existing emails.
