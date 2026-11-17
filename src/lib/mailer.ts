type SendEmailInput = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string;
};

export async function sendMail(input: SendEmailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const mailpitBase = (process.env.MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/+$/, "");
  const endpoint = `${mailpitBase}/api/v1/send`;

  const payload = {
    From: {
      Email: process.env.MAIL_FROM_EMAIL ?? "no-reply@escom.ipn.mx",
      Name: process.env.MAIL_FROM_NAME ?? "Plataforma ESCOM",
    },
    To: [
      {
        Email: input.toEmail,
        Name: input.toName || input.toEmail,
      },
    ],
    Subject: input.subject,
    Text: input.text,
    HTML: input.html ?? `<pre style="font-family:sans-serif;white-space:pre-wrap;">${input.text}</pre>`,
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `No se pudo enviar el correo al servidor local (${response.status}${detail ? `: ${detail}` : ""}).`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "No se pudo conectar con Mailpit para enviar el correo al profesor coordinador.",
    };
  }
}
