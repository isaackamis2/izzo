const nodemailer = require('nodemailer');
const Settings = require('../models/Settings');
const User = require('../models/User');

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('[Mailer] SMTP settings not fully configured in .env');
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/**
 * Resolves the admin notification recipient email address
 */
async function getAdminNotificationEmail() {
  try {
    const settings = await Settings.findOne();
    if (settings && settings.notificationEmail) {
      return settings.notificationEmail;
    }
  } catch (err) {
    console.error('[Mailer] Error reading settings notification email:', err.message);
  }
  return process.env.ADMIN_EMAIL || process.env.NOTIFICATION_EMAIL || 'izzoeventsapp@gmail.com';
}

/**
 * Sends a branded QR ticket email to the attendee
 */
async function sendTicketEmail(user, event, registration) {
  try {
    const transporter = getTransporter();
    if (!transporter) return;

    const qrBase64 = registration.qrCode ? registration.qrCode.split(';base64,').pop() : null;
    const attachments = qrBase64 ? [{ filename: 'ticket-qrcode.png', content: qrBase64, encoding: 'base64' }] : [];

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #161E2C; color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #2B384E;">
        <div style="background-color: #1E2738; padding: 24px 30px; border-bottom: 2px solid #D8B26E; text-align: center;">
          <h1 style="color: #D8B26E; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 1px;">IZZOEVENTS</h1>
          <p style="color: #94A3B8; margin: 6px 0 0 0; font-size: 13px;">Official Digital Ticket Confirmation</p>
        </div>
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #F1F5F9; margin-top: 0;">Hi <strong>${user.name || 'Valued Guest'}</strong>,</p>
          <p style="color: #CBD5E1; line-height: 1.6;">You are confirmed for <strong style="color: #FFFFFF;">${event.title}</strong>! Below are your event and ticket details:</p>
          
          <div style="background-color: #1E2738; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #2B384E;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; color: #94A3B8; font-weight: bold; width: 35%;">📅 Date & Time:</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-weight: 600;">${new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94A3B8; font-weight: bold;">📍 Venue:</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-weight: 600;">${event.venue}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94A3B8; font-weight: bold;">🎟️ Ticket Tier:</td>
                <td style="padding: 8px 0; color: #D8B26E; font-weight: 900;">${registration.ticketTier || 'Standard'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #94A3B8; font-weight: bold;">💳 Amount Paid:</td>
                <td style="padding: 8px 0; color: #FFFFFF; font-weight: 600;">${registration.amountPaid ? registration.amountPaid.toLocaleString() + ' RWF' : 'FREE'}</td>
              </tr>
              ${registration.transactionId ? `
              <tr>
                <td style="padding: 8px 0; color: #94A3B8; font-weight: bold;">🧾 Reference ID:</td>
                <td style="padding: 8px 0; color: #94A3B8; font-family: monospace;">${registration.transactionId}</td>
              </tr>` : ''}
            </table>
          </div>

          <div style="text-align: center; margin: 30px 0 20px 0;">
            <p style="color: #D8B26E; font-weight: bold; font-size: 14px; margin-bottom: 12px;">📲 Present this QR Code at the Entrance</p>
            ${qrBase64 ? `<img src="cid:ticket-qrcode" alt="QR Code Ticket" style="width: 180px; height: 180px; border-radius: 12px; background: white; padding: 10px; display: inline-block;" />` : ''}
          </div>

          <p style="color: #94A3B8; font-size: 13px; text-align: center; line-height: 1.5; margin-top: 24px;">
            Need help? Contact the organizer at <strong style="color: #CBD5E1;">${event.organizerName || 'IzzoEvents Support'}</strong>.
          </p>
        </div>
        <div style="background-color: #121824; padding: 16px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #232F42;">
          © ${new Date().getFullYear()} IzzoEvents • Kigali, Rwanda
        </div>
      </div>
    `;

    if (qrBase64) {
      attachments[0].cid = 'ticket-qrcode';
    }

    await transporter.sendMail({
      from: `"IzzoEvents Tickets" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `🎟️ Your Ticket Confirmation: ${event.title}`,
      html: htmlContent,
      attachments
    });

    console.log(`[Mailer] Ticket email sent to attendee: ${user.email}`);
  } catch (err) {
    console.error('[Mailer] Error sending ticket email to attendee:', err.message);
  }
}

/**
 * Sends real-time notification to the Admin and Event Organizer on new registration / ticket purchase
 */
async function notifyNewRegistration(user, event, registration) {
  try {
    const transporter = getTransporter();
    if (!transporter) return;

    const adminEmail = await getAdminNotificationEmail();
    const recipients = new Set();
    if (adminEmail) recipients.add(adminEmail.trim());

    // Also notify event manager if different
    if (event.manager) {
      try {
        let managerObj = event.manager;
        if (!managerObj.email) {
          managerObj = await User.findById(event.manager);
        }
        if (managerObj && managerObj.email) {
          recipients.add(managerObj.email.trim());
        }
      } catch (e) {
        console.error('[Mailer] Could not find event manager email:', e.message);
      }
    }

    const emailList = Array.from(recipients).filter(Boolean);
    if (emailList.length === 0) return;

    const isPaid = registration.amountPaid && registration.amountPaid > 0;
    const amountStr = isPaid ? `${registration.amountPaid.toLocaleString()} RWF` : 'Free Registration';

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #161E2C; color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #2B384E;">
        <div style="background-color: #1E2738; padding: 20px 30px; border-bottom: 2px solid #D8B26E;">
          <h2 style="color: #D8B26E; margin: 0; font-size: 20px; font-weight: 900;">⚡ NEW REGISTRATION ALERT</h2>
          <p style="color: #94A3B8; margin: 4px 0 0 0; font-size: 13px;">IzzoEvents Platform Notification</p>
        </div>
        <div style="padding: 26px 30px;">
          <p style="font-size: 15px; color: #F1F5F9; margin-top: 0;">
            A user has just registered for an event on <strong>IzzoEvents</strong>!
          </p>

          <div style="background-color: #1E2738; border-radius: 12px; padding: 18px; margin: 18px 0; border: 1px solid #2B384E;">
            <h3 style="color: #D8B26E; margin: 0 0 12px 0; font-size: 16px; border-bottom: 1px solid #2B384E; padding-bottom: 8px;">Event Details</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold; width: 35%;">📌 Event:</td>
                <td style="padding: 6px 0; color: #FFFFFF; font-weight: bold;">${event.title}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">📅 Date:</td>
                <td style="padding: 6px 0; color: #CBD5E1;">${new Date(event.date).toLocaleDateString()}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">📍 Venue:</td>
                <td style="padding: 6px 0; color: #CBD5E1;">${event.venue}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">👥 Remaining Capacity:</td>
                <td style="padding: 6px 0; color: #34D399; font-weight: bold;">${event.currentCapacity} left</td>
              </tr>
            </table>
          </div>

          <div style="background-color: #1E2738; border-radius: 12px; padding: 18px; margin: 18px 0; border: 1px solid #2B384E;">
            <h3 style="color: #D8B26E; margin: 0 0 12px 0; font-size: 16px; border-bottom: 1px solid #2B384E; padding-bottom: 8px;">Attendee & Payment</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold; width: 35%;">👤 Attendee Name:</td>
                <td style="padding: 6px 0; color: #FFFFFF; font-weight: bold;">${user.name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">✉️ Attendee Email:</td>
                <td style="padding: 6px 0; color: #38BDF8;">${user.email}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">🎟️ Ticket Tier:</td>
                <td style="padding: 6px 0; color: #D8B26E; font-weight: bold;">${registration.ticketTier || 'Standard'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">💰 Amount Paid:</td>
                <td style="padding: 6px 0; color: #34D399; font-weight: 900;">${amountStr}</td>
              </tr>
              ${registration.transactionId ? `
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">🧾 Transaction ID:</td>
                <td style="padding: 6px 0; color: #94A3B8; font-family: monospace;">${registration.transactionId}</td>
              </tr>` : ''}
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">⏰ Registered At:</td>
                <td style="padding: 6px 0; color: #94A3B8;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <p style="color: #94A3B8; font-size: 13px; text-align: center; margin-top: 20px;">
            You can view and manage all attendees on your <a href="https://izzoevents.com/dashboard" style="color: #D8B26E; text-decoration: none; font-weight: bold;">IzzoEvents Dashboard</a>.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"IzzoEvents Alerts" <${process.env.SMTP_USER}>`,
      to: emailList,
      subject: `🎉 New Registration: ${user.name} for "${event.title}" [${amountStr}]`,
      html: htmlContent
    });

    console.log(`[Mailer] New registration notification sent to: ${emailList.join(', ')}`);
  } catch (err) {
    console.error('[Mailer] Error sending registration notification:', err.message);
  }
}

/**
 * Sends notification to Admin when a new user signs up on the platform
 */
async function notifyNewUserSignup(user) {
  try {
    const transporter = getTransporter();
    if (!transporter) return;

    const adminEmail = await getAdminNotificationEmail();
    if (!adminEmail) return;

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #161E2C; color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #2B384E;">
        <div style="background-color: #1E2738; padding: 20px 30px; border-bottom: 2px solid #D8B26E;">
          <h2 style="color: #D8B26E; margin: 0; font-size: 20px; font-weight: 900;">👤 NEW USER SIGNUP</h2>
          <p style="color: #94A3B8; margin: 4px 0 0 0; font-size: 13px;">IzzoEvents Platform Notification</p>
        </div>
        <div style="padding: 26px 30px;">
          <p style="font-size: 15px; color: #F1F5F9; margin-top: 0;">
            A new user has just registered an account on <strong>IzzoEvents</strong>:
          </p>

          <div style="background-color: #1E2738; border-radius: 12px; padding: 18px; margin: 18px 0; border: 1px solid #2B384E;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold; width: 35%;">👤 Full Name:</td>
                <td style="padding: 6px 0; color: #FFFFFF; font-weight: bold;">${user.name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">✉️ Email:</td>
                <td style="padding: 6px 0; color: #38BDF8;">${user.email}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">🛡️ Assigned Role:</td>
                <td style="padding: 6px 0; color: #D8B26E; font-weight: bold;">${user.role || 'User'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">⏰ Signed Up:</td>
                <td style="padding: 6px 0; color: #94A3B8;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <p style="color: #94A3B8; font-size: 13px; text-align: center; margin-top: 20px;">
            Manage platform users at <a href="https://izzoevents.com/dashboard" style="color: #D8B26E; text-decoration: none; font-weight: bold;">izzoevents.com/dashboard</a>.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"IzzoEvents Alerts" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject: `👤 New User Joined IzzoEvents: ${user.name} (${user.email})`,
      html: htmlContent
    });

    console.log(`[Mailer] New user signup alert sent to admin: ${adminEmail}`);
  } catch (err) {
    console.error('[Mailer] Error sending new user notification:', err.message);
  }
}

/**
 * Sends Password Reset Code & Link to the User
 */
async function sendPasswordResetEmail(user, resetCode, resetUrl) {
  try {
    const transporter = getTransporter();
    if (!transporter) return;

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #161E2C; color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #2B384E;">
        <div style="background-color: #1E2738; padding: 24px 30px; border-bottom: 2px solid #D8B26E; text-align: center;">
          <h1 style="color: #D8B26E; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 1px;">IZZOEVENTS</h1>
          <p style="color: #94A3B8; margin: 6px 0 0 0; font-size: 13px;">Password Reset Request</p>
        </div>
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #F1F5F9; margin-top: 0;">Hi <strong>${user.name || 'there'}</strong>,</p>
          <p style="color: #CBD5E1; line-height: 1.6;">We received a request to reset the password for your IzzoEvents account (<strong>${user.email}</strong>).</p>
          
          <div style="background-color: #1E2738; border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid #2B384E; text-align: center;">
            <p style="color: #94A3B8; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; margin-top: 0;">Your Verification Reset Code</p>
            <div style="font-size: 32px; font-weight: 900; letter-spacing: 6px; color: #D8B26E; margin: 10px 0; font-family: monospace;">
              ${resetCode}
            </div>
            <p style="color: #64748B; font-size: 12px; margin-bottom: 0;">This code will expire in 1 hour.</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #D8B26E; color: #161E2C; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 900; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(216, 178, 110, 0.4);">
              Reset Password Online
            </a>
          </div>

          <p style="color: #94A3B8; font-size: 13px; line-height: 1.5; margin-top: 24px;">
            If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>
        <div style="background-color: #121824; padding: 16px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #232F42;">
          © ${new Date().getFullYear()} IzzoEvents • Kigali, Rwanda
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"IzzoEvents Security" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `🔑 IzzoEvents Password Reset Code: ${resetCode}`,
      html: htmlContent
    });

    console.log(`[Mailer] Password reset email sent to: ${user.email}`);
  } catch (err) {
    console.error('[Mailer] Error sending password reset email:', err.message);
  }
}

/**
 * Sends notification to Admin when a user submits a message via the Contact Us form
 */
async function notifyNewContactMessage(contact) {
  try {
    const transporter = getTransporter();
    if (!transporter) return;

    const adminEmail = await getAdminNotificationEmail();
    if (!adminEmail) return;

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #161E2C; color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #2B384E;">
        <div style="background-color: #1E2738; padding: 20px 30px; border-bottom: 2px solid #D8B26E;">
          <h2 style="color: #D8B26E; margin: 0; font-size: 20px; font-weight: 900;">📬 NEW CONTACT INQUIRY</h2>
          <p style="color: #94A3B8; margin: 4px 0 0 0; font-size: 13px;">IzzoEvents Platform Notification</p>
        </div>
        <div style="padding: 26px 30px;">
          <p style="font-size: 15px; color: #F1F5F9; margin-top: 0;">
            A user has sent an inquiry via the <strong>Contact Us</strong> form on IzzoEvents:
          </p>

          <div style="background-color: #1E2738; border-radius: 12px; padding: 18px; margin: 18px 0; border: 1px solid #2B384E;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold; width: 35%;">👤 Sender Name:</td>
                <td style="padding: 6px 0; color: #FFFFFF; font-weight: bold;">${contact.name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">✉️ Email Address:</td>
                <td style="padding: 6px 0; color: #38BDF8;"><a href="mailto:${contact.email}" style="color: #38BDF8; text-decoration: none;">${contact.email}</a></td>
              </tr>
              ${contact.phone ? `
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">📞 Phone / MoMo:</td>
                <td style="padding: 6px 0; color: #CBD5E1;">${contact.phone}</td>
              </tr>` : ''}
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">🏷️ Category:</td>
                <td style="padding: 6px 0; color: #D8B26E; font-weight: bold;">${contact.category}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">📌 Subject:</td>
                <td style="padding: 6px 0; color: #FFFFFF; font-weight: bold;">${contact.subject}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #94A3B8; font-weight: bold;">⏰ Received:</td>
                <td style="padding: 6px 0; color: #94A3B8;">${new Date(contact.createdAt || Date.now()).toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <div style="background-color: #0F1622; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #D8B26E;">
            <p style="color: #94A3B8; font-size: 12px; font-weight: bold; text-transform: uppercase; margin: 0 0 8px 0;">Message Content:</p>
            <p style="color: #F8FAFC; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${contact.message}</p>
          </div>

          <div style="text-align: center; margin: 24px 0 10px 0;">
            <a href="https://izzoevents.com/dashboard" style="background-color: #D8B26E; color: #161E2C; padding: 12px 28px; border-radius: 12px; text-decoration: none; font-weight: 900; font-size: 14px; display: inline-block;">
              View & Reply in Dashboard
            </a>
          </div>
        </div>
        <div style="background-color: #121824; padding: 16px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #232F42;">
          © ${new Date().getFullYear()} IzzoEvents • Kigali, Rwanda
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"IzzoEvents Inquiries" <${process.env.SMTP_USER}>`,
      to: adminEmail,
      replyTo: contact.email,
      subject: `📬 [${contact.category}] New Message from ${contact.name}: "${contact.subject}"`,
      html: htmlContent
    });

    console.log(`[Mailer] Contact inquiry notification sent to admin: ${adminEmail}`);
  } catch (err) {
    console.error('[Mailer] Error sending contact notification to admin:', err.message);
  }
}

/**
 * Sends an email reply to a user's inquiry directly from the admin dashboard
 */
async function sendContactReplyEmail(userEmail, userName, originalSubject, replyText) {
  try {
    const transporter = getTransporter();
    if (!transporter) return;

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #161E2C; color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #2B384E;">
        <div style="background-color: #1E2738; padding: 24px 30px; border-bottom: 2px solid #D8B26E; text-align: center;">
          <h1 style="color: #D8B26E; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 1px;">IZZOEVENTS</h1>
          <p style="color: #94A3B8; margin: 6px 0 0 0; font-size: 13px;">Customer Support & Inquiries</p>
        </div>
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #F1F5F9; margin-top: 0;">Hi <strong>${userName || 'there'}</strong>,</p>
          <p style="color: #CBD5E1; line-height: 1.6;">
            Thank you for reaching out to <strong>IzzoEvents</strong> regarding "<em>${originalSubject}</em>". Below is the response from our team:
          </p>

          <div style="background-color: #1E2738; border-radius: 12px; padding: 22px; margin: 24px 0; border: 1px solid #2B384E; border-left: 4px solid #D8B26E;">
            <p style="color: #FFFFFF; font-size: 15px; line-height: 1.7; margin: 0; white-space: pre-wrap;">${replyText}</p>
          </div>

          <p style="color: #94A3B8; font-size: 13px; line-height: 1.5; margin-top: 24px;">
            If you have any further questions, feel free to reply directly to this email or visit <a href="https://izzoevents.com/contact" style="color: #D8B26E; text-decoration: none;">izzoevents.com/contact</a>.
          </p>
        </div>
        <div style="background-color: #121824; padding: 16px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #232F42;">
          © ${new Date().getFullYear()} IzzoEvents • Kigali, Rwanda
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"IzzoEvents Support" <${process.env.SMTP_USER}>`,
      to: userEmail,
      subject: `Re: ${originalSubject} - IzzoEvents Support`,
      html: htmlContent
    });

    console.log(`[Mailer] Reply email sent to user: ${userEmail}`);
  } catch (err) {
    console.error('[Mailer] Error sending contact reply email:', err.message);
    throw err;
  }
}

module.exports = {
  sendTicketEmail,
  notifyNewRegistration,
  notifyNewUserSignup,
  sendPasswordResetEmail,
  notifyNewContactMessage,
  sendContactReplyEmail,
  getAdminNotificationEmail
};
