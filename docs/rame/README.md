# Ramé Sushi Smart — operación integrada

Esta rama reúne el POS de Ramé Sushi, el armador guiado de productos, disponibilidad, caja, reparto y la asistencia con GPS + QR. **Es una versión de prueba; la sucursal existente sigue sin cambios hasta aprobar y aplicar la migración.** El proyecto Supabase exclusivo es `ngqyxevyrfkdyuatklnl`.

## Roles y nuevas pantallas

| Perfil | Pantallas |
| --- | --- |
| Administrador | Resumen, caja, pedidos, proveedores, personal, repartidores, configuración y asistencia. |
| Cajera | POS, pedidos, clientes, caja, disponibilidad, personal y asistencia. Puede ver jornadas, sin editar perfiles ni tarifas. |
| Repartidor | Entregas asignadas, ruta en Google Maps y asistencia. Puede compartir ubicación solo durante entregas activas y con la app abierta. |
| Personal | Asistencia y sus jornadas con una estimación referencial de remuneración. |

El resumen muestra ventas cobradas agrupadas por canal (local, PedidosYa, Uber Eats), medio de pago, otros movimientos de caja y pagos registrados a proveedores. Permite descargar CSV. El flujo neto se calcula con los movimientos efectivos de la fecha seleccionada; `record_order_payment` guarda `cash_movements.order_id`, por lo que el cobro de cada pedido se cuenta una vez. Los proveedores se cuentan una vez aunque también generen movimiento de caja. No calcula comisiones de plataformas, impuestos, devoluciones ni pagos mixtos, y no equivale a conciliación bancaria.

La distancia del repartidor se estima por posiciones GPS enviadas con su permiso. Descarta puntos de baja precisión, saltos y pausas de conexión; no equivale a un odómetro ni garantiza el trayecto real. La ubicación exacta se borra al terminar la jornada, conservando los kilómetros estimados. Si el teléfono cierra la app o quita el permiso, no habrá seguimiento. El enlace de ruta usa Google Maps, que calcula la ruta según sus propias condiciones actuales.

## Probar el frontend

```bash
npm ci
npm run build
node --test tests/*.test.js
npm run dev
```

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` como variables públicas del frontend. Nunca uses una clave `service_role` en el navegador. El código funciona con HTTPS para cámara y geolocalización; en desarrollo `localhost` también es un contexto seguro.

## Publicar conjuntamente después de la revisión

1. Respaldar esquema, datos, usuarios y código del proyecto Ramé Sushi. No tocar otros proyectos.
2. Aplicar `migrations/20260928_operations.sql`, `migrations/20261005_business_config.sql` y `migrations/20261005_19_rame_management.sql` **en ese orden a un entorno de prueba** con la misma estructura. Comprobar sus tipos, permisos y funciones, ejecutar pedidos, pagos, reportes, marcaciones y posiciones de prueba. Aplicar a la base real antes de publicar este frontend.
3. Configurar en **Configuración** las coordenadas del acceso físico de El Nath 972, Villa Alemana. GPS y QR son ambos obligatorios, con precisión máxima de 50 m, radio inicial de 75 m y QR con vida de 5 minutos. El GPS puede ser suplantado; el sistema registra intentos y permite corrección autorizada con motivo.
4. Confirmar precios de extras según la carta vigente y cargar tramos de `delivery_zones` reales. El servidor rechaza un costo de reparto que no coincida con una tarifa activa.
5. Crear las cuentas en Supabase Authentication y habilitarlas desde **Personal** con sus ID y tarifas de referencia. No habilitar el registro público. Probar con dueña, caja, trabajador y repartidor en teléfonos distintos.
6. Probar compra personalizada y mixta, canales de venta, estados, cobro, pagos a proveedores, apertura y cierre de caja, asignación y entrega, GPS en marcha, WhatsApp manual, lector QR y comanda en la impresora real. Comparar el reporte con movimientos reales y revisar que no se dupliquen pagos.
7. Sólo tras aprobación, integrar esta rama a `main` y desplegar en el proyecto Vercel del enlace actual. Mantener copias para revertir código y base de datos.

## Alcance y pendientes verificables

El QR se genera en **Asistencia** con sesión de dueña. El cajero toma pedidos con opciones paso a paso y puede marcar faltantes; los precios se cargan de Supabase y el servidor recalcula el pedido. La ubicación exacta, tarifas y usuarios requieren configuración del local.

La creación de identidades de acceso sigue en el panel de Supabase; la app administra los perfiles ya creados. WhatsApp abre un mensaje para envío manual: los envíos automáticos necesitan la plataforma y plantillas oficiales. El cierre no implementa devoluciones ni pagos mixtos. El cálculo de remuneraciones es sólo estimativo. El cálculo de despacho sigue basado en el tramo elegido por caja y requiere validación humana de la dirección. La impresora térmica necesita pruebas con el agente Windows y el equipo conectado antes de operar.
