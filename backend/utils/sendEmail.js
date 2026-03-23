const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Create a transporter
  let transporter;

  if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // Use TLS (port 587)
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false, // Allows Gmail's certificate
      },
    });
  } else {
    // Generate test SMTP service account from ethereal.email
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user, // generated ethereal user
        pass: testAccount.pass, // generated ethereal password
      },
    });
  }

  // Define email options
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Chronify <noreply@chronify.com>',
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  // Actually send the email using transporter
  const info = await transporter.sendMail(mailOptions);

  if (!process.env.EMAIL_HOST) {
    console.log('--- TEST EMAIL SENT (using Ethereal dummy provider) ---');
    console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    console.log('----------------------------------------------------');
  }
};

module.exports = sendEmail;
