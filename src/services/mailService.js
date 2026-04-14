const nodemailer = require('nodemailer');

const senderEmail = process.env.GMAIL_SENDER_EMAIL;
const senderPassword = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: senderEmail,
    pass: senderPassword
  }
});

async function sendVerificationCodeEmail({ to, code }) {
  if (!senderEmail || !senderPassword) {
    throw new Error('Configura GMAIL_SENDER_EMAIL y GMAIL_APP_PASSWORD en .env para enviar correos.');
  }

  await transporter.sendMail({
    from: `DataPilot MVC <${senderEmail}>`,
    to,
    subject: 'Tu codigo de verificacion - DataPilot MVC',
    html: `
      <div style="font-family: Arial, sans-serif; color: #203029;">
        <h2>Codigo de verificacion</h2>
        <p>Tu codigo para completar el registro es:</p>
        <p style="font-size: 28px; letter-spacing: 4px; font-weight: bold;">${code}</p>
        <p>Este codigo expira en 5 minutos. Despues de ese tiempo ya no sera valido.</p>
      </div>
    `
  });
}

async function sendGeneratedPasswordEmail({ to, password }) {
  if (!senderEmail || !senderPassword) {
    throw new Error('Configura GMAIL_SENDER_EMAIL y GMAIL_APP_PASSWORD en .env para enviar correos.');
  }

  await transporter.sendMail({
    from: `DataPilot MVC <${senderEmail}>`,
    to,
    subject: 'Tu cuenta fue creada - DataPilot MVC',
    html: `
      <div style="font-family: Arial, sans-serif; color: #203029;">
        <h2>Registro completado</h2>
        <p>Tu cuenta ya esta activa.</p>
        <p>Tu contrasena generada es:</p>
        <p style="font-size: 22px; font-weight: bold;">${password}</p>
        <p>Te recomendamos cambiarla desde la opcion Editar perfil despues de iniciar sesion.</p>
      </div>
    `
  });
}

module.exports = {
  sendVerificationCodeEmail,
  sendGeneratedPasswordEmail
};
