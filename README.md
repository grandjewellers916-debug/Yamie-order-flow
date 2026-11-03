# Marunnu Kazhicho? (മരുന്ന് കഴിച്ചോ?)

Simple Android medicine reminder with a ringing alarm.

- Add each medicine: name, for whom, type (Antibiotic, Pain killers, Sleep helper, Bowel motion, Diabetic, Vitamins, Supplements), intake (Mandatory / If needed / Conditional), before or after food, and the dose (½, 1, 2) for Morning, Noon, Evening, Night.
- Course length in days (e.g. a 5-day antibiotic) — reminders stop by themselves.
- Alarm rings at the set time, even on silent, and shows a big screen over the lock screen: **Taken**, **Remind me later**, **Skip**.
- Before-food medicines ring earlier (30 min by default).
- "Today" screen shows what's been taken, with ticks; "If needed" medicines are logged without alarms.
- All data stays on the phone.

Screens: `web/index.html`. Android shell, alarms and notifications: `android/`.
Every push to this branch builds the APK and publishes it under Releases.
