type SendEmailInput = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string;
};

export async function sendMail(
  input: SendEmailInput,
): Promise<{ ok: true; channel: "resend" | "mailpit" | "in_app_only" } | { ok: false; error: string }> {
  const fromEmail = process.env.MAIL_FROM_EMAIL ?? "no-reply@escom.ipn.mx";
  const fromName = process.env.MAIL_FROM_NAME ?? "Plataforma ESCOM";

  // 1. Producción con Resend si está configurado
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [input.toEmail],
          subject: input.subject,
          text: input.text,
          html: input.html ?? `<pre style="font-family:sans-serif;white-space:pre-wrap;">${input.text}</pre>`,
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return {
          ok: false,
          error: `No se pudo enviar el correo (${response.status}${detail ? `: ${detail}` : ""}).`,
        };
      }
      return { ok: true, channel: "resend" };
    } catch {
      return { ok: false, error: "Error de conexión al enviar correo institucional." };
    }
  }

  // 2. Producción sin proveedor SMTP externo: el flujo continúa mediante notificación in-app
  const explicitMailpit = process.env.MAILPIT_URL?.trim();
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  if (isProd && !explicitMailpit) {
    return { ok: true, channel: "in_app_only" };
  }

  // 3. Entorno local con Mailpit
  const mailpitBase = (explicitMailpit || "http://127.0.0.1:54324").replace(/\/+$/, "");
  const endpoint = `${mailpitBase}/api/v1/send`;

  const payload = {
    From: { Email: fromEmail, Name: fromName },
    To: [{ Email: input.toEmail, Name: input.toName || input.toEmail }],
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
    return { ok: true, channel: "mailpit" };
  } catch {
    return {
      ok: false,
      error: "No se pudo conectar con Mailpit para enviar el correo al profesor coordinador.",
    };
  }
}
