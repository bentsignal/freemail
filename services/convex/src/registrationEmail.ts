import { sendTextEmail } from "./providers/hosted/aws";

interface SendCodeEmailOptions {
  from: string;
  otp: string;
  to: string;
}

export async function sendRegistrationEmail({
  from,
  otp,
  to,
}: SendCodeEmailOptions) {
  await sendTextEmail({
    from,
    to,
    subject: "Your Rodge Mail verification code",
    text: `Your Rodge Mail verification code is ${otp}. It expires in 5 minutes.`,
  });
}

export async function sendRecoveryEmail({
  from,
  otp,
  to,
}: SendCodeEmailOptions) {
  await sendTextEmail({
    from,
    to,
    subject: "Your Rodge Mail sign-in code",
    text: `Your Rodge Mail sign-in code is ${otp}. It expires in 5 minutes. If you did not request this, you can ignore this email.`,
  });
}
