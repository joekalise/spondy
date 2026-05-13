# Privacy Policy — Spondy

**Last updated: 11 May 2026**

Spondy is a personal health companion for people living with Ankylosing Spondylitis (AS). This policy explains what data we collect, why we collect it, how it is stored, and your rights over it.

---

## 1. Who we are

Spondy is operated by Joseph Brockbank ("we", "us"). If you have any questions about this policy, contact us at joseph.brockbank@gmail.com.

---

## 2. What data we collect and why

### 2a. Account data
- **Email address** — used to create and authenticate your account.
- **Name / preferred name** — optional, used to personalise the app.

We collect this when you sign up with email/password, Apple Sign In, or Google Sign In.

### 2b. Health profile data
You provide this voluntarily during onboarding and can update it at any time:
- Age range, years since diagnosis, current disease activity (severity)
- Current medications, pain locations, pain types
- Associated conditions (e.g. uveitis, psoriasis, IBD)
- Morning stiffness duration, lifestyle challenges
- Biological sex (optional — used to show relevant tracking options such as menstrual cycle logging)

This data is used solely to personalise your experience and generate relevant AI insights.

### 2c. Daily tracking data
Logged by you each day:
- Pain score (0–10), fatigue score (0–10)
- Morning stiffness, mood, free-text notes
- Medication adherence
- Diet quality and dietary triggers
- Exercise (whether you exercised, duration, type)
- Period / menstrual cycle activity (for users who opt in — female users only)

### 2d. Flare logs
Start date, end date, severity, areas affected, and notes for any AS flares you record.

### 2e. BASDAI scores
Responses to the six BASDAI questionnaire items and the calculated score.

### 2f. Biologic injection logs
Medication name, injection date, interval, lot number (optional), response rating (optional).

### 2g. Uveitis episode logs
Start/end dates, affected eye, severity, symptoms, treatment received.

### 2h. Apple Health data (optional)
If you connect Apple Health, we read — and only read — the following:
- Step count
- Sleep duration and sleep stages (Core, Deep, REM)
- Resting heart rate
- Heart rate variability (HRV)
- Active calories burned
- Workouts (count per day)

We **never write anything to Apple Health**. We do not access any other health categories (e.g. weight, blood glucose, reproductive health) even if they exist in your Health app.

Health data is read on your device and stored in our secure database linked to your account. It is used solely to surface patterns relevant to your AS symptoms.

### 2i. Notification preferences
The time you set for your daily log reminder. No notification content is stored on our servers.

---

## 3. How we use your data

We use your data for the following purposes only:

| Purpose | Data used |
|---|---|
| Displaying your tracking history and trends | All tracking data you enter |
| Generating personalised AI insights and chat responses | Health profile + tracking data + Apple Health data |
| Sending your daily log reminder notification | Notification time preference |
| Processing subscription payments | Handled by RevenueCat (see below) — we do not see your card details |
| Deleting your account when requested | All data is deleted |

**We do not sell your data. We do not use your data for advertising. We do not share your data with third parties except as described in Section 5.**

---

## 4. AI processing

Spondy uses Claude, an AI model made by Anthropic, to generate personalised insights, a welcome message during onboarding, and responses in the AI chat.

When you trigger an AI feature, relevant portions of your health profile and recent tracking data are sent to Anthropic's API via our secure server-side proxy. This data is used only to generate your response and is not used to train Anthropic's models (we use the API under Anthropic's standard terms, which prohibit training on customer data).

Your data is sent over an encrypted connection (TLS) and is not stored by Anthropic beyond the duration of the API call.

---

## 5. Third-party services

| Service | Purpose | Data shared | Their privacy policy |
|---|---|---|---|
| Supabase | Database and authentication | All account and tracking data (encrypted at rest) | supabase.com/privacy |
| Anthropic | AI insights and chat | Health profile excerpt + recent tracking data | anthropic.com/privacy |
| RevenueCat | Subscription management | User ID, subscription status | revenuecat.com/privacy |
| Apple (HealthKit) | Health data reading | None — data flows from Apple Health to us, not the other way | apple.com/privacy |

---

## 6. Data storage and security

- All data is stored in a Supabase database hosted in the EU West (Ireland) region.
- Data is encrypted at rest and in transit.
- Row-level security policies ensure each user can only read and write their own data — no user can access another user's records.
- Your authentication session is stored securely in your device's encrypted secure storage (not in plain AsyncStorage).

---

## 7. Data retention

We retain your data for as long as your account is active. If you delete your account (via Profile → Delete Account), all data associated with your account — including your profile, all logs, flares, health data, and AI context — is permanently deleted from our database within 24 hours. This is irreversible.

---

## 8. Your rights

Under GDPR and applicable data protection law, you have the right to:

- **Access** — request a copy of the data we hold about you
- **Rectification** — correct inaccurate data (you can do this directly in the app)
- **Erasure** — delete your account and all associated data (available in the app under Profile → Delete Account)
- **Portability** — request your data in a machine-readable format
- **Restriction** — ask us to restrict processing of your data
- **Objection** — object to certain types of processing

To exercise any of these rights, contact us at joseph.brockbank@gmail.com. We will respond within 30 days.

---

## 9. Children

Spondy is not directed at children under 13 and we do not knowingly collect data from children under 13. If you believe a child under 13 has provided us with personal data, please contact us and we will delete it.

---

## 10. Changes to this policy

We may update this policy as the app evolves. If we make material changes, we will notify you within the app. The "Last updated" date at the top reflects the current version.

---

## 11. Contact

Joseph Brockbank  
joseph.brockbank@gmail.com
