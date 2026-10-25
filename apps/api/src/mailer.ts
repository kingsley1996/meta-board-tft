// Mailer seam for transactional email (verification links). The console mailer
// writes the message to the server log so local development can click the link
// without a provider. To go live, implement Mailer with your provider of choice
// (Resend POST /emails, or SMTP via nodemailer) and return it from getMailer()
// behind a MAILER=... env switch; the auth routes do not change.
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
  return consoleMailer;
}
