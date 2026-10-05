# Publicar Ramé Sushi en GitHub

La base de datos Ramé (`ngqyxevyrfkdyuatklnl`) ya fue actualizada el 5 de octubre de 2026. Sus 72 productos se conservaron. Los dos proyectos Vercel existentes están conectados a la rama `main` del repositorio y se despliegan al recibir un cambio allí.

## Lo único que debes subir

1. Descarga y **descomprime** `Rame-Sushi-Subir-a-GitHub.zip`.
2. Abre la carpeta `SUBIR-A-GITHUB` que aparece dentro. Selecciona **todo su contenido**, incluidos los archivos de las subcarpetas. No arrastres el ZIP ni la carpeta contenedora.
3. Ve a [Subir archivos a la rama main](https://github.com/cagonzalezlagos-blip/rame-sushi-smart/upload/main). Arrastra allí la selección. Deben quedar en la raíz archivos como `index.html`, `src.js`, `package.json` y carpetas como `migrations` y `print-agent`.
4. Si GitHub indica que un archivo ya existe, acepta reemplazarlo por esta versión. Escribe un mensaje como `Actualizar Ramé Sushi` y pulsa **Commit changes** en `main`.
5. Espera a que Vercel termine el despliegue. Revisa la dirección que usas habitualmente: [rame-sushi-smart.vercel.app](https://rame-sushi-smart.vercel.app) o [rame-sushi-smart-01.vercel.app](https://rame-sushi-smart-01.vercel.app). Ambos proyectos están vinculados al repositorio.

No hace falta volver a ejecutar `MIGRACION-COMPLETA-RAME.sql`. La configuración pública de conexión a Ramé ya está en el archivo `.env.production` del repositorio actual; no aparece en la carpeta de subida porque no debe reemplazarse. Nunca subas una clave `service_role` ni el archivo privado `print-agent/.env`.

## Comprobación inicial

Entra con la cuenta administradora y comprueba que aparecen los 72 productos. Crea un pedido de prueba, confirma la comanda y revisa la caja. Prueba por separado las cuentas de cajera, personal y reparto. El repartidor debe marcar entrada, tener un pedido activo, abrir la aplicación y aceptar el permiso de ubicación para compartir posición; los kilómetros son aproximados. Google Maps abre la ruta de entrega.

La comanda manual se imprime desde el navegador. La impresión automática en la impresora del local requiere instalar `print-agent` en el computador de caja según `print-agent/INSTALAR-WINDOWS.txt`; esa instalación local **sí** es una tarea aparte.

PedidosYa y Uber Eats se registran como canales manuales. Las remuneraciones son estimaciones y el flujo de caja muestra lo que se registró, sin calcular impuestos o comisiones.

Si GitHub o Vercel muestra un error, conserva el texto o una captura para poder corregirlo. No vuelvas a ejecutar la migración por un problema de publicación.
