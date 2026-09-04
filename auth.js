// auth.js
const { supabaseCampo } = require('./conexion.js');
const Database = require('better-sqlite3');
const { DB_PATH } = require('./db_path.js');
const db = new Database(DB_PATH);

// ESTO LO MODIFIQUE: Se importa el orquestador unificado real
const { ejecutarSincronizacionCompleta } = require('./sincronizacion.js');

// 1. INICIALIZACIÓN DE TABLAS LOCALES
db.prepare(`
  CREATE TABLE IF NOT EXISTS local_sesion (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    usuario TEXT,
    nombre_completo TEXT,
    rol TEXT,
    unidad_negocio TEXT,
    modo TEXT,
    iniciado_en TEXT
  )
`).run();

// ESTO LO MODIFIQUE: Esquema coincidente con bases.js (password TEXT, activo INTEGER/TEXT flexible)
db.prepare(`
  CREATE TABLE IF NOT EXISTS local_usuarios (
    id INTEGER PRIMARY KEY,
    usuario TEXT UNIQUE,
    nombre_completo TEXT,
    rol TEXT,
    unidad_negocio TEXT,
    password TEXT,
    activo INTEGER DEFAULT 1,
    actualizado_en TEXT
  )
`).run();

// Sincronización completa (Subida + Bajada + Bajas)
async function sincronizarTodo() {
  try {
    console.log("Iniciando sincronización post-login...");
    /* ESTO LO MODIFIQUE: Llamada segura al orquestador importado */
    if (typeof ejecutarSincronizacionCompleta === 'function') {
      await ejecutarSincronizacionCompleta();
    }
    console.log("Sincronización finalizada con éxito.");
  } catch (e) {
    console.error("Error en el proceso de sincronización:", e.message);
  }
}

/**
 * Guarda o actualiza el registro único en local_sesion (id = 1)
 */
function registrarSesionLocal(datosUsuario, modo) {
  const stmt = db.prepare(`
    INSERT INTO local_sesion (id, usuario, nombre_completo, rol, unidad_negocio, modo, iniciado_en)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      usuario = excluded.usuario,
      nombre_completo = excluded.nombre_completo,
      rol = excluded.rol,
      unidad_negocio = excluded.unidad_negocio,
      modo = excluded.modo,
      iniciado_en = excluded.iniciado_en
  `);

  stmt.run(
    datosUsuario.usuario,
    datosUsuario.nombre_completo || datosUsuario.usuario,
    datosUsuario.rol || 'operario',
    datosUsuario.unidad_negocio || 'General',
    modo,
    new Date().toISOString()
  );
}

async function iniciarSesion(usuario, password) {
  const userClean = String(usuario || '').trim();
  const passClean = String(password || '').trim();

  if (!userClean || !passClean) {
    return { ok: false, motivo: 'datos_incompletos' };
  }

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // --- FLUJO ONLINE ---
  if (online && supabaseCampo) {
    try {
      /* ESTO LO MODIFIQUE: Búsqueda tolerante a mayúsculas/minúsculas y activo numérico o texto */
      const { data, error } = await supabaseCampo
        .from('sys_usuarios')
        .select('*')
        .ilike('usuario', userClean)
        .limit(1);

      if (!error && data && data.length > 0) {
        const usuarioRemoto = data[0];

        // Validar si el usuario está activo (soporta 1, '1', 'ACTIVO' o true)
        const estadoActivo = String(usuarioRemoto.activo || '').toUpperCase();
        const esActivo = estadoActivo === '1' || estadoActivo === 'ACTIVO' || estadoActivo === 'TRUE';

        if (!esActivo) {
          return { ok: false, motivo: 'credenciales_invalidas' };
        }

        // Comparar contraseña en texto plano
        if (String(usuarioRemoto.password || '').trim() !== passClean) {
          return { ok: false, motivo: 'credenciales_invalidas' };
        }

        // Guardar o actualizar copia en SQLite local
        db.prepare(`
          INSERT INTO local_usuarios (id, usuario, nombre_completo, rol, unidad_negocio, password, activo, actualizado_en)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(usuario) DO UPDATE SET
            nombre_completo = excluded.nombre_completo,
            rol = excluded.rol,
            unidad_negocio = excluded.unidad_negocio,
            password = excluded.password,
            activo = 1,
            actualizado_en = excluded.actualizado_en
        `).run(
          usuarioRemoto.id,
          usuarioRemoto.usuario,
          usuarioRemoto.nombre_completo || usuarioRemoto.usuario,
          usuarioRemoto.rol,
          usuarioRemoto.unidad_negocio || 'General',
          usuarioRemoto.password,
          new Date().toISOString()
        );

        // Guardar sesión activa en SQLite (local_sesion id = 1)
        registrarSesionLocal(usuarioRemoto, 'online');

        // Sincronización en segundo plano sin trabar la navegación
        sincronizarTodo().catch(err => console.error("Error en sincronización post-login:", err));

        return { ok: true, usuario: usuarioRemoto };
      }
    } catch (err) {
      console.warn("Fallo en consulta remota a Supabase, intentando modo offline...", err.message);
    }
  }

  // --- FALLBACK OFFLINE (SQLITE LOCAL) ---
  try {
    /* ESTO LO MODIFIQUE: Búsqueda flexible en local_usuarios sin colgar si activo es 1 o 'ACTIVO' */
    const localUser = db.prepare(`
      SELECT * FROM local_usuarios 
      WHERE LOWER(TRIM(usuario)) = LOWER(TRIM(?))
        AND (activo = 1 OR UPPER(CAST(activo AS TEXT)) = 'ACTIVO' OR activo IS NULL)
    `).get(userClean);

    if (!localUser) {
      const totalLocales = db.prepare("SELECT COUNT(*) as cant FROM local_usuarios").get().cant;
      return { ok: false, motivo: totalLocales === 0 ? 'sin_conexion_primera_vez' : 'credenciales_invalidas' };
    }

    // Validación de clave local
    if (String(localUser.password || '').trim() !== passClean) {
      return { ok: false, motivo: 'credenciales_invalidas' };
    }

    // Persistir sesión activa en SQLite (local_sesion id = 1)
    registrarSesionLocal(localUser, 'offline');

    return { ok: true, usuario: localUser, offline: true };

  } catch (localErr) {
    console.error("Error crítico en DB local:", localErr);
    return { ok: false, motivo: 'credenciales_invalidas' };
  }
}

function obtenerSesionActiva() {
  try {
    const sesionLocal = db.prepare('SELECT * FROM local_sesion WHERE id = 1').get();
    if (sesionLocal && sesionLocal.usuario) {
      return sesionLocal;
    }
  } catch (e) {
    console.warn("No se pudo leer local_sesion:", e.message);
  }
  return null;
}

function cerrarSesion() {
  try {
    db.prepare('DELETE FROM local_sesion WHERE id = 1').run();
  } catch (e) {
    console.error("Error al limpiar la sesión local:", e.message);
  }
}

module.exports = {
  iniciarSesion,
  obtenerSesionActiva,
  cerrarSesion,
  sincronizarTodo
};