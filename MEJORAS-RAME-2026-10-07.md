# Ramé Sushi: asistencia al tomar pedidos, comanda y caja

## Publicar la app

Descomprime **Rame-Sushi-Mejoras-Pedidos-y-Caja-GitHub.zip**. Todos sus archivos van en la raíz de `rame-sushi-smart`, junto a `package.json`; reemplaza los existentes y agrega `customer-suggestions.js`. Este paquete contiene solo archivos de la aplicación, sin carpetas ni archivos del programa de impresión: evita reemplazar el package.json de la app por el de la impresora. Confirma los cambios y espera Vercel. Después recarga con Ctrl + F5.

La migración de Supabase ya está aplicada. No ejecutes SQL manualmente.

## Cambiar la comanda del computador

1. Cierra la ventana **Rame - Impresión**.
2. Descomprime completamente **Rame-Sushi-Comanda-Sin-Nombre-y-Direccion-PC.zip** en una carpeta del computador del local.
3. Ejecuta **ACTUALIZAR-COMANDA.cmd** con la cuenta de Windows de la instalación.
4. Cuando diga Comanda actualizada, pulsa Enter y abre **Rame - Impresión** desde el escritorio.

Se actualiza solo el formato de los tickets. Conserva impresora, clave protegida, conexión y reparación de lectura de la clave. No subas este ZIP a GitHub.

La comanda de cocina omite los campos nombre y dirección del cliente. Mantiene teléfono, número de jornada, productos, preparación, regalos, palitos y horario. La pre-cuenta conserva su formato anterior. Las notas libres se imprimen como fueron ingresadas: usa las indicaciones del repartidor para información de despacho y no escribas nombre/dirección dentro de notas de preparación.

## Tomar pedidos

- Los borradores nuevos comienzan con **1 Soya + 1 Unagui**. El apartado muestra **Cantidad total de salsas de regalo: 2**. Hay botones Solo soya, Solo unagui, Soya + unagui y Sin salsas, además de editar tipos y cantidades y agregar o quitar filas. La cantidad aparece en un campo amplio con botones − y +. Los pedidos ya registrados y borradores anteriores conservan sus regalos guardados.
- Desde tres caracteres en nombre o teléfono aparecen sugerencias de clientes guardados. Pulsar una recupera sus datos; no registra un pedido. Revisa el domicilio antes de usarlo. Se mantienen la búsqueda por teléfono y el historial para repetir pedidos con precios actuales.
- Las salsas tienen sugerencias de nombres. Las indicaciones ofrecen frases rápidas: Llamar al llegar, Departamento, Portón y Entregar en conserjería. Se pueden editar libremente. No se inventan datos del cliente.
- El repartidor ve nombre, teléfono, dirección, ruta, detalle del pedido, fecha, indicaciones, pago y cantidades totales de salsas y palitos, con tipo y cantidad de cada salsa.

## Delivery con Google Maps

1. Ingresa la dirección recibida del cliente y revisa la comuna.
2. Pulsa **Buscar esta dirección en Google Maps**; abre la búsqueda con la dirección ya escrita.
3. En Google Maps, ubica el domicilio exacto. En el computador, haz clic derecho sobre el punto y pulsa las coordenadas para copiarlas.
4. Pégalas en **Pegar coordenadas o enlace completo de Google Maps**. Ejemplo: `-33.0600, -71.3900`.
5. La app muestra el punto reconocido. Confirma que corresponde al domicilio y pulsa Calcular distancia y pago, o registra el pedido para calcular con el punto confirmado.

Puedes Ver / ajustar punto si necesitas revisarlo en el mapa de la app. Las coordenadas explícitas de un destino en algunos enlaces completos también se reconocen. Se rechazan enlaces cortos y URLs que solo indican la cámara del mapa: no identifican de forma segura el domicilio. La búsqueda alternativa y la tarifa manual siguen disponibles.

Se mantiene el cobro por zona/comuna, con distancia como alternativa, y el pago al repartidor separado. No se incorpora una búsqueda automática cuando pegas coordenadas.

## Sin seguimiento del cliente

Se retiraron los botones de seguimiento de Pedidos y Repartidores. El servidor no genera enlaces nuevos y los enlaces anteriores ya no muestran información del pedido. Pegar pedidos de WhatsApp sigue disponible.

## Apertura, cierre e historial de caja

Administración y cajeras pueden contar billetes y monedas en apertura y cierre. Pulsa **Usar total contado** para aplicar y guardar el desglose al confirmar. Al cambiar las cantidades después de aplicarlo, el monto se actualiza. Si escribes un monto manual, el arqueo deja de estar aplicado hasta pulsar el botón nuevamente.

El historial muestra fecha y responsable de apertura, fondo inicial, fecha y responsable de cierre y efectivo contado. En cierres hechos con la nueva pantalla muestra efectivo esperado y diferencia. Los nuevos arqueos guardados pueden desplegarse para ver las denominaciones. Las jornadas anteriores sin desglose conservan su información real. Más antiguas / Más recientes permite recorrer el historial en páginas de 20 jornadas.

## Verificación

43 pruebas automatizadas aprobadas y compilación de producción correcta. Prueba de interfaz con servicios simulados a 390 px: regalos predeterminados y editables, campos de cantidades visibles, sugerencias, coordenadas sin búsqueda adicional, arqueo de apertura y cierre, historial con responsables, información del repartidor y ausencia de seguimiento. Pruebas transaccionales en Supabase, revertidas al finalizar: validación de denominaciones, desglose persistido, diferencias, consultas de caja por cajeras, sugerencias restringidas a personal autorizado y seguimiento desactivado. Las zonas y asignaciones anteriores siguen pasando sus verificaciones.

La impresión física debe comprobarse en el computador después de instalar el cambio de comanda. El programa actualizado debe mantenerse abierto.
