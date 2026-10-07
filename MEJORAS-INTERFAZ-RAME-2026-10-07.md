# Ramé Sushi — menú, pedidos, clientes y equipo

## Instalar la app web

1. Descomprimir Rame-Sushi-Menu-Clientes-y-Jornadas-GitHub.zip.
2. Subir TODOS los archivos extraídos a la raíz de cagonzalezlagos-blip/rame-sushi-smart, junto al package.json existente. Reemplazar los archivos con el mismo nombre.
3. Esperar a que termine el despliegue de Vercel y actualizar la app con Ctrl+F5.

El paquete contiene solo archivos de la app web, sin package.json ni archivos de la impresora. La migración de base de datos ya se aplicó; no debes ejecutar SQL.

## Cambios

- Botón Menú: abre un panel desde la izquierda con grupos de acordeón. También funciona en celular y se puede cerrar con Escape o al elegir un apartado.
- Caja pasa a llamarse Caja y toma de pedidos.
- Pedidos muestra por defecto la jornada de caja abierta. Si está cerrada, muestra la última jornada; si todavía no existe una jornada, usa la fecha de Santiago. Filtros de jornada, estado, pago, entrega, canal y búsqueda por nombre/teléfono/número. Se muestran 50 pedidos por página, con navegación a anteriores.
- Clientes mantiene los datos guardados al registrar/editar pedidos. Incluye búsquedas, filtros, orden por compras/último pedido/nombre, cantidades de pedidos y montos. Los totales excluyen pedidos cancelados y eliminados; Total de pedidos incluye pedidos pendientes de pago y Pagado muestra los cobrados. Se muestran 25 clientes por página y los 10 últimos pedidos en el historial.
- Lista negra: administración y cajeras pueden clasificar y retirar la clasificación, indicando un motivo interno. Se conserva el responsable y fecha del último cambio. Al recuperar un cliente en la toma de pedidos se muestra el aviso; la clasificación no bloquea automáticamente el pedido y su motivo no se copia en las notas del repartidor.
- Apertura y cierre presenta tarjetas de montos, comparación en vivo del efectivo contado con el esperado y etiquetas Cuadrada/Faltante/Sobrante en el historial. Conserva los arqueos y responsables.
- Personal y usuarios reúne las fichas y jornadas con la gestión de cuentas, correos y permisos (solo administración puede modificar accesos). Trabajando ahora muestra las entradas de asistencia sin salida y se actualiza cada 30 segundos; también tiene un botón de actualización.
- Zonas de reparto explica el orden de preferencia: cuando dos zonas coinciden, prioridad 1 gana a prioridad 10. Una zona dibujada gana a la tarifa por comuna. Si no hay coincidencias, se usa la tarifa por distancia.
- Asistencia renueva el QR automáticamente cada 50 segundos después de pulsar Generar QR vigente. Se muestra la cuenta regresiva. El servidor invalida el código anterior y mantiene la comprobación de GPS. Al dejar Asistencia se detiene la renovación.

## Verificación

46 pruebas automáticas aprobadas; compilación de producción aprobada. Revisión de navegador en móvil y computador con servicios simulados, incluyendo filtros, lista negra, caja, permisos y renovación del QR. Pruebas de base de datos con transacciones revertidas: validación, concurrencia de clasificación y acceso de administración/cajeras/trabajadores/anónimos.

## Impresora

Estos cambios no actualizan el programa instalado en Windows. Sigue pendiente instalar el paquete separado Rame-Sushi-Comanda-Sin-Nombre-y-Direccion-PC.zip que se entregó anteriormente, para quitar nombre y dirección de la comanda impresa.
