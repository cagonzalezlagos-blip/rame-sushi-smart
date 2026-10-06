# Ramé Sushi: reparto automático y pago por distancia

## Estado de esta actualización

El servidor de Ramé Sushi ya tiene instalada la migración y activa la función de reparto. Las consultas externas fueron autorizadas y se comprobó una ruta real con Photon y OSRM. El formulario y los permisos se comprobaron con datos simulados; los cálculos y el registro del pedido se verificaron en la base publicada mediante una transacción terminada en ROLLBACK. Ahora puedes subir este paquete a GitHub para publicar el formulario nuevo.

Los usuarios y contraseñas de la versión anterior siguen disponibles. No debes volver a crear cuentas ni reemplazar la base de datos.

## Qué cambia

La caja deja de pedir elegir un tramo. Busca el domicilio, confirma el punto exacto y calcula la distancia de ida por calles desde el local. La app asigna y guarda el pago por entrega:

| Distancia | Pago al repartidor |
| --- | --- |
| Menos de 3 km | $1.000 |
| Desde 3 km hasta menos de 5 km | $1.500 |
| Desde 5 km | $2.000 |

Exactamente 3 km corresponde a $1.500 y exactamente 5 km a $2.000. Los límites y valores se pueden editar desde administración. Este pago complementa la remuneración por jornada; se contabiliza cuando el pedido queda entregado. No genera una salida de caja por sí solo.

El cobro de delivery al cliente se configura por separado. Inicialmente vale $0 porque no había tarifas activas de cobro configuradas. No se suma automáticamente el pago al repartidor al total del cliente.

## Preparar el punto de salida

En **Configuración → Reparto y tarifas**, administración debe verificar la latitud y longitud del local. En Ramé se dejó el punto de salida pendiente de configurar porque el buscador encontró El Nath sin ubicar el número 972 y las coordenadas anteriores no quedaron verificadas. No se calcula un reparto hasta guardar el punto exacto. Este punto es independiente de la ubicación usada para asistencia.

Estando dentro del local, pulsa **Usar mi ubicación como salida**, permite la ubicación precisa y luego **Guardar tarifas de reparto**. Si el GPS no tiene precisión suficiente, vuelve a intentar o ingresa coordenadas verificadas. No uses el botón estando en tu casa u otro lugar.

En el mismo apartado puedes modificar los límites en kilómetros, el pago al repartidor y el cobro al cliente de cada tramo. Los cambios se aplican a pedidos nuevos; los pedidos registrados conservan sus valores originales.

## Registrar delivery

1. Agrega los productos y los datos del cliente.
2. Selecciona **Delivery** y escribe calle, número y comuna.
3. Pulsa **Ubicar domicilio**. Elige el resultado y revisa el punto en el mapa. Una calle sin número puede producir una ubicación aproximada; debes mover el punto al domicilio exacto. También puedes pegar latitud y longitud o elegir un punto en el mapa.
4. Marca **Confirmo el domicilio del cliente en el punto señalado**.
5. Pulsa **Calcular distancia y pago** o **Registrar pedido** para calcular y registrar directamente.

La app muestra kilómetros por calles, tramo, pago al repartidor y cobro al cliente. Si editas el domicilio o el punto, debes confirmar y calcular otra vez. El cálculo vence a los 20 minutos. Si el proveedor no encuentra una ruta, no se inventa una distancia ni se asigna un importe manual.

## Revisar remuneraciones

**Repartidores** muestra por fecha las entregas completadas, la suma de pagos y los kilómetros de ida de esos pedidos. **Repartos** permite a cada repartidor ver sus propios adicionales. En las jornadas de **Personal** y **Asistencia**, la estimación incorpora las entregas completadas durante esa jornada.

Los kilómetros por ruta de cada pedido se muestran separados de los kilómetros GPS de la jornada. Pedidos antiguos sin cálculo automático no reciben pagos retroactivos. La estimación no sustituye una liquidación de remuneraciones ni confirma que el dinero ya fue pagado.

## Datos enviados a los mapas, autorizados

- Photon, operado por Komoot: dirección buscada y coordenadas del local para priorizar resultados cercanos.
- OSRM, operado por FOSSGIS/OpenStreetMap: coordenadas del local y del domicilio para obtener la distancia por calles.
- OpenStreetMap: solicitudes de imágenes del mapa correspondientes al área visualizada desde el navegador.

La app no envía nombre ni teléfono del cliente a esos proveedores. Las consultas se reutilizan desde una caché privada con validez de siete días y se limita la frecuencia por proveedor. Las cotizaciones y los datos de remuneración están protegidos en el servidor. Los servidores públicos pueden fallar o limitar el uso; para volumen elevado se debe contratar o instalar un proveedor propio.

Referencias: [Photon](https://github.com/komoot/photon), [uso de OSRM FOSSGIS](https://routing.openstreetmap.de/about.html), [API de OSRM](https://project-osrm.org/docs/v5.24.0/api/), [política de mapas](https://operations.osmfoundation.org/policies/tiles/).

## Publicar ahora

1. Descarga y descomprime el ZIP.
2. En el repositorio existente de GitHub, abre **Add file → Upload files**.
3. Arrastra el contenido de la carpeta descomprimida, sin agregar una carpeta contenedora. Conserva la configuración pública actual de Supabase y las variables de Vercel. El paquete excluye `.env.production` y claves privilegiadas.
4. Guarda en la rama principal. Vercel debe instalar la nueva dependencia Leaflet y publicar la app.
5. Cuando el despliegue esté listo, entra de nuevo. Desde el local configura el punto de salida con el botón GPS y guarda las tarifas. Luego prueba un retiro y un delivery antes de operar.

## Instalación en otro negocio: soporte técnico

En Ramé esta instalación ya se realizó. Para otro negocio, después de autorizar sus consultas de mapas, aplicar `migrations/20261006003630_automatic_delivery_compensation.sql` sobre la base existente, después de las migraciones previas. Desplegar `supabase/functions/delivery-quote` con verificación JWT activa, incluyendo `index.ts`, `handler.js` y `model.js`. Utiliza las claves del servidor suministradas por Supabase, nunca en el navegador. `APP_URL` debe apuntar a la app pública y los orígenes permitidos deben coincidir con los dominios usados.

`PHOTON_URL` y `OSRM_URL` permiten sustituir los servidores públicos por una instalación o proveedor compatible. El servicio de usuarios `manage-access` permanece separado. Se deben mantener las URL de recuperación de contraseña configuradas con los dominios públicos, sin localhost.

Verificaciones: `node --test tests/*.test.js`, `npm run build`. `tests/delivery-rpc-check.sql` se usa únicamente en una transacción que finaliza en ROLLBACK. No debe guardarse como datos permanentes.

## Verificación técnica de permisos

Las cotizaciones, la caché y el control de frecuencia son tablas privadas sin políticas para usuarios; el servidor accede con su clave privilegiada. Los procedimientos de pedidos y reportes comprueban la sesión y el perfil. La función pública de identidad del negocio devuelve solo nombre, contacto y marca, sin tarifas internas. Las advertencias del analizador por funciones SECURITY DEFINER se revisaron como interfaces intencionales con acceso limitado: [referencia del analizador](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
