const nodemailer = require('nodemailer');
const { getConfig } = require('../config');

// Create email transporter
const createTransporter = () => {
  const config = getConfig();
  
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
      user: config.email.auth.user,
      pass: config.email.auth.pass
    }
  });
};

// Send email verification
const sendVerificationEmail = async (email, token, name) => {
  try {
    const transporter = createTransporter();
    const config = getConfig();
    
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
    
    const mailOptions = {
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to: email,
      subject: 'Email Verification - PlusFive',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">PlusFive</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello ${name || 'User'}!</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              Thank you for registering with PlusFive. Please verify your email address by clicking the button below:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 12px 30px; 
                        text-decoration: none; 
                        border-radius: 5px; 
                        display: inline-block;
                        font-weight: bold;">
                Verify Email Address
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
              If the button doesn't work, you can copy and paste this link into your browser:
            </p>
            
            <p style="color: #667eea; word-break: break-all; margin-bottom: 25px;">
              ${verificationUrl}
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
              This link will expire in 24 hours for security reasons.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              If you didn't create an account with PlusFive, please ignore this email.
            </p>
          </div>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    throw error;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, token, name) => {
  try {
    const transporter = createTransporter();
    const config = getConfig();
    
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    
    const mailOptions = {
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to: email,
      subject: 'Password Reset Request - PlusFive',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">PlusFive</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello ${name || 'User'}!</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              We received a request to reset your password. Click the button below to create a new password:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 12px 30px; 
                        text-decoration: none; 
                        border-radius: 5px; 
                        display: inline-block;
                        font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
              If the button doesn't work, you can copy and paste this link into your browser:
            </p>
            
            <p style="color: #667eea; word-break: break-all; margin-bottom: 25px;">
              ${resetUrl}
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
              This link will expire in 1 hour for security reasons.
            </p>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
              If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              For security reasons, this link will expire in 1 hour.
            </p>
          </div>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw error;
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter();
    const config = getConfig();
    
    const mailOptions = {
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to: email,
      subject: 'Welcome to PlusFive!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">PlusFive</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Welcome to PlusFive, ${name || 'User'}!</h2>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
              Thank you for joining PlusFive! Your account has been successfully created and verified.
            </p>
            
            <div style="background: #e8f4fd; padding: 20px; border-radius: 5px; margin: 25px 0;">
              <h3 style="color: #333; margin-top: 0;">What's Next?</h3>
              <ul style="color: #666; line-height: 1.6;">
                <li>Complete your profile information</li>
                <li>Explore our features and services</li>
                <li>Set up your business preferences</li>
                <li>Start using our platform</li>
              </ul>
            </div>
            
            <p style="color: #666; line-height: 1.6; margin-bottom: 15px;">
              If you have any questions or need assistance, feel free to contact our support team.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            
            <p style="color: #999; font-size: 12px; text-align: center;">
              Thank you for choosing PlusFive!
            </p>
          </div>
        </div>
      `
    };
    
    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    throw error;
  }
};

// Generic email sending function
const sendEmail = async (emailData) => {
  try {
    const transporter = createTransporter();
    const config = getConfig();
    
    const mailOptions = {
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html
    };
    
    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
};

// Send usage report email
const sendUsageReportEmail = async (userEmail, messageCount) => {
  try {
    const currentMonth = new Date().toLocaleString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });

    const emailData = {
      to: userEmail,
      subject: `Monthly Usage Report - ${currentMonth}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Monthly Usage Report</h2>
          <p>Hello,</p>
          <p>Here's your monthly usage report for <strong>${currentMonth}</strong>:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #007bff; margin-top: 0;">WhatsApp Messages Sent</h3>
            <p style="font-size: 24px; font-weight: bold; color: #28a745; margin: 0;">
              ${messageCount} messages
            </p>
          </div>
          
          <p>This usage will be reflected in your next billing cycle.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/app/pricing" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 12px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      display: inline-block;
                      font-weight: bold;
                      margin-right: 10px;">
              View Pricing & Upgrade
            </a>
            
            <a href="${process.env.FRONTEND_URL}/app/simple-payment?amount=${messageCount}&currency=ils&description=WhatsApp Messages Payment" 
               style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                      color: white; 
                      padding: 12px 30px; 
                      text-decoration: none; 
                      border-radius: 5px; 
                      display: inline-block;
                      font-weight: bold;">
              Pay ${messageCount}₪ Now
            </a>
          </div>
          
          <p>If you have any questions about your usage, please contact our support team.</p>
          
          <p>Best regards,<br>PlusFive Team</p>
        </div>
      `
    };

    await sendEmail(emailData);
  } catch (error) {
    console.error('Error sending usage report email:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendEmail,
  sendUsageReportEmail
}; 