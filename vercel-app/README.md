# JKD Legacy — App de producción (Vercel)

Despliegue serverless del sitio + CRM. **Root Directory en Vercel: `vercel-app`**.

## Variables de entorno requeridas
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — base Turso
- `RESEND_API_KEY`, `MAIL_FROM` — envío de correo (magic link + notificación de leads)
- `ADMIN_EMAIL` — buzón admin donde llega el magic link

La BD se inicializa sola en el primer arranque.
