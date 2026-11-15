# Control Termales

Sistema de gestión de incidencias de **Soda** y **Termales**.

## Versiones publicadas

- **Versión real:** https://control-termales.vercel.app
- **Demostración (conservar):** https://control-termales-demo.vercel.app

Son dos proyectos distintos en Vercel. No eliminar ni reemplazar la demostración al publicar cambios en producción.

## Organización del código

| Ruta | Contenido |
|---|---|
| `index.html` | Código actual de la demostración, con datos en localStorage |
| `production/index.html` | Código de la versión real, conectado con Supabase Auth y tablas de producción |
| `backups/control-termales-v1.html` | Respaldo de una versión anterior de la demo |
| `database/migrations/` | Migraciones SQL aplicadas a Supabase para Control Termales |
| `supabase/functions/termales-invite-user/index.ts` | Función de invitación de usuarios mediante Supabase Auth |
| `.gitignore` | Exclusiones de archivos locales y credenciales |

## Infraestructura

- **Repositorio:** `keycr91/control-termales`
- **Vercel real:** proyecto `control-termales`
- **Vercel demo:** proyecto `control-termales-demo`
- **Supabase:** proyecto existente `Control de Marchamos`, ref `noefngunaymgdtxfvxrt`
- **Tablas de la nueva aplicación:** prefijo `termales_`; tienen políticas RLS independientes.
- **Autenticación:** Supabase Auth compartido con Marchamos. Cambiar una contraseña afecta el acceso a ambos sistemas.
- **Cuenta inicial:** usuario `admin` vinculado al correo de propietario verificado; perfil `super`.

## Cómo mantener el sistema

1. Cambiar el código en la ruta que corresponda (`index.html` para demo o `production/index.html` para real).
2. Crear commit de GitHub con descripción del cambio.
3. Publicar la ruta elegida en el proyecto correcto de Vercel.
4. Verificar la URL publicada, la sesión y los permisos.
5. Toda modificación de base de datos debe quedar registrada como migración SQL en `database/migrations/` y aplicarse en Supabase.

No subir claves de servicio (`service_role`), contraseñas, tokens privados ni respaldos de datos personales al repositorio.

## Estado de pruebas

La versión real está desplegada y se verificó que sirve el HTML correspondiente. **Pendiente:** probar en un navegador el inicio de sesión, operaciones del CRUD, cambio y recuperación de contraseña, invitación de usuarios y controles de permisos de extremo a extremo. No considerar esto una certificación de seguridad de producción.

## Respaldo y recuperación

GitHub conserva historial de versiones del código y migraciones. **El código versionado no sustituye un respaldo periódico de la base de datos y del contenido de Supabase Auth**. Programar respaldos de datos y probar su restauración antes de operar con datos críticos.
