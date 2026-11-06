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
    subject: "Your Freemail verification code",
    text: `Your Freemail verification code is ${otp}. It expires in 5 minutes.`,
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
    subject: "Your Freemail sign-in code",
    text: `Your Freemail sign-in code is ${otp}. It expires in 5 minutes. If you did not request this, you can ignore this email.`,
  });
}
