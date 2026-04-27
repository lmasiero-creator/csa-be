const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465, // true only for port 465, STARTTLS for 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

/**
 * Send an email.
 * @param {{ to: string|string[], subject: string, html: string }} options
 * @returns {Promise<object>} nodemailer info object
 */
async function sendMail({ to, subject, html }) {
  const transport = getTransporter();
  const toList = Array.isArray(to) ? to.join(', ') : to;
  const info = await transport.sendMail({
    from: `"CSA Fattoria" <${process.env.SMTP_USER}>`,
    to: toList,
    subject,
    html,
  });
  return info;
}

module.exports = { sendMail };
