# Ramé Sushi — accesos de salsas y preparación original

Descomprime Rame-Sushi-Salsas-Arriba-y-Sin-Cambios-GitHub.zip y sube sus cuatro archivos a la raíz de GitHub, reemplazando los existentes. Espera el despliegue y actualiza la app con Ctrl + F5.

- Los botones Soya + unagui, Solo soya, Solo unagui y Sin salsas aparecen arriba de las filas y del conteo, tanto en la toma como en la edición de pedidos.
- Se mantiene el funcionamiento actual: Sin salsas deja cero salsas; las filas de una salsa mantienen cantidades de 1 a 100.
- En el grupo opcional Cambios de ingredientes aparece Sin cambios / receta original, que permite continuar sin elegir una sustitución.
- La revisión final del producto incluye Sin cambios / receta original para quitar las sustituciones opcionales de ingredientes y las observaciones de cocina. Se conservan las elecciones obligatorias del producto y otros adicionales elegidos.
- Se corrigió en la base de datos el grupo Cambios de ingredientes de 20 HOT prueba, que tenía como obligatorio elegir una sustitución. Ahora es opcional y no agrega un recargo si no se escoge un cambio. No debes ejecutar SQL.

Se verificó en navegador la posición de los botones, la opción sin salsas al crear/editar pedidos, la receta original, el precio y el envío sin sustituciones. Pasaron las 46 pruebas y la compilación de producción. La prueba del precio original en la base de datos se realizó en una transacción revertida.
