# Despliegue a producción — CRM B2B

Guía práctica para publicar el frontend y dejar Supabase listo en un entorno real.

## Arquitectura

| Componente | Dónde se hospeda | Notas |
|------------|------------------|--------|
| Base de datos, Auth, Storage, Edge Functions | **Supabase** (proyecto en la nube) | [supabase.com](https://supabase.com) |
| Interfaz React (Vite) | **Vercel**, Netlify, Cloudflare Pages o servidor estático | Build estático `npm run build` → carpeta `dist/` |

No hay backend propio aparte de las Edge Functions de Supabase.

---

## 1. Supabase (backend)

### 1.1 Proyecto

1. Crear proyecto en Supabase (región cercana a sus usuarios, p. ej. São Paulo).
2. Anotar **URL del proyecto** y **anon public key** (Settings → API).

### 1.2 SQL (esquema)

En **SQL Editor**, ejecutar los scripts de `supabase/sql/` en un orden razonable:

- Esquema base del CRM (empresas, cotizaciones, productos, etc.) según lo que ya tenga el proyecto.
- Migraciones recientes que use la app, por ejemplo:
  - `commercial_followups.sql` (+ `commercial_followups_importance.sql`, `commercial_followups_next_channel.sql` si aplica)
  - `sii_documents.sql`
  - `sii_remove_baseapi.sql` (si venía de BaseAPI)
  - `crm_app_settings.sql`, `crm_branding_storage.sql`
  - Políticas RLS: `profiles_super_admin_update.sql`, etc.

Revise `schema.txt` o el historial de migraciones del repo para no omitir tablas críticas.

### 1.3 Storage

Crear buckets indicados en los SQL (p. ej. `company-documents`, `crm-branding`) y políticas de acceso.

### 1.4 Edge Functions

Desde la máquina de desarrollo, con [Supabase CLI](https://supabase.com/docs/guides/cli) enlazada al proyecto:

```bash
supabase link --project-ref SU_PROJECT_REF
supabase functions deploy invite-user
supabase functions deploy sii-connection
supabase functions deploy sii-import
```

**Ya no se usa** `sii-sync` (BaseAPI eliminado). Si estaba desplegada, puede ignorarla o borrarla del panel.

Secretos en **Project Settings → Edge Functions → Secrets**:

| Secreto | Uso |
|---------|-----|
| `SITE_URL` | URL pública del CRM (invitaciones por correo), p. ej. `https://crm.su-dominio.cl` |
| `SII_SECRETS_KEY` | Solo si en el futuro guardan secretos SII cifrados (16+ caracteres); con importación por archivo no es obligatorio para operar |

No configure `SII_BASEAPI_KEY` si no usa BaseAPI.

### 1.5 Auth

En **Authentication → URL Configuration**:

- **Site URL**: `https://crm.su-dominio.cl`
- **Redirect URLs**: misma URL + rutas de recuperación de contraseña (`/auth/reset-password`, etc.)

Crear el primer usuario **super_admin** (registro o panel Auth) y fila en `public.profiles` con rol `super_admin`.

---

## 2. Frontend (Vite)

### 2.1 Variables de entorno

En el hosting (Vercel/Netlify) o en `.env.production` local para probar el build:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
```

Solo claves **anon** en el frontend. Nunca la **service_role** en el navegador.

### 2.2 Build local de verificación

```bash
npm ci
npm run build
npm run preview
```

Abrir la URL de preview y probar login y una ruta crítica (empresas, agenda).

### 2.3 Publicar en Vercel (ejemplo)

1. Conectar el repositorio Git en [vercel.com](https://vercel.com).
2. Framework preset: **Vite**.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Añadir las variables `VITE_SUPABASE_*`.
6. Dominio personalizado (opcional): DNS CNAME hacia Vercel.

Alternativas equivalentes: **Netlify** (`dist`, redirect SPA en `_redirects` o `netlify.toml`), **Cloudflare Pages**.

### 2.4 SPA (rutas del router)

Todas las rutas deben devolver `index.html` (fallback). En Vercel suele bastar con un proyecto Vite; si hace falta, `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 3. Checklist antes de abrir a usuarios

- [ ] SQL y RLS aplicados en producción (no solo en desarrollo).
- [ ] Edge Functions desplegadas (`invite-user`, `sii-connection`, `sii-import`).
- [ ] `SITE_URL` apunta al dominio real del CRM.
- [ ] Redirect URLs de Auth actualizadas.
- [ ] Variables `VITE_*` en el hosting de producción.
- [ ] Al menos un `super_admin` activo en `profiles`.
- [ ] Prueba: login, crear empresa, cotización, agenda, importar Excel (admin), libro de banco / SII si los usa.
- [ ] Backup: activar backups automáticos en Supabase (plan según necesidad).

---

## 4. Actualizaciones posteriores

1. Cambios en código → push a Git → el hosting reconstruye el frontend.
2. Cambios en SQL → ejecutar solo el script nuevo en SQL Editor (o migraciones con CLI).
3. Cambios en Edge Functions → `supabase functions deploy nombre-funcion`.
4. Invalidar caché del navegador o versión en build si cambian assets críticos.

---

## 5. Dónde hacer cada cosa (resumen)

| Tarea | Dónde |
|-------|--------|
| Tablas, triggers, RLS | Supabase → SQL Editor |
| Usuarios y correos de acceso | Supabase → Authentication |
| Archivos (documentos, logo) | Supabase → Storage |
| Funciones servidor (invitar, SII) | Supabase → Edge Functions (+ CLI deploy) |
| App web que ven los usuarios | Vercel / Netlify / Cloudflare Pages |
| Dominio `crm.empresa.cl` | DNS de su proveedor → hosting elegido |

Si necesita entorno de **staging**, repita el mismo flujo con un segundo proyecto Supabase y un segundo sitio en Vercel (rama `develop` o preview deployments).
