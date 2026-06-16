// ============================================================
// CONTROL DE GASTOS — Apps Script API v3
// Versión con seguridad: login via API, tarjetas dinámicas
// ============================================================

const SHEET_ID   = 'ID_DE_GOOGLE_SHEET';    // <-- tu ID real de Google Sheets
const API_SECRET = 'contrañena_secreta';     // <-- tu secret real

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Se usa solo como fallback en crearSheetMes si no hay Config_Tarjetas
const TARJETAS_DEFAULT = {
  'CENCOSUD':  { color: '#D6EAF8' },
  'FALABELLA': { color: '#E8DAEF' },
  'BCI':       { color: '#D5F5E3' },
  'TENPO':     { color: '#FDEBD0' }
};

function responder(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// POST — para peticiones normales
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== API_SECRET) return responder({ ok: false, error: 'No autorizado' });
    return procesarAccion(data);
  } catch (err) {
    return responder({ ok: false, error: err.message });
  }
}

// ============================================================
// GET — fallback para Safari iOS que bloquea POST cross-origin
// ============================================================
function doGet(e) {
  const action = e.parameter.action;

  // Login no requiere secret en la URL (viene dentro del parámetro 'd')
  // getConfig sí requiere secret en la URL
  if (action === 'getConfig') {
    if (e.parameter.secret !== API_SECRET) {
      return responder({ ok: false, error: 'No autorizado' });
    }
    return handleGetConfig();
  }

  // Para todas las demás acciones, verificar secret
  if (e.parameter.secret !== API_SECRET) {
    return responder({ ok: false, error: 'No autorizado' });
  }

  // Si viene parámetro 'd' con datos JSON encoded, procesar acción completa
  if (e.parameter.d) {
    try {
      const decoded = decodeURIComponent(e.parameter.d);
      const data = JSON.parse(decoded);
      return procesarAccion(data);
    } catch (err) {
      return responder({
        ok: false,
        error: 'Error parseando d: ' + err.message,
        recibido: e.parameter.d
      });
    }
  }

  // GET simple — getGastos y verificación
  if (action === 'getGastos') {
    const mes  = parseInt(e.parameter.mes)  || new Date().getMonth() + 1;
    const anio = parseInt(e.parameter.anio) || new Date().getFullYear();
    return responder({ ok: true, gastos: obtenerGastos(mes, anio) });
  }

  return responder({ ok: true, mensaje: 'API Gastos v3 activa ✓' });
}

// ============================================================
// PROCESADOR CENTRAL DE ACCIONES
// ============================================================
function procesarAccion(data) {
  // ── Nuevas acciones de seguridad (v3) ──
  if (data.action === 'login')              return handleLogin(data);
  if (data.action === 'adminGetUsers')      return handleAdminGetUsers(data);
  if (data.action === 'adminAddUser')       return handleAdminAddUser(data);
  if (data.action === 'adminToggleUser')    return handleAdminToggleUser(data);
  if (data.action === 'adminGetTarjetas')   return handleAdminGetTarjetas(data);
  if (data.action === 'adminAddTarjeta')    return handleAdminAddTarjeta(data);
  if (data.action === 'adminDeleteTarjeta') return handleAdminDeleteTarjeta(data);

  // ── Acciones existentes (v2) ──
  if (data.action === 'getGastos') {
    return responder({ ok: true, gastos: obtenerGastos(data.mes, data.anio) });
  }
  if (data.action === 'eliminarGasto') {
    return responder(eliminarGastoSheet(data));
  }
  if (data.action === 'actualizarFoto') {
    return responder(actualizarFotoSheet(data));
  }

  // Sin action específica = registrar gasto
  const fila = registrarGasto(data);
  return responder({ ok: true, fila: fila, id: data.timestamp });
}


// ╔══════════════════════════════════════════════════════════╗
// ║           SEGURIDAD — HELPERS (nuevo en v3)             ║
// ╚══════════════════════════════════════════════════════════╝

function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function generarToken(username, rol) {
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 días
  const payload = username + ':' + rol + ':' + expires;
  const sigBytes = Utilities.computeHmacSha256Signature(payload, API_SECRET);
  const sig = sigBytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  return Utilities.base64Encode(payload) + '.' + sig;
}

function validarToken(token) {
  if (!token) return null;
  try {
    const partes = token.split('.');
    if (partes.length !== 2) return null;
    const payload = Utilities.newBlob(Utilities.base64Decode(partes[0])).getDataAsString();
    const sigBytes = Utilities.computeHmacSha256Signature(payload, API_SECRET);
    const expectedSig = sigBytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
    if (partes[1] !== expectedSig) return null;
    const campos = payload.split(':');
    const expires = parseInt(campos[campos.length - 1]);
    if (Date.now() > expires) return null;
    return { user: campos[0], rol: campos[1] };
  } catch (e) {
    return null;
  }
}

function esTokenAdmin(token) {
  const sesion = validarToken(token);
  return sesion && sesion.rol === 'admin';
}

function getSheetUsuarios() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName('Usuarios');
}

function getSheetTarjetas() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName('Config_Tarjetas');
}


// ╔══════════════════════════════════════════════════════════╗
// ║              LOGIN (nuevo en v3)                        ║
// ╚══════════════════════════════════════════════════════════╝

function handleLogin(data) {
  const username = String(data.username || '').toLowerCase().trim();
  const password = String(data.password || '');

  if (!username || !password) {
    return responder({ ok: false, error: 'Credenciales requeridas' });
  }

  const sheet = getSheetUsuarios();
  if (!sheet) return responder({ ok: false, error: 'Hoja Usuarios no encontrada. Ejecuta setupInicialUsuarios().' });

  const rows = sheet.getDataRange().getValues();
  const inputHash = hashPassword(password);

  for (let i = 1; i < rows.length; i++) {
    const [user, hash, nombre, rol, activo] = rows[i];
    if (String(user).toLowerCase() === username) {
      if (activo === false || String(activo).toUpperCase() === 'FALSE') {
        return responder({ ok: false, error: 'Usuario desactivado' });
      }
      if (hash === inputHash) {
        const token   = generarToken(username, rol || 'user');
        const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
        return responder({
          ok:      true,
          token:   token,
          user:    username,
          nombre:  nombre || username,
          rol:     rol || 'user',
          expires: expires
        });
      }
      return responder({ ok: false, error: 'Contraseña incorrecta' });
    }
  }
  return responder({ ok: false, error: 'Usuario no encontrado' });
}


// ╔══════════════════════════════════════════════════════════╗
// ║           CONFIG TARJETAS (nuevo en v3)                 ║
// ╚══════════════════════════════════════════════════════════╝

function handleGetConfig() {
  const sheet = getSheetTarjetas();
  if (!sheet) return responder({ ok: false, error: 'Hoja Config_Tarjetas no encontrada. Ejecuta setupInicialTarjetas().' });

  const rows = sheet.getDataRange().getValues();
  const tarjetas = {};

  for (let i = 1; i < rows.length; i++) {
    const [id, nombre, color, light, periodo, activo] = rows[i];
    if (!id) continue;
    if (activo === false || String(activo).toUpperCase() === 'FALSE') continue;
    tarjetas[String(id).toUpperCase()] = {
      nombre:  nombre  || id,
      color:   color   || '#888888',
      light:   light   || '#EEEEEE',
      periodo: periodo || ''
    };
  }

  return responder({ ok: true, tarjetas: tarjetas });
}


// ╔══════════════════════════════════════════════════════════╗
// ║         ADMIN — USUARIOS (nuevo en v3)                  ║
// ╚══════════════════════════════════════════════════════════╝

function handleAdminGetUsers(data) {
  if (!esTokenAdmin(data.token)) return responder({ ok: false, error: 'No autorizado' });

  const sheet = getSheetUsuarios();
  if (!sheet) return responder({ ok: false, error: 'Hoja Usuarios no encontrada' });

  const rows = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < rows.length; i++) {
    const [user, , nombre, rol, activo] = rows[i]; // hash omitido por seguridad
    if (!user) continue;
    users.push({
      user:   String(user),
      nombre: nombre || '',
      rol:    rol    || 'user',
      activo: activo !== false && String(activo).toUpperCase() !== 'FALSE'
    });
  }
  return responder({ ok: true, users: users });
}

function handleAdminAddUser(data) {
  if (!esTokenAdmin(data.token)) return responder({ ok: false, error: 'No autorizado' });

  const username = String(data.user     || '').toLowerCase().trim();
  const password = String(data.password || '');
  const nombre   = String(data.nombre   || username);
  const rol      = String(data.rol      || 'user');

  if (!username || !password) return responder({ ok: false, error: 'Faltan datos' });

  const sheet = getSheetUsuarios();
  if (!sheet) return responder({ ok: false, error: 'Hoja Usuarios no encontrada' });

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === username) {
      return responder({ ok: false, error: 'El usuario ya existe' });
    }
  }

  sheet.appendRow([username, hashPassword(password), nombre, rol, true]);
  return responder({ ok: true });
}

function handleAdminToggleUser(data) {
  if (!esTokenAdmin(data.token)) return responder({ ok: false, error: 'No autorizado' });

  const username = String(data.user || '').toLowerCase().trim();
  const activo   = data.activo === 'true' || data.activo === true;

  const sheet = getSheetUsuarios();
  if (!sheet) return responder({ ok: false, error: 'Hoja Usuarios no encontrada' });

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === username) {
      sheet.getRange(i + 1, 5).setValue(activo);
      return responder({ ok: true });
    }
  }
  return responder({ ok: false, error: 'Usuario no encontrado' });
}


// ╔══════════════════════════════════════════════════════════╗
// ║         ADMIN — TARJETAS (nuevo en v3)                  ║
// ╚══════════════════════════════════════════════════════════╝

function handleAdminGetTarjetas(data) {
  if (!esTokenAdmin(data.token)) return responder({ ok: false, error: 'No autorizado' });
  return handleGetConfig();
}

function handleAdminAddTarjeta(data) {
  if (!esTokenAdmin(data.token)) return responder({ ok: false, error: 'No autorizado' });

  const id      = String(data.id      || '').toUpperCase().trim().replace(/\s+/g, '_');
  const nombre  = String(data.nombre  || id);
  const color   = String(data.color   || '#888888');
  const light   = String(data.light   || '#EEEEEE');
  const periodo = String(data.periodo || '');

  if (!id) return responder({ ok: false, error: 'ID requerido' });

  const sheet = getSheetTarjetas();
  if (!sheet) return responder({ ok: false, error: 'Hoja Config_Tarjetas no encontrada' });

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toUpperCase() === id) {
      return responder({ ok: false, error: 'La tarjeta ya existe' });
    }
  }

  sheet.appendRow([id, nombre, color, light, periodo, true]);
  return responder({ ok: true });
}

function handleAdminDeleteTarjeta(data) {
  if (!esTokenAdmin(data.token)) return responder({ ok: false, error: 'No autorizado' });

  const id = String(data.id || '').toUpperCase().trim();
  if (!id) return responder({ ok: false, error: 'ID requerido' });

  const sheet = getSheetTarjetas();
  if (!sheet) return responder({ ok: false, error: 'Hoja Config_Tarjetas no encontrada' });

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toUpperCase() === id) {
      sheet.getRange(i + 1, 6).setValue(false); // marcar inactiva
      return responder({ ok: true });
    }
  }
  return responder({ ok: false, error: 'Tarjeta no encontrada' });
}


// ╔══════════════════════════════════════════════════════════╗
// ║   SETUP INICIAL — ejecutar UNA VEZ, luego borrar        ║
// ╚══════════════════════════════════════════════════════════╝

function setupInicialUsuarios() {
  // ⚠ CAMBIA LAS CONTRASEÑAS ANTES DE EJECUTAR
  const usuarios = [
    { user: 'ronald',  password: 'PON_TU_CLAVE_AQUI',   nombre: 'Ronald',  rol: 'admin', activo: true },
    { user: 'marcela', password: 'PON_CLAVE_MARCELA',   nombre: 'Marcela', rol: 'user',  activo: true },
  ];

  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Usuarios');
  if (!sheet) {
    sheet = ss.insertSheet('Usuarios');
    sheet.appendRow(['username', 'password_hash', 'nombre', 'rol', 'activo']);
    sheet.getRange(1, 1, 1, 5).setBackground('#1C2833').setFontColor('#FFFFFF').setFontWeight('bold');
  }

  usuarios.forEach(u => {
    sheet.appendRow([u.user, hashPassword(u.password), u.nombre, u.rol, u.activo]);
  });

  Logger.log('✓ Usuarios creados. BORRA esta función ahora.');
}

function setupInicialTarjetas() {
  const tarjetas = [
    ['CENCOSUD',  'Cencosud',  '#1B4F72', '#D6EAF8', 'del 26 al 25', true],
    ['FALABELLA', 'Falabella', '#6C3483', '#E8DAEF', 'del 20 al 19', true],
    ['BCI',       'BCI',       '#1A5276', '#D5F5E3', 'del 10 al 09', true],
    ['TENPO',     'Tenpo',     '#145A32', '#FDEBD0', 'del 06 al 05', true],
  ];

  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Config_Tarjetas');
  if (!sheet) {
    sheet = ss.insertSheet('Config_Tarjetas');
    sheet.appendRow(['id', 'nombre', 'color', 'light', 'periodo', 'activo']);
    sheet.getRange(1, 1, 1, 6).setBackground('#1C2833').setFontColor('#FFFFFF').setFontWeight('bold');
  }

  tarjetas.forEach(row => sheet.appendRow(row));
  Logger.log('✓ Tarjetas creadas. BORRA esta función ahora.');
}


// ╔══════════════════════════════════════════════════════════╗
// ║           LÓGICA EXISTENTE v2 (sin cambios)             ║
// ╚══════════════════════════════════════════════════════════╝

function registrarGasto(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fecha = new Date(data.fecha + 'T12:00:00');
  const mes   = fecha.getMonth() + 1;
  const anio  = fecha.getFullYear();
  const nombreSheet = MESES[mes] + ' ' + anio;

  let sheet = ss.getSheetByName(nombreSheet);
  if (!sheet) sheet = crearSheetMes(ss, nombreSheet, mes, anio);

  const filaDestino = encontrarFilaLibre(sheet, data.tarjeta);

  sheet.getRange(filaDestino, 1).setValue(data.fecha);
  sheet.getRange(filaDestino, 2).setValue(data.detalle);
  sheet.getRange(filaDestino, 3).setValue(Number(data.monto));
  sheet.getRange(filaDestino, 4).setValue(data.cuotas || 1);
  sheet.getRange(filaDestino, 5).setFormula(
    `=IFERROR(IF(D${filaDestino}>1,C${filaDestino}/D${filaDestino},C${filaDestino}),"")`
  );
  sheet.getRange(filaDestino, 6).setValue(Number(data.marcela) || 0);
  sheet.getRange(filaDestino, 7).setValue(Number(data.ronald)  || 0);
  sheet.getRange(filaDestino, 8).setValue(data.observaciones || '');
  sheet.getRange(filaDestino, 9).setValue(data.foto         || '');
  sheet.getRange(filaDestino, 10).setValue(data.fotoDriveId || '');

  sheet.getRange(filaDestino, 1).setNumberFormat('dd/mm/yyyy');
  sheet.getRange(filaDestino, 3).setNumberFormat('#,##0');
  sheet.getRange(filaDestino, 5).setNumberFormat('#,##0');
  sheet.getRange(filaDestino, 6).setNumberFormat('#,##0');
  sheet.getRange(filaDestino, 7).setNumberFormat('#,##0');

  SpreadsheetApp.flush();
  return filaDestino;
}

function encontrarFilaLibre(sheet, tarjeta) {
  const datos = sheet.getDataRange().getValues();
  const TARJETAS = getTarjetasActivas();
  let dentroTarjeta = false;

  for (let i = 0; i < datos.length; i++) {
    const celda = String(datos[i][0]).toUpperCase();

    if (celda.includes(tarjeta.toUpperCase())) {
      dentroTarjeta = true;
      continue;
    }

    if (dentroTarjeta) {
      const esOtraTarjeta = Object.keys(TARJETAS).some(t => celda.includes(t));
      if (esOtraTarjeta) break;
      if (celda === 'FECHA') continue;
      if ((datos[i][0] === '' || datos[i][0] === null) &&
          (datos[i][1] === '' || datos[i][1] === null)) {
        return i + 1;
      }
    }
  }
  throw new Error('No se encontró fila libre para ' + tarjeta);
}

function getTarjetasActivas() {
  try {
    const sheet = getSheetTarjetas();
    if (!sheet) return TARJETAS_DEFAULT;
    const rows = sheet.getDataRange().getValues();
    const tarjetas = {};
    for (let i = 1; i < rows.length; i++) {
      const [id, , color, light, , activo] = rows[i];
      if (!id || activo === false || String(activo).toUpperCase() === 'FALSE') continue;
      tarjetas[String(id).toUpperCase()] = { color: light || '#EEEEEE' };
    }
    return Object.keys(tarjetas).length > 0 ? tarjetas : TARJETAS_DEFAULT;
  } catch(e) {
    return TARJETAS_DEFAULT;
  }
}

function obtenerGastos(mes, anio) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const nombreSheet = MESES[mes] + ' ' + anio;
  const sheet = ss.getSheetByName(nombreSheet);
  if (!sheet) return [];

  const TARJETAS = getTarjetasActivas();
  const datos = sheet.getDataRange().getValues();
  const gastos = [];
  let tarjetaActual = '';

  for (let i = 0; i < datos.length; i++) {
    const fila = datos[i];
    const celda = String(fila[0]).trim().toUpperCase();

    const tarjetaEncontrada = Object.keys(TARJETAS).find(t => celda.includes(t));
    if (tarjetaEncontrada) { tarjetaActual = tarjetaEncontrada; continue; }

    if (celda === 'FECHA' || celda === 'TOTAL' || !tarjetaActual) continue;
    if (!fila[1] && !fila[2]) continue;

    const monto = Number(fila[2]) || 0;
    if (monto === 0) continue;

    let fechaStr = '';
    if (fila[0] instanceof Date) {
      const d = fila[0];
      fechaStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    } else {
      fechaStr = String(fila[0]);
    }

    gastos.push({
      tarjeta:       tarjetaActual,
      fecha:         fechaStr,
      detalle:       String(fila[1] || ''),
      monto:         monto,
      cuotas:        Number(fila[3]) || 1,
      marcela:       Number(fila[5]) || 0,
      ronald:        Number(fila[6]) || 0,
      observaciones: String(fila[7] || ''),
      foto:          String(fila[8] || '').trim() || null,
      fotoDriveId:   String(fila[9] || '').trim() || null,
      origen:        'sheet',
      syncPendiente: false,
      timestamp:     fechaStr + '_' + String(fila[1]).replace(/\s/g,'_'),
    });
  }
  return gastos;
}

function eliminarGastoSheet(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fecha = new Date(data.fecha + 'T12:00:00');
  const mes   = fecha.getMonth() + 1;
  const anio  = fecha.getFullYear();
  const sheet = ss.getSheetByName(MESES[mes] + ' ' + anio);
  if (!sheet) return { ok: false, error: 'Sheet no encontrado' };

  const TARJETAS = getTarjetasActivas();
  const valores = sheet.getDataRange().getValues();
  let tarjetaActual = '';
  let filaEncontrada = -1;

  for (let i = 0; i < valores.length; i++) {
    const celda = String(valores[i][0]).trim().toUpperCase();
    const t = Object.keys(TARJETAS).find(t => celda.includes(t));
    if (t) { tarjetaActual = t; continue; }
    if (tarjetaActual !== data.tarjeta.toUpperCase()) continue;
    if (String(valores[i][1]).trim().toLowerCase() === String(data.detalle).trim().toLowerCase() &&
        Number(valores[i][2]) === Number(data.monto)) {
      filaEncontrada = i + 1;
      break;
    }
  }

  if (filaEncontrada === -1) return { ok: false, error: 'Gasto no encontrado' };
  sheet.getRange(filaEncontrada, 1, 1, 10).clearContent();
  SpreadsheetApp.flush();
  return { ok: true, fila: filaEncontrada };
}

function actualizarFotoSheet(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fecha = new Date(data.fecha + 'T12:00:00');
  const mes   = fecha.getMonth() + 1;
  const anio  = fecha.getFullYear();
  const sheet = ss.getSheetByName(MESES[mes] + ' ' + anio);
  if (!sheet) return { ok: false, error: 'Sheet no encontrado' };

  const TARJETAS = getTarjetasActivas();
  const valores = sheet.getDataRange().getValues();
  let tarjetaActual = '';
  let filaEncontrada = -1;

  for (let i = 0; i < valores.length; i++) {
    const celda = String(valores[i][0]).trim().toUpperCase();
    const t = Object.keys(TARJETAS).find(t => celda.includes(t));
    if (t) { tarjetaActual = t; continue; }
    if (tarjetaActual !== data.tarjeta.toUpperCase()) continue;
    if (String(valores[i][1]).trim().toLowerCase() === String(data.detalle).trim().toLowerCase() &&
        Number(valores[i][2]) === Number(data.monto)) {
      filaEncontrada = i + 1;
      break;
    }
  }

  if (filaEncontrada === -1) return { ok: false, error: 'Gasto no encontrado' };
  sheet.getRange(filaEncontrada, 9).setValue(data.foto         || '');
  sheet.getRange(filaEncontrada, 10).setValue(data.fotoDriveId || '');
  SpreadsheetApp.flush();
  return { ok: true, fila: filaEncontrada };
}

function crearSheetMes(ss, nombreSheet, mes, anio) {
  const TARJETAS = getTarjetasActivas();
  const sheet = ss.insertSheet(nombreSheet);

  const PERIODOS = {
    'CENCOSUD':  (m,a) => `26/${String(m).padStart(2,'0')}/${a} → 25/${String(m%12+1).padStart(2,'0')}/${m===12?a+1:a}`,
    'FALABELLA': (m,a) => `20/${String(m).padStart(2,'0')}/${a} → 19/${String(m%12+1).padStart(2,'0')}/${m===12?a+1:a}`,
    'BCI':       (m,a) => `10/${String(m).padStart(2,'0')}/${a} → 09/${String(m%12+1).padStart(2,'0')}/${m===12?a+1:a}`,
    'TENPO':     (m,a) => `06/${String(m).padStart(2,'0')}/${a} → 05/${String(m%12+1).padStart(2,'0')}/${m===12?a+1:a}`,
  };

  const HCOLORS = { 'CENCOSUD':'#1B4F72','FALABELLA':'#6C3483','BCI':'#1A5276','TENPO':'#145A32' };
  const SCOLORS = { 'CENCOSUD':'#2E86C1','FALABELLA':'#8E44AD','BCI':'#1F618D','TENPO':'#1E8449' };
  const COLS    = ['Fecha','Detalle / Negocio','Monto Total ($)','Cuotas','Valor Cuota ($)',
                   'Marcela ($)','Ronald ($)','Observaciones','URL Foto','Drive ID'];
  const ANCHOS  = [100,280,130,70,130,110,110,200,200,180];
  ANCHOS.forEach((w,i) => sheet.setColumnWidth(i+1, w));

  let fila = 1;
  sheet.getRange(fila,1,1,10).merge()
    .setValue(`CONTROL DE GASTOS — ${MESES[mes].toUpperCase()} ${anio}`)
    .setBackground('#1C2833').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(13).setHorizontalAlignment('center');
  sheet.setRowHeight(fila, 32); fila++;

  sheet.getRange(fila,1,1,10).merge()
    .setValue('Inputs en azul  |  Calculado automático: Valor Cuota')
    .setBackground('#EAECEE').setFontColor('#555555')
    .setFontSize(9).setHorizontalAlignment('center');
  sheet.setRowHeight(fila, 18); fila++; fila++;

  Object.keys(TARJETAS).forEach(tarjeta => {
    const hColor = HCOLORS[tarjeta] || '#333333';
    const sColor = SCOLORS[tarjeta] || '#555555';
    const bgColor = TARJETAS[tarjeta].color || '#EEEEEE';
    const periodoFn = PERIODOS[tarjeta];
    const periodoStr = periodoFn ? periodoFn(mes, anio) : '';

    sheet.getRange(fila,1,1,10).merge()
      .setValue(`${tarjeta}   |   Período: ${periodoStr}`)
      .setBackground(hColor).setFontColor('#FFFFFF')
      .setFontWeight('bold').setFontSize(11);
    sheet.setRowHeight(fila, 26); fila++;

    COLS.forEach((col,i) => {
      sheet.getRange(fila,i+1).setValue(col)
        .setBackground(sColor).setFontColor('#FFFFFF')
        .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center');
    });
    sheet.setRowHeight(fila, 20); fila++;

    const dataStart = fila;
    for (let i = 0; i < 15; i++) {
      const bg = i%2===0 ? bgColor : '#FFFFFF';
      sheet.getRange(fila,1,1,10).setBackground(bg).setFontSize(9);
      sheet.getRange(fila,5).setFormula(`=IFERROR(IF(D${fila}>1,C${fila}/D${fila},C${fila}),"")`).setNumberFormat('#,##0');
      sheet.getRange(fila,3).setNumberFormat('#,##0');
      sheet.getRange(fila,6).setNumberFormat('#,##0');
      sheet.getRange(fila,7).setNumberFormat('#,##0');
      sheet.setRowHeight(fila, 18); fila++;
    }
    const dataEnd = fila-1;

    sheet.getRange(fila,1,1,10).setBackground('#FDEBD0').setFontWeight('bold');
    sheet.getRange(fila,1).setValue('TOTAL');
    sheet.getRange(fila,3).setFormula(`=SUM(C${dataStart}:C${dataEnd})`).setNumberFormat('#,##0');
    sheet.getRange(fila,5).setFormula(`=SUM(E${dataStart}:E${dataEnd})`).setNumberFormat('#,##0');
    sheet.getRange(fila,6).setFormula(`=SUM(F${dataStart}:F${dataEnd})`).setNumberFormat('#,##0');
    sheet.getRange(fila,7).setFormula(`=SUM(G${dataStart}:G${dataEnd})`).setNumberFormat('#,##0');
    sheet.setRowHeight(fila, 22); fila++; fila++;
  });

  SpreadsheetApp.flush();
  return sheet;
}
