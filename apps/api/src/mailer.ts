// Mailer seam for transactional email (verification links). The console mailer
// writes the message to the server log so local development can click the link
// without a provider. To go live, implement Mailer with your provider of choice
// (Resend POST /emails, or SMTP via nodemailer) and return it from getMailer()
// behind a MAILER=... env switch; the auth routes do not change. Production has
// no console fallback — getMailer() refuses until a provider exists.
export type MailerInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface Mailer {
  send(input: MailerInput): Promise<void>;
}

export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.log(`[mailer:console] to=${to} subject="${subject}"\n${text}`);
  },
};

export function getMailer(): Mailer {
  // Reserved: switch on process.env.MAILER once a real provider is wired up.
  if (process.env.NODE_ENV === 'production') {
    // A verification link in a hosting provider's log is a usable credential, and
    // a signup that "succeeded" without ever sending email loses the user in
    // silence. Failing here is the only honest outcome.
    throw new Error('no transactional mailer is configured; wire one into src/mailer.ts before enabling email verification');
  }
  return consoleMailer;
}
