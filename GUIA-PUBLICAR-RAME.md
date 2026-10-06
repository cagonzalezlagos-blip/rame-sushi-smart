# Publicar usuarios y contraseñas en Ramé Sushi

Esta actualización parte de la carta editable que ya está publicada. El servicio de usuarios y la migración de permisos ya fueron instalados en la base de Ramé Sushi; no debes ejecutar SQL ni configurar claves secretas.

## Subir a GitHub

1. Descomprime `Rame-Sushi-Usuarios-y-Contrasenas-GitHub.zip`.
2. Abre la raíz de `cagonzalezlagos-blip/rame-sushi-smart` → **Add file → Upload files**.
3. Arrastra todos los archivos y carpetas que están **dentro** de `SUBIR-A-GITHUB`, conservando las carpetas internas. No subas el ZIP ni la carpeta contenedora como un nivel nuevo.
4. Pulsa **Commit changes** y espera la publicación automática de Vercel.
5. Abre la app y presiona **Ctrl + F5** en PC; en celular, cierra y vuelve a abrir la pestaña.

Se conserva la carta, los recargos, Excel, pedidos, caja, jornadas y demás datos. No reemplaces `.env.production`.

## Agregar personas

Ingresa como administrador → **Usuarios**. Completa nombre, correo, perfil y tarifa por hora. El perfil controla los permisos reales del servidor:

- **Administración**: control completo, usuarios, carta, reportes, proveedores y personal.
- **Cajera / caja**: caja, pedidos, clientes, disponibilidad y consulta de personal; no puede gestionar accesos.
- **Repartidor**: sus entregas, rutas y asistencia.
- **Personal**: su asistencia, jornadas y remuneración referencial.

Elige una forma de acceso:

- **Invitación por correo**: la persona abre el mensaje más reciente y crea su contraseña en la app. Supabase puede requerir SMTP propio para enviar correos a personas que no son integrantes del proyecto. Si muestra ese error, usa la alternativa siguiente o configura SMTP antes de invitar.
- **Contraseña inicial, sin enviar correo**: tú eliges una contraseña de 10 a 128 caracteres y la entregas de forma privada. La persona ingresa y puede cambiarla en **Mi cuenta**. Esta modalidad habilita la cuenta por decisión de administración, sin comprobar que la persona sea propietaria del correo; no obliga automáticamente a cambiar la contraseña inicial.

Si el correo ya tiene perfil, edita la cuenta en la lista. Si tiene cuenta de acceso pero no perfil, se habilita manteniendo la contraseña anterior. Una cuenta sin perfil activo no obtiene acceso al negocio.

## Editar permisos

En **Usuarios**, busca por nombre o correo. Modifica el perfil, nombre, tarifa y **Permitir acceso a la app**; pulsa **Guardar perfil**. No se eliminan las jornadas o pedidos al desactivar una cuenta. No puedes quitar tu propio perfil de administración ni dejar el negocio sin un administrador activo.

Los permisos se validan en el servidor inmediatamente. Las pantallas de una sesión abierta se actualizan al recargar o dentro de aproximadamente un minuto. Si otra administración modificó la misma cuenta, actualiza la lista antes de guardar. Los cambios quedan registrados en la auditoría de accesos.

## Contraseña y recuperación

Todos los perfiles tienen **Mi cuenta → Cambiar contraseña**: contraseña actual, nueva contraseña y repetición. Usa 10 caracteres o más. El cambio intenta cerrar las otras sesiones conservando el dispositivo actual.

Si no recuerdas la contraseña: pantalla de ingreso → **Olvidé mi contraseña** → correo de tu cuenta → **Enviar enlace de recuperación**. Abre el mensaje más reciente y elige la nueva contraseña en la app. Desde **Usuarios**, administración también puede solicitar el enlace para una cuenta activa. Administración no puede ver las contraseñas.

## Direcciones de los correos

En Supabase → Authentication → URL Configuration:

- **Site URL**: `https://rame-sushi-smart.vercel.app`
- **Redirect URLs**: agrega `https://rame-sushi-smart.vercel.app/` y `https://rame-sushi-smart-01.vercel.app/` si utilizas la segunda dirección.

No uses `localhost` en producción. El enlace es de un solo uso; puede vencer. Si no recibes el correo, revisa Spam, los límites del proveedor y SMTP.

## Para instalar la base en otro negocio (solo soporte técnico)

Aplica las migraciones previas y `migrations/20261006000136_account_access_management.sql`; despliega `supabase/functions/manage-access` con verificación JWT activada. La función usa las claves del servidor de Supabase: nunca se incluyen claves privilegiadas en la app. Configura el secreto `APP_URL` con la URL pública del nuevo negocio y ajusta los orígenes permitidos en `index.ts`. Configura la misma dirección en Auth y SMTP cuando corresponda.

Pruebas: `node --test tests/*.test.js`, `npm run build`; `tests/access-rpc-check.sql` debe ejecutarse en una transacción terminada en ROLLBACK, después de instalar la migración. No lo ejecutes como una operación de datos permanente.
