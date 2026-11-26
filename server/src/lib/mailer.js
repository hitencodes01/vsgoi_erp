import nodemailer from 'nodemailer';

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail({ to, subject, text }) {
  if (!transport) {
    if (process.env.NODE_ENV === 'production') {
      console.error('SMTP is not configured, so the email was not sent.');
      return;
    }
    // Development only: show the email in the terminal so you can test without an SMTP account.
    console.log(`\n--- dev email (SMTP not configured) ---\nTo: ${to}\nSubject: ${subject}\n\n${text}\n---------------------------------------\n`);
    return;
  }
  await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
}
