# 🏠 Gasto Familiar

**Control de gastos familiares para tarjetas de crédito chilenas.**

Aplicación web progresiva (PWA) diseñada para familias chilenas que necesitan controlar los gastos de múltiples tarjetas de crédito, dividir montos entre personas y mantener un registro fotográfico de las boletas.

🌐 **URL:** [registralosgastos.cl](https://registralosgastos.cl)

---

## ✨ Funcionalidades

- **Registro de gastos** con validaciones automáticas (campos obligatorios, montos, duplicados)
- **4 tarjetas de crédito** con períodos de facturación chilenos: Cencosud (26-25), Falabella (20-19), BCI (10-09), Tenpo (06-05)
- **Tab Ciclos** con ciclo actual por tarjeta (total acumulado, días restantes, fecha de vencimiento) e historial de ciclos cerrados
- **Panel de administración** para agregar/eliminar usuarios y tarjetas (solo rol admin)
- **Login multiusuario** con roles (admin/user), sesión persistente de 7 días y autenticación vía Apps Script
- **Tarjetas dinámicas** cargadas desde la API (no hardcodeadas en el frontend)
- **Auto-actualización PWA** vía Service Worker: nuevas versiones se aplican solas al abrir la app
- **División de gastos** entre dos personas (Marcela y Ronald) con validación de montos
- **Fotos de boletas** directas desde la cámara del teléfono o galería, almacenadas en Google Drive
- **Dashboard interactivo** con gráficos Chart.js: distribución por tarjeta, gastos históricos por mes, distribución por categoría, comparativo entre personas, top 5 gastos y negocios frecuentes
- **Categorías automáticas** por detección de palabras clave (Jumbo → Supermercado, etc.) con selección manual
- **Navegación por meses** con flechas en Inicio, Historial y Dashboard
- **Sincronización bidireccional** con Google Sheets como fuente de verdad
- **Reintento automático** de gastos pendientes de sincronización
- **Exportar** a CSV y resumen de texto
- **PWA instalable** en iPhone y Mac vía Safari ("Añadir a pantalla de inicio")
- **Historial ordenado** por fecha descendente (más reciente primero)

---

## 🏗️ Arquitectura

```
┌─────────────┐     ┌─────────────┐    ┌───────────────────┐   
│   Usuario   │     │   Usuario   │    │    Usuario        │
│   iPhone    │     │   iPhone    │    │    (Nav. web)     │   
└──────┬──────┘     └──────┬──────┘    └──────┬────────────┘
       │      HTTPS        │      HTTPS       │   
       └────────┬──────────┘──────────────────┘                     
                │
                ▼
┌──────────────────────────────┐
│    registralosgastos.cl      │
│    Dominio (Hostgator)       │
│    DNS: Netlify DNS          │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      GitHub Pages            │
│   Hosting gratuito           │
│   Archivo: index.html        │
└──────┬───────┬───────┬───────┘
       │       │       │
       ▼       ▼       ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Google  │ │  Google  │ │  Google  │
│  Apps    │ │  Sheets  │ │  Drive   │
│  Script  │ │  (Base   │ │  (Fotos  │
│  (API)   │→│  datos)  │ │  boletas)│
└──────────┘ └──────────┘ └──────────┘
       │                       │
       └───────────┬───────────┘
                   ▼
          ┌─────────────────┐
          │  Google Cloud   │
          │  OAuth2         │
          │  (Autenticación)│
          └─────────────────┘
```

### Flujo de datos

1. El usuario accede a `registralosgastos.cl` desde su dispositivo
2. El DNS de Netlify resuelve al hosting de GitHub Pages
3. GitHub Pages sirve el archivo `index.html` (PWA completa)
4. Al registrar un gasto, el frontend envía los datos vía GET a Google Apps Script
5. Apps Script escribe los datos en Google Sheets (un sheet por mes)
6. Las fotos de boletas se suben a Google Drive vía OAuth2
7. Al cargar la app, se sincronizan los gastos desde Sheets (fuente de verdad)

### Componentes

| Componente | Tecnología | Función |
|---|---|---|
| Frontend | HTML/CSS/JS (PWA) | Interfaz de usuario, lógica de negocio |
| Hosting | GitHub Pages | Servidor de archivos estáticos |
| API | Google Apps Script | Lógica del servidor, CRUD de gastos |
| Base de datos | Google Sheets | Almacenamiento de gastos por mes |
| Almacenamiento | Google Drive | Fotos de boletas |
| Autenticación | Google Cloud OAuth2 | Autorización para subir fotos a Drive |
| DNS | Netlify DNS | Gestión de registros DNS del dominio |
| Dominio | Hostgator | Registro del dominio registralosgastos.cl |

---

## 📊 Estructura de Google Sheets

Cada mes tiene su propio sheet (ej: "Junio 2026") con 4 secciones por tarjeta, cada una con 15 filas para gastos y una fila de totales.

**Columnas por gasto:**

| Columna | Campo | Tipo |
|---|---|---|
| A | Fecha | dd/mm/yyyy |
| B | Detalle / Negocio | Texto |
| C | Monto Total ($) | Número |
| D | Cuotas | Número |
| E | Valor Cuota ($) | Fórmula (=C/D) |
| F | Marcela ($) | Número |
| G | Ronald ($) | Número |
| H | Observaciones | Texto |
| I | URL Foto | URL thumbnail de Drive |
| J | Drive ID | ID del archivo en Drive |

### Períodos de facturación y vencimientos

| Tarjeta | Período | Pago |
|---|---|---|
| CENCOSUD | Del 26 al 25 del mes siguiente | Día 10 del mes siguiente al cierre |
| FALABELLA | Del 20 al 19 del mes siguiente | Día 5 del mes siguiente al cierre |
| BCI | Del 10 al 09 del mes siguiente | Día 26 del mismo mes que cierra |
| TENPO | Del 06 al 05 del mes siguiente | Día 20 del mismo mes que cierra |

---

## 🛠️ Stack tecnológico

- **Frontend:** HTML5, CSS3, JavaScript ES6+ (vanilla, sin frameworks)
- **Gráficos:** Chart.js 4.4.0 (CDN)
- **Backend:** Google Apps Script (serverless)
- **Base de datos:** Google Sheets API
- **Almacenamiento:** Google Drive API
- **Autenticación:** Google Identity Services (OAuth2)
- **Hosting:** GitHub Pages
- **DNS:** Netlify DNS
- **Dominio:** registralosgastos.cl

---

## 🚀 Instalación y configuración

### Prerrequisitos

- Cuenta de Google (Gmail)
- Proyecto en Google Cloud Console con OAuth2 configurado
- Repositorio en GitHub con GitHub Pages habilitado

### 1. Google Sheets

1. Crear un Google Sheet nuevo
2. Copiar el Sheet ID desde la URL
3. Configurar el ID en `API_SECRET` del Apps Script (línea 6)

### 2. Google Apps Script

1. Ir a [script.google.com](https://script.google.com)
2. Crear un nuevo proyecto
3. Pegar el contenido de `API_Gastos_v7_completo.gs`
4. Configurar `SHEET_ID` y `API_SECRET`
5. Implementar como Web App:
   - Ejecutar como: **Yo**
   - Acceso: **Cualquier persona**
6. Copiar la URL de implementación

### 3. Google Cloud (OAuth2 para fotos)

1. Ir a [Google Cloud Console](https://console.cloud.google.com)
2. Crear credenciales OAuth2 (tipo Web Application)
3. Agregar orígenes autorizados: `https://tu-dominio.cl`
4. Copiar el Client ID
5. Configurar el Client ID en el HTML

### 4. Frontend

1. Configurar en `index.html`:
   - `API_URL`: URL del Apps Script desplegado
   - `API_SECRET`: clave secreta (debe coincidir con Apps Script)
   - `CLIENT_ID`: Client ID de Google Cloud
2. Subir `index.html` y `sw.js` al repositorio de GitHub
3. Habilitar GitHub Pages en Settings → Pages → Branch: main

### 5. DNS (opcional — dominio personalizado)

1. Configurar 4 registros A apuntando a GitHub Pages:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
2. Configurar CNAME `www` → `usuario.github.io`
3. En GitHub Pages, agregar dominio personalizado y activar HTTPS

---

## 📱 Uso

### Instalar como PWA (iPhone)

1. Abrir `registralosgastos.cl` en Safari
2. Tocar el ícono de compartir (cuadrado con flecha)
3. Seleccionar "Añadir a pantalla de inicio"
4. La app se instala como ícono independiente

### Registrar un gasto

1. Seleccionar tarjeta
2. Ingresar detalle del negocio
3. Ingresar monto y cuotas
4. Seleccionar fecha
5. Dividir entre Marcela y Ronald
6. Seleccionar categoría (o dejar auto-detección)
7. Opcionalmente tomar foto de la boleta
8. Tocar "Guardar y sincronizar"

---

## 📋 Versionado

| Versión | Fecha | Descripción |
|---|---|---|
| v1.0 | 2026-06-12 | Base estable: registro, sincronización, fotos, historial, exportar |
| v1.1 | 2026-06-13 | Dashboard mejorado: navegación por meses, gráfico histórico 12 meses, tooltips con $, gráficos responsive |
| v1.2 | 2026-06-27 | Login multiusuario con roles, panel admin, tarjetas dinámicas, historial ordenado por fecha |
| v1.3 | 2026-06-27 | Tab Ciclos: ciclo actual y historial por tarjeta con fechas de vencimiento |
| v1.4 | 2026-06-27 | Service Worker: auto-actualización de la PWA sin reinstalar |

---

## 🗺️ Roadmap

- [ ] Migrar fotos a Google Service Account (eliminar OAuth2 manual)
- [ ] Lector de PDF del estado de cuenta con IA
- [ ] Sistema de presupuestos y alertas
- [ ] Gastos recurrentes automáticos
- [ ] Vista de cuotas pendientes / deuda proyectada
- [ ] Versión comercial para familias y pequeñas empresas chilenas

---

## 👨‍💻 Autor

**Ronald Sandoval Muñoz**
IT Engineer

---

## 📄 Licencia

Este proyecto es de uso privado. Todos los derechos reservados.
