# 📡 API Gastos Tarjetas v2

Documentación de la API backend del proyecto Gasto Familiar, implementada en Google Apps Script.

---

## Información general

| Campo | Valor |
|---|---|
| Plataforma | Google Apps Script |
| Protocolo | HTTPS |
| Método | GET (POST disponible pero no usado por CORS en Safari iOS) |
| Formato respuesta | JSON |
| Autenticación | API Secret compartido entre frontend y backend |

---

## URL base

```
https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
```

La URL se obtiene al implementar el Apps Script como Web App desde el editor de Google Apps Script.

---

## Autenticación

Todas las peticiones requieren el parámetro `secret` con el valor configurado en la constante `API_SECRET` del script. Las peticiones sin secret o con secret incorrecto reciben:

```json
{ "ok": false, "error": "No autorizado" }
```

---

## Endpoints

### 1. Verificar estado de la API

Verifica que la API está activa y accesible.

**Request:**
```
GET /exec?secret={API_SECRET}
```

**Response:**
```json
{ "ok": true, "mensaje": "API Gastos v2 activa ✓" }
```

---

### 2. Obtener gastos de un mes

Retorna todos los gastos registrados en el sheet del mes/año solicitado.

**Request:**
```
GET /exec?action=getGastos&mes={1-12}&anio={YYYY}&secret={API_SECRET}
```

**Parámetros:**

| Parámetro | Tipo | Requerido | Descripción |
|---|---|---|---|
| action | string | Sí | `getGastos` |
| mes | integer | No | Mes (1-12). Default: mes actual |
| anio | integer | No | Año (YYYY). Default: año actual |
| secret | string | Sí | Clave de autenticación |

**Response exitosa:**
```json
{
  "ok": true,
  "gastos": [
    {
      "tarjeta": "CENCOSUD",
      "fecha": "2026-06-10",
      "detalle": "Supermercado Jumbo",
      "monto": 45000,
      "cuotas": 1,
      "marcela": 22500,
      "ronald": 22500,
      "observaciones": "",
      "foto": "https://drive.google.com/thumbnail?id=...",
      "fotoDriveId": "1abc...",
      "origen": "sheet",
      "syncPendiente": false,
      "timestamp": "2026-06-10_Supermercado_Jumbo"
    }
  ]
}
```

**Response sin datos:**
```json
{ "ok": true, "gastos": [] }
```

---

### 3. Registrar un gasto

Registra un nuevo gasto en el sheet del mes correspondiente. Si el sheet del mes no existe, lo crea automáticamente con la estructura completa (4 tarjetas, 15 filas cada una, fórmulas y formatos).

**Request:**
```
GET /exec?secret={API_SECRET}&d={JSON_ENCODED}
```

El parámetro `d` contiene un JSON codificado con `encodeURIComponent` con los datos del gasto.

**Estructura del JSON en `d`:**

```json
{
  "tarjeta": "CENCOSUD",
  "fecha": "2026-06-10",
  "detalle": "Supermercado Jumbo",
  "monto": 45000,
  "cuotas": 1,
  "marcela": 22500,
  "ronald": 22500,
  "observaciones": "Compra semanal",
  "foto": "https://drive.google.com/thumbnail?id=...",
  "fotoDriveId": "1abc...",
  "timestamp": "1718050000000",
  "secret": "API_SECRET"
}
```

**Campos:**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| tarjeta | string | Sí | `CENCOSUD`, `FALABELLA`, `BCI` o `TENPO` |
| fecha | string | Sí | Formato `YYYY-MM-DD` |
| detalle | string | Sí | Nombre del negocio o descripción |
| monto | number | Sí | Monto total en pesos chilenos |
| cuotas | number | No | Número de cuotas (default: 1) |
| marcela | number | No | Monto asignado a Marcela (default: 0) |
| ronald | number | No | Monto asignado a Ronald (default: 0) |
| observaciones | string | No | Texto libre |
| foto | string | No | URL del thumbnail de Google Drive |
| fotoDriveId | string | No | ID del archivo en Google Drive |
| timestamp | string | No | Identificador único del gasto |
| secret | string | Sí | Clave de autenticación |

**Response exitosa:**
```json
{ "ok": true, "fila": 6, "id": "1718050000000" }
```

**Response error:**
```json
{ "ok": false, "error": "No se encontró fila libre para CENCOSUD" }
```

---

### 4. Eliminar un gasto

Busca un gasto por tarjeta, detalle y monto, y limpia la fila correspondiente en el sheet (no elimina la fila para preservar fórmulas de totales).

**Request:**
```
GET /exec?secret={API_SECRET}&d={JSON_ENCODED}
```

**Estructura del JSON en `d`:**

```json
{
  "action": "eliminarGasto",
  "tarjeta": "CENCOSUD",
  "fecha": "2026-06-10",
  "detalle": "Supermercado Jumbo",
  "monto": 45000,
  "secret": "API_SECRET"
}
```

**Response exitosa:**
```json
{ "ok": true, "fila": 6 }
```

**Response error:**
```json
{ "ok": false, "error": "Gasto no encontrado en el Sheet" }
```

---

### 5. Actualizar foto de un gasto

Actualiza las columnas de foto (URL y Drive ID) de un gasto existente.

**Request:**
```
GET /exec?secret={API_SECRET}&d={JSON_ENCODED}
```

**Estructura del JSON en `d`:**

```json
{
  "action": "actualizarFoto",
  "tarjeta": "CENCOSUD",
  "fecha": "2026-06-10",
  "detalle": "Supermercado Jumbo",
  "monto": 45000,
  "foto": "https://drive.google.com/thumbnail?id=...",
  "fotoDriveId": "1abc...",
  "secret": "API_SECRET"
}
```

**Response exitosa:**
```json
{ "ok": true, "fila": 6 }
```

---

## Manejo de errores

Todas las respuestas de error siguen el formato:

```json
{ "ok": false, "error": "Descripción del error" }
```

Errores comunes:

| Error | Causa |
|---|---|
| `No autorizado` | Secret incorrecto o faltante |
| `No se encontró fila libre para {TARJETA}` | Las 15 filas de la tarjeta están ocupadas |
| `Sheet no encontrado` | No existe el sheet del mes solicitado |
| `Gasto no encontrado` | No se encontró coincidencia de tarjeta + detalle + monto |
| `Error parseando d: ...` | El JSON en el parámetro `d` está mal formado |

---

## Notas técnicas

### ¿Por qué GET en lugar de POST?

Google Apps Script desplegado como Web App no soporta CORS preflight (OPTIONS). Cuando el frontend envía un POST con `Content-Type: application/json`, Safari iOS dispara una petición OPTIONS previa que Apps Script rechaza con status 405. Por esta razón, todas las peticiones se envían como GET con los datos codificados en el parámetro `d`.

### Creación automática de sheets

Cuando se registra un gasto en un mes que no tiene sheet, la función `crearSheetMes()` genera automáticamente la estructura completa con:

- Título con mes y año
- 4 secciones (una por tarjeta) con colores diferenciados
- Encabezados de columnas
- 15 filas vacías por tarjeta con formato alterno
- Fórmulas de Valor Cuota (`=C/D`) en cada fila
- Filas de TOTAL con fórmulas SUM
- Períodos de facturación calculados por tarjeta

### Límites de Google Apps Script (plan gratuito)

| Límite | Valor |
|---|---|
| Tiempo máximo de ejecución | 6 minutos por petición |
| Llamadas diarias a Sheets API | 20.000 |
| Ejecuciones simultáneas | 1 (secuencial) |
| Tamaño máximo de respuesta | 6 MB |

---

## Estructura del código

```
apps_script_gastos_v2.gs
├── Constantes (SHEET_ID, API_SECRET, TARJETAS, MESES)
├── responder()              → Formatea respuesta JSON
├── doPost()                 → Punto de entrada POST
├── doGet()                  → Punto de entrada GET (con soporte parámetro 'd')
├── procesarAccion()         → Router central de acciones
├── registrarGasto()         → Escribe gasto en el Sheet
├── encontrarFilaLibre()     → Busca primera fila vacía en una tarjeta
├── obtenerGastos()          → Lee gastos del Sheet de un mes
├── eliminarGastoSheet()     → Limpia fila de un gasto
├── actualizarFotoSheet()    → Actualiza columnas I y J de un gasto
└── crearSheetMes()          → Genera sheet nuevo con estructura completa
```

---

## Versionado del API

| Versión | Descripción |
|---|---|
| v1 | Solo doPost, sin soporte GET con datos |
| v2 | doPost + doGet básico (solo getGastos) |
| v3 | Soporte GET con parámetro `d` para fix CORS Safari iOS |
| v4 | Manejo de errores explícito en doGet para diagnóstico |
| v5 | Fix doGet: procesar parámetro `d` con datos JSON encoded (versión actual) |
