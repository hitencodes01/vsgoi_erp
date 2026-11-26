# VSGOI ERP

College ERP for VSGOI. React (Vite) + Node/Express + MySQL (Prisma 5).

**Structure:** Course (BTECH, BBA, BCA, MBA, Diploma, ITI) → optional Department (BTECH: CSE, CS, ME, EE · Diploma: EE, ME, CE · ITI: Fitter, Welder, Electrician) → Semester (Year = semester ÷ 2) → Section (A, B, C).
The only rule that tells courses apart: *if a course has departments, a department is required; otherwise it must stay empty.* Every form, the Excel import and every dashboard follow that one rule.

## Roles
- **Admin:** everything.
- **Faculty:** their lectures, marking attendance, attendance charts and records, exams and marks, notices, top-faculty ranking.
- **Student:** attendance (by subject, weekly chart, records), timetable, results, fees, notices.

## Modules
Login and forgot-password by email code (Gmail) · personal settings and change password · students, faculty, admins (add/edit/deactivate/reset password) · courses, departments, subjects (per course + department + semester) · faculty assignment (subject × section → faculty) · lecture scheduling with clash checks · lecture-wise attendance · exams and marks · fees and payments · notices · Excel import of students · promotion semester by semester · academic sessions (2026-27) and rules (minimum attendance, pass marks).

## Run on your laptop
Needs Node.js 20.6+ (22 LTS recommended) and MySQL 8 with an empty database named `vsgoi_erp`.
```bash
npm run install:all
cp server/.env.example server/.env        # edit DATABASE_URL and JWT_SECRET
cd server
npx prisma migrate dev --name init         # creates the tables (this also makes prisma/migrations)
npm run db:seed                            # demo data: 72 students, 8 faculty, 7 classes, lectures, attendance, fees, marks
cd ..
npm run dev:server                         # API  http://localhost:4000
npm run dev:client                         # app  http://localhost:5173
```
Demo logins are printed by the seed: `admin@vsgoi.org / Admin@12345`, the first faculty `anitasharma@vsgoi.org / Faculty@123`, the first student `<name><course><2 digits>@vsgoi.org / Student@123`. Change the passwords before real use.

**Starting over:** `cd server && npm run db:fresh && npm run db:seed` (this deletes everything).
**Real data:** do not run the demo seed. Run `npm run db:bootstrap` instead: it creates only the admin (password shown once), the six courses with departments, the current session and the rules.

## Login emails
- Student: name + course + last 2 digits, e.g. `aaravmishrabtech47@vsgoi.org`. The digits come from the last 2 digits of Aadhaar if the admin types them, otherwise from the enrollment number. Aadhaar digits are never stored. The department is never part of the email.
- Faculty: full name without Dr./Prof., e.g. `anitasharma@vsgoi.org`. Admin: `admin@vsgoi.org`. A taken address gets a number added.
- New accounts get a temporary password (shown once). The person must set a new password at first sign-in.
- The rules live in `server/src/lib/emails.js`.

## Excel import (admin → Import students)
Download the template, fill one row per student, upload, check the preview (problem rows show the reason), then import the valid rows. The login details (email + temporary password) download as a CSV right after, only once.
Columns: Course, Department, Year, Semester, Section, Name, Enrollment No, Contact No, Alternate Contact, Email (personal email), Address, Father Name, Mother Name, Last School Name, City, Aadhaar Last 2 (optional).
Required: Course, Year or Semester, Section, Name, Enrollment No. If Semester is empty, the first semester of that Year is used. At most 1000 rows per file.

## Semesters and promotion
Subjects belong to a course, an optional department and a semester. Students sit in a semester and section; they automatically see and attend the subjects of their class. At the end of a semester use **Promote students**: pick the class, untick anyone detained, promote. Students at the last semester become "passed out". A new session starts under **Session & settings**; assign faculty to the new semester's subjects again under **Faculty assignment**.

## How numbers are calculated
- Attendance = (present + late) ÷ (present + late + absent). Excused is left out. The minimum (default 75%) is set under Session & settings.
- Top faculty = average attendance in the classes they teach this session.
- Result pass = marks percentage at or above the pass marks (default 40%), per subject.

## Deploying on a VPS
See DEPLOY.md.
