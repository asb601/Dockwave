import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: Number(process.env.EMAIL_SERVER_PORT || 587),
  secure: false,
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.EMAIL_SERVER_PASSWORD,
  },
});

export async function sendAccessRequestEmail({
  userName,
  userEmail,
  approveUrl,
}: {
  userName: string;
  userEmail: string;
  approveUrl: string;
}) {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_SERVER_USER;
  if (!adminEmail) throw new Error("ADMIN_EMAIL not configured");

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER,
    to: adminEmail,
    subject: `Docwave AI Access Request — ${userName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="margin: 0 0 8px; font-size: 20px; color: #111;">New AI Access Request</h2>
        <p style="margin: 0 0 24px; color: #555; font-size: 14px;">A user is requesting access to the AI chat feature.</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; color: #888; font-size: 13px; width: 80px;">Name</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 500;">${userName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #888; font-size: 13px;">Email</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 500;">${userEmail}</td>
          </tr>
        </table>
        <a href="${approveUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500;">
          Approve Access
        </a>
        <p style="margin: 20px 0 0; color: #999; font-size: 12px;">Click the button above to grant this user AI chat access.</p>
      </div>
    `,
  });
}

export async function sendTestEmail() {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_SERVER_USER;
  if (!adminEmail) throw new Error("ADMIN_EMAIL not configured");

  return transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_SERVER_USER,
    to: adminEmail,
    subject: "Docwave mail test",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="margin: 0 0 8px; font-size: 20px; color: #111;">Mail Test Successful</h2>
        <p style="margin: 0; color: #555; font-size: 14px;">This confirms Docwave can connect to Gmail SMTP and deliver admin emails.</p>
      </div>
    `,
  });
}
