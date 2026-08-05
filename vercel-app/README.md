# JKD Legacy — App de producción (Vercel)

Despliegue serverless del sitio + CRM. **Root Directory en Vercel: `vercel-app`**.

## Variables de entorno requeridas
- `TURSO_DATABASE_URL` — URL libsql:// de la base Turso
- `TURSO_AUTH_TOKEN` — token de la base Turso
- `RESEND_API_KEY` — API key de Resend (envío del magic link)
- `MAIL_FROM` — remitente, p. ej. `JKD Legacy <no-reply@jkdlegacy.com.au>` (o `onboarding@resend.dev` para probar)
- `APP_URL` — URL pública del sitio (p. ej. `https://jkdlegacy.com.au`)

La BD se inicializa sola (crea tablas + siembra usuarios admin/comercial) en el primer arranque.
