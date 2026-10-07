# Ramé Sushi: logística e historial de clientes

## Actualizar la app

Este paquete reemplaza **Rame-Sushi-Mejoras-GitHub.zip**: contiene las mejoras anteriores y las nuevas funciones de logística e historial. Descomprime **Rame-Sushi-Logistica-y-Fidelizacion-GitHub.zip** y sube sus archivos y subcarpetas al directorio principal de `cagonzalezlagos-blip/rame-sushi-smart`. Confirma los cambios y espera el despliegue de Vercel. Incluye `tracking.html`, `tracking.js` y `vite.config.js`: son necesarios para el seguimiento del cliente.

Las migraciones de Supabase están aplicadas. Los SQL son respaldo: no debes ejecutarlos nuevamente. No se crearon zonas reales ni se cambiaron las tarifas actuales del local.

La actualización de impresión del computador sigue siendo **Rame-Sushi-Actualizar-Impresion-PC.zip**. Si todavía no la instalaste, sigue las instrucciones de `MEJORAS-RAME-2026-10-06.md`. Estas nuevas funciones no requieren otra actualización del agente.

## Zonas y costos

Administración dispone del menú **Zonas de reparto**. Puede dibujar un polígono con clics en el mapa, deshacer puntos, editarlo o desactivarlo. También puede crear una tarifa por comuna. Debe configurar los límites y valores acordados por el local.

Al calcular un delivery con domicilio confirmado:

1. Se usa el precio de un polígono activo que contenga el punto, incluidos sus bordes.
2. Si no coincide un polígono, se usa la tarifa de la comuna seleccionada.
3. Si tampoco coincide la comuna, se conserva el precio por distancia configurado.

Entre polígonos superpuestos gana el menor valor de prioridad; los empates se resuelven por el identificador de la zona. Usa prioridades distintas cuando haya superposición. Se cobra una sola tarifa de despacho, no la suma de zona y distancia. El pago al repartidor sigue siendo independiente y se calcula por distancia. La tarifa manual sigue disponible si falla la ubicación o el cálculo de ruta.

La app reconoce comunas frecuentes escritas en el domicilio, con o sin tildes, y selecciona la comuna correspondiente. Revisa la comuna y confirma el punto antes de calcular. Los mapas no garantizan encontrar cada domicilio; la confirmación evita enviar al repartidor a una ubicación aproximada sin revisar.

Si administración cambia una zona mientras existe un cálculo pendiente, se debe recalcular antes de registrar. Los pedidos ya registrados conservan su tarifa.

## Asignación de repartidores

**Repartidores** está disponible para administración y caja. El panel muestra pedidos listos para despacho, salsas y palitos, fecha agendada, jornadas abiertas y cantidad de pedidos activos por repartidor. Elige un repartidor y pulsa **Asignar pedido**. Aparece en su pantalla **Repartos**.

La asignación solo admite repartidores activos y pedidos listos, sin asignación previa. La jornada abierta es una señal de disponibilidad; no bloquea una asignación expresamente elegida. La lista se actualiza cada 20 segundos conservando la selección. El reporte de pagos y ubicación del administrador se actualiza con su botón Actualizar.

## Seguimiento por WhatsApp

En **Pedidos**, el botón WhatsApp prepara un mensaje con un enlace; en **Repartidores**, usa **Compartir seguimiento**. WhatsApp se abre y la persona revisa y envía el mensaje. No hay envío automático ni recepción automática de mensajes conectada.

El comprador puede abrir el enlace sin iniciar sesión y ver **En cocina → Empacando → En camino**, además de entrega, cancelación o retiro según corresponda. Consulta el estado cada 20 segundos; refleja los cambios registrados por el local y el repartidor. No muestra GPS en vivo, dirección, teléfono, nombre del cliente ni detalles de pago. El enlace individual vence a los siete días; el local puede generar otro desde el pedido.

## Repetir el pedido habitual

En Caja, ingresa el teléfono y sal del campo. **Historial / repetir pedido** muestra los últimos diez pedidos no cancelados de ese cliente. Se propone el más reciente y se pueden revisar los anteriores. Selecciona los productos y pulsa **Crear borrador de este pedido**.

El borrador recupera nombre, teléfono, domicilio, cantidades y preparación de los productos seleccionados. Usa precios y opciones del catálogo actual. Un producto retirado o con opciones ambiguas, eliminadas o nuevas obligatorias no se copia silenciosamente: se indica que hay que configurarlo desde la carta. El pedido actual permanece en otro borrador. No se imprime ni se cobra hasta registrar el nuevo pedido. Debes revisar despacho, regalos, fecha y medio de pago conforme al flujo normal.

## Validación

41 pruebas automatizadas y compilación de producción aprobadas. Pruebas de interfaz con servicios simulados en pantalla de 390 px: dibujo y guardado de polígonos, tarifa por comuna, repetición con precios actuales sin registrar automáticamente, cálculo de zona, asignación y seguimiento público. También se verificaron nuevamente los flujos anteriores.

Pruebas transaccionales en Supabase, revertidas al finalizar: polígonos y bordes, prioridad, comuna, tarifa por distancia, cambios de tarifa pendientes, registro de pedido con zona, historial, asignación, bloqueo de doble asignación, enlace individual, vencimiento y permisos de caja/trabajadores/clientes sin sesión. No quedaron pedidos de prueba.

La revisión de permisos mantiene RLS en las tablas nuevas. El seguimiento es una función pública deliberada, protegida por un enlace aleatorio individual y limitado a datos de estado. Referencias del asesor: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable y https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.
