# JKD Legacy — Backoffice / mini-CRM

Panel interno para gestionar los leads que piden información sobre JKD Legacy Academy.
Captura los registros del formulario público del sitio y los lleva por un pipeline
desde el registro hasta la matrícula.

## Funcionalidades

- **Leads registrados** — tabla con búsqueda y filtros por estado; ficha de detalle con datos editables, responsable, línea de tiempo y notas.
- **Pipeline Kanban** (arrastrar y soltar) con 4 estados:
  `Registrado → Contactado → Ganado / Perdido`.
  Al marcar **Perdido** se pide el motivo: *no responde · no vive en la zona de influencia · no tiene el presupuesto · spam · buscaba empleo*.
- **Creación de usuarios** del CRM (admin / agente), con activar/desactivar.
- **Login passwordless por enlace mágico** (sin contraseñas). En esta demo local el correo se simula y el enlace se muestra en pantalla y en la consola del servidor.
- **Estadísticas** — KPIs, evolución mensual (registrados vs. ganados vs. perdidos), tasa de conversión por mes, embudo actual y motivos de pérdida.

## Stack

Cero dependencias externas — solo Node.js integrado:
- `node:http` (servidor + API REST) · `node:sqlite` (base de datos) · `node:crypto` (tokens/sesiones)
- Frontend vanilla JS + CSS (marca JKD: tinta + azul real + latón, Fraunces/Inter/Space Mono)
- Requiere **Node 22+** (probado en Node 24, que trae `node:sqlite`).

## Un solo dominio

Este servidor sirve **todo bajo el mismo origen**:

| Ruta | Qué sirve |
|---|---|
| `/` | El sitio público (la carpeta hermana `jkd-legacy-redesign/`) |
| `/crm` | El backoffice / CRM (login + panel) |
| `/api/public/lead` · `/crm/api/public/lead` | Intake público de leads |
| `/crm/api/*` · `/crm/auth/verify` | API protegida y verificación de magic link |

Así, en local **el "dominio" es `http://localhost:8796`** y el CRM vive en `http://localhost:8796/crm`. Al desplegar, la web queda en el dominio y el CRM en `dominio/crm`.

## Uso

```bash
cd jkd-legacy-crm
npm start          # http://localhost:8796  (sitio)  ·  /crm (backoffice)
```

En el primer arranque se crea la base (`data/crm.db`) con datos de ejemplo:
4 usuarios y 34 leads repartidos en 6 meses.

**Para entrar al CRM:** abre `http://localhost:8796/crm`, escribe tu correo
(`juan.garcia@wearedatalab.co` o `admin@jkdlegacy.com.au`), pulsa *Enviar enlace mágico*
y haz clic en el enlace que aparece.

## Conexión con el sitio público

El formulario de `join-the-family.html` envía cada solicitud a `POST /api/public/lead`
(mismo origen), por lo que **todos los registros del sitio caen automáticamente en el CRM**
como estado **Registrado** (origen `website`). Importante: abre la web desde este servidor
(`http://localhost:8796/`) para que el formulario llegue al CRM.

## API (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/request` | Solicita enlace mágico |
| GET | `/auth/verify?token=` | Valida y abre sesión |
| GET | `/api/leads` `?status=&q=` | Lista de leads |
| POST | `/api/leads` | Crear lead manual |
| GET/PATCH | `/api/leads/:id` | Ficha / editar |
| PATCH | `/api/leads/:id/status` | Cambiar estado (+motivo de pérdida) |
| POST | `/api/leads/:id/note` | Añadir nota |
| GET/POST | `/api/users` | Listar / crear usuarios |
| GET | `/api/stats` | Métricas agregadas |
| POST | `/api/public/lead` | Intake público (sin auth, CORS) |
