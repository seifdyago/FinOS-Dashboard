export class PasswordResetDeliveryNotConfiguredError extends Error {
  constructor() {
    super("Password reset email delivery is not configured.");
    this.name = "PasswordResetDeliveryNotConfiguredError";
  }
}

export async function sendPasswordResetCode(input: {
  email: string;
  code: string;
  expiresAt: Date;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.FINOS_PASSWORD_RESET_FROM?.trim();

  if (!apiKey || !from) {
    throw new PasswordResetDeliveryNotConfiguredError();
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Your FinOS password reset code",
      text: [
        `Your FinOS verification code is ${input.code}.`,
        `It expires in 10 minutes at ${input.expiresAt.toISOString()}.`,
        "If you did not request this code, you can ignore this email.",
      ].join("\n\n"),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Password reset email delivery failed (${response.status}).`);
  }
}