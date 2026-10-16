# Plan de Ahorro

Interfaz modernizada a partir del diseño de referencia, conservando la colección `planes` de Firebase y sus campos `titulo`, `objetivo` y `celdas` (`monto`, `activo`). Los planes existentes no requieren migración.

## Abrir localmente

Desde esta carpeta:

```powershell
python -m http.server 8000
```

Abre http://localhost:8000. Los módulos JavaScript necesitan un servidor HTTP; abrir el HTML con doble clic no es suficiente. Se requiere conexión para cargar el SDK de Firebase y sincronizar los datos. La tipografía tiene una alternativa local si Google Fonts no está disponible.

La entrada principal es `index.html`. `index (2).html` conserva la misma interfaz. `script (2).js` y `style (1).css` remiten a los archivos principales para mantener compatibles las referencias anteriores.

## Comportamiento

- Varios planes, siete por página; el resumen considera todos los planes.
- Montos alternados separados por comas, con hasta dos decimales y punto decimal. La última casilla de un plan nuevo se ajusta a la meta exacta. Límite de 5000 casillas por plan.
- Filtros de todas, ahorradas y pendientes por plan.
- Los abonos marcan casillas completas en orden, saltando las que superen el saldo. Se informa el monto aplicado y cualquier sobrante; no se guarda saldo parcial.
- El progreso se calcula a partir del dinero ahorrado. Los planes antiguos cuyas casillas no cubren el objetivo muestran un aviso, sin modificar sus datos.
- Reinicio y eliminación con confirmación; escrituras mediante transacciones para evitar sobrescribir cambios concurrentes.
- Estado de conexión/caché y mensajes de error; los cambios requieren permisos de lectura y escritura sobre `planes` en el proyecto Firebase configurado. Este cambio no modifica sus reglas ni añade autenticación.

## Verificar los cálculos

```powershell
node --test savings.test.mjs
node --check script.js
```
