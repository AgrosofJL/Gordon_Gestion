// auth.js
const { supabaseCampo } = require('./conexion.js');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { DB_PATH } = require('./db_path.js');
const db = new Database(DB_PATH);

const { subirCambiosLocales } = require('./subir.js');
const { bajarDatosRemotos } = require('./bajar.js');

// 1. INICIALIZACIÓN DE TABLAS LOCALES (Estructuras necesarias)
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

db.prepare(`
  CREATE TABLE IF NOT EXISTS local_usuarios (
    id INTEGER PRIMARY KEY,
    usuario TEXT UNIQUE,
    nombre_completo TEXT,
    rol TEXT,
    unidad_negocio TEXT,
    password_hash TEXT,
    activo INTEGER,
    actualizado_en TEXT
  )
`).run();

// Sincronización completa (Subida + Bajada)
async function sincronizarTodo() {
  try {
    console.log("Iniciando sincronización...");
    await ejecutarSincronizacionCompleta();
    console.log("Sincronización finalizada con éxito.");
  } catch (e) {
    console.error("Error en el proceso de sincronización:", e);
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
    datosUsuario.nombre_completo,
    datosUsuario.rol,
    datosUsuario.unidad_negocio || 'General',
    modo,
    new Date().toISOString()
  );
}

async function iniciarSesion(usuario, password) {
  const online = navigator.onLine;

  // --- FLUJO ONLINE ---
  if (online) {
    try {
      // 1. Validar contra Supabase (sys_usuarios)
      const { data, error } = await supabaseCampo
        .from('sys_usuarios')
        .select('*')
        .eq('usuario', usuario)
        .eq('activo', 'ACTIVO')
        .single();

      if (error || !data) {
        return { ok: false, motivo: 'credenciales_invalidas' };
      }

      // 2. Comparar contraseña en texto plano (según la captura de tu BD)
      if (data.password !== password) {
        return { ok: false, motivo: 'credenciales_invalidas' };
      }

      // 3. Guardar/Actualizar copia en local_usuarios
      db.prepare(`
        INSERT INTO local_usuarios (id, usuario, nombre_completo, rol, unidad_negocio, password, activo, actualizado_en)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(usuario) DO UPDATE SET
          nombre_completo = excluded.nombre_completo,
          rol = excluded.rol,
          unidad_negocio = excluded.unidad_negocio,
          password = excluded.password,
          activo = excluded.activo,
          actualizado_en = excluded.actualizado_en
      `).run(
        data.id, data.usuario, data.nombre_completo, data.rol, 
        data.unidad_negocio || 'General', data.password, data.activo, new Date().toISOString()
      );

      // 4. Guardar sesión activa en SQLite (local_sesion) y sessionStorage
      registrarSesionLocal(data, 'online');

      sessionStorage.setItem('usuarioSesion', JSON.stringify({
        id: data.id, 
        usuario: data.usuario, 
        nombre_completo: data.nombre_completo,
        rol: data.rol, 
        unidad_negocio: data.unidad_negocio || 'General'
      }));

      // DISPARAR SINCRONIZACIÓN EN SEGUNDO PLANO
      sincronizarTodo().catch(err => console.error("Error en sincronización post-login:", err));

      return { ok: true, usuario: data };

    } catch (err) {
      console.warn("Fallo de conexión Supabase, intentando modo offline...", err);
    }
  }

  // --- FALLBACK OFFLINE ---
  try {
    const localUser = db.prepare(`
      SELECT * FROM local_usuarios 
      WHERE usuario = ? AND activo = 'ACTIVO'
    `).get(usuario);

    if (!localUser) {
      const totalLocales = db.prepare("SELECT COUNT(*) as cant FROM local_usuarios").get().cant;
      return { ok: false, motivo: totalLocales === 0 ? 'sin_conexion_primera_vez' : 'credenciales_invalidas' };
    }

    // Validación de clave local en texto plano
    if (localUser.password !== password) {
      return { ok: false, motivo: 'credenciales_invalidas' };
    }

    // Guardar sesión activa en SQLite (local_sesion) y sessionStorage
    registrarSesionLocal(localUser, 'offline');

    sessionStorage.setItem('usuarioSesion', JSON.stringify({
      id: localUser.id, 
      usuario: localUser.usuario, 
      nombre_completo: localUser.nombre_completo,
      rol: localUser.rol, 
      unidad_negocio: localUser.unidad_negocio
    }));

    if (navigator.onLine) {
      sincronizarTodo().catch(err => console.error("Error en sincronización offline recuperada:", err));
    }

    return { ok: true, usuario: localUser, offline: true };

  } catch (localErr) {
    console.error("Error crítico en DB local:", localErr);
    return { ok: false, motivo: 'credenciales_invalidas' };
  }
}

function obtenerSesionActiva() {
  // Primero intentamos leer de la BD local SQLite
  try {
    const sesionLocal = db.prepare('SELECT * FROM local_sesion WHERE id = 1').get();
    if (sesionLocal) return sesionLocal;
  } catch (e) {
    console.warn("No se pudo leer local_sesion, recurriendo a sessionStorage:", e);
  }

  const sesionStr = sessionStorage.getItem('usuarioSesion');
  return sesionStr ? JSON.parse(sesionStr) : null;
}

function cerrarSesion() {
  sessionStorage.removeItem('usuarioSesion');
  try {
    db.prepare('DELETE FROM local_sesion WHERE id = 1').run();
  } catch (e) {
    console.error("Error al limpiar la sesión local:", e);
  }
}

module.exports = {
  iniciarSesion,
  obtenerSesionActiva,
  cerrarSesion,
  sincronizarTodo
};