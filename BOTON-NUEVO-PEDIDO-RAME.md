# Ramé Sushi — botón flotante y organización del menú

1. Descomprime Rame-Sushi-Boton-Nuevo-Pedido-GitHub.zip.
2. Sube los cinco archivos extraídos a la raíz del repositorio de GitHub, reemplazando los que tienen el mismo nombre.
3. Espera el despliegue y actualiza la app con Ctrl + F5.

Cambios:
- Zonas de reparto está en Administración.
- Proveedores está en Operación diaria.
- Administración y cajeras tienen el botón flotante «+ Nuevo pedido» en la esquina inferior derecha, disponible desde cualquier apartado.
- Guarda el borrador actual antes de abrir uno nuevo. Los pedidos anteriores siguen disponibles en las pestañas de borradores, con nombre, teléfono y productos.
- El nuevo pedido incluye los regalos predeterminados de una soya y una unagui, editables.
- Pulsar el botón abre un borrador; se registra e imprime al pulsar Registrar pedido e imprimir comanda.
- Si falla el guardado, se conserva el borrador previo y se muestra el error.

Verificación: 46 pruebas y compilación aprobadas. Flujo probado en navegador con servicios simulados: conservación del pedido anterior, acceso desde otros apartados, error al guardar, permisos por perfil y ancho móvil.

No requiere cambios en Supabase ni en el programa de impresión. La instalación anterior de la comanda en el computador del sushi sigue siendo independiente.
