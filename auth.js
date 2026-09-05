// auth.js
const { supabaseCampo } = require('./conexion.js');
const Database = require('better-sqlite3');
const { DB_PATH } = require('./db_path.js');
const db = new Database(DB_PATH);
const { ejecutarSincronizacionCompleta } = require('./sincronizacion.js');

async function iniciarSesion(usuario, password) {
  const userClean = String(usuario || '').trim();
  const passClean = String(password || '').trim();

  if (!userClean || !passClean) {
    return { ok: false, motivo: 'datos_incompletos' };
  }

  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // =========================================================================
  // PASO 1: VALIDAR PRIMERO CONTRA SUPABASE (NUBE)
  // =========================================================================
  /* ESTO LO MODIFIQUE: auth.js consultando la tabla 'usuarios' con 'operario' y 'pass' */
if (online && supabaseCampo) {
  try {
    const { data, error } = await supabaseCampo
      .from('usuarios')
      .select('*')
      .ilike('operario', userClean)
      .limit(1);

    if (!error && data && data.length > 0) {
      const uRemoto = data[0];

      const estadoTxt = String(uRemoto.estado || '').toUpperCase();
      const esActivo = estadoTxt === 'ACTIVO' || estadoTxt === '1' || estadoTxt === 'TRUE';

      if (!esActivo) {
        return { ok: false, motivo: 'usuario_inactivo' };
      }

      if (String(uRemoto.pass || '').trim() !== passClean) {
        return { ok: false, motivo: 'credenciales_invalidas' };
      }

      // Guardar en base SQLite local
      db.prepare(`
        INSERT INTO local_usuarios (id, usuario, nombre_completo, rol, unidad_negocio, password, activo, actualizado_en)
        VALUES (?, ?, ?, ?, 'General', ?, 1, ?)
        ON CONFLICT(usuario) DO UPDATE SET
          id = excluded.id,
          nombre_completo = excluded.nombre_completo,
          rol = excluded.rol,
          password = excluded.password,
          activo = 1,
          actualizado_en = excluded.actualizado_en
      `).run(
        uRemoto.id,
        uRemoto.operario,
        uRemoto.operario,
        uRemoto.rol,
        uRemoto.pass,
        new Date().toISOString()
      );

      db.prepare(`
        INSERT INTO local_sesion (id, usuario, nombre_completo, rol, unidad_negocio, modo, iniciado_en)
        VALUES (1, ?, ?, ?, 'General', 'online', datetime('now', 'localtime'))
        ON CONFLICT(id) DO UPDATE SET
          usuario = excluded.usuario,
          nombre_completo = excluded.nombre_completo,
          rol = excluded.rol,
          modo = excluded.modo,
          iniciado_en = excluded.iniciado_en
      `).run(
        uRemoto.operario,
        uRemoto.operario,
        uRemoto.rol
      );

      return { 
        ok: true, 
        usuario: { 
          id: uRemoto.id, 
          usuario: uRemoto.operario, 
          nombre_completo: uRemoto.operario, 
          rol: uRemoto.rol 
        } 
      };
    }
  } catch (err) {
    console.warn("[AUTH] Error consultando Supabase:", err.message);
  }
}

  // =========================================================================
  // FALLBACK OFFLINE: SOLO SI NO HAY INTERNET O SUPABASE NO RESPONDIÓ
  // =========================================================================
  try {
    console.log(`[AUTH] Modo offline: Verificando usuario localmente...`);
    const localUser = db.prepare(`
      SELECT * FROM local_usuarios 
      WHERE LOWER(TRIM(usuario)) = LOWER(TRIM(?))
        AND (activo = 1 OR UPPER(CAST(activo AS TEXT)) = 'ACTIVO' OR activo IS NULL)
    `).get(userClean);

    if (!localUser) {
      const cant = db.prepare("SELECT COUNT(*) as c FROM local_usuarios").get().c;
      return { ok: false, motivo: cant === 0 ? 'sin_conexion_primera_vez' : 'credenciales_invalidas' };
    }

    if (String(localUser.password || '').trim() !== passClean) {
      return { ok: false, motivo: 'credenciales_invalidas' };
    }

    // Persistir sesión activa offline
    db.prepare(`
      INSERT INTO local_sesion (id, usuario, nombre_completo, rol, unidad_negocio, modo, iniciado_en)
      VALUES (1, ?, ?, ?, ?, 'offline', datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        usuario = excluded.usuario,
        nombre_completo = excluded.nombre_completo,
        rol = excluded.rol,
        unidad_negocio = excluded.unidad_negocio,
        modo = excluded.modo,
        iniciado_en = excluded.iniciado_en
    `).run(
      localUser.usuario,
      localUser.nombre_completo,
      localUser.rol,
      localUser.unidad_negocio
    );

    return { ok: true, usuario: localUser, offline: true };

  } catch (errLocal) {
    console.error("[AUTH] Error crítico local:", errLocal);
    return { ok: false, motivo: 'credenciales_invalidas' };
  }
}

function obtenerSesionActiva() {
  try {
    const s = db.prepare('SELECT * FROM local_sesion WHERE id = 1').get();
    if (s && s.usuario) return s;
  } catch (e) {}
  return null;
}

function cerrarSesion() {
  try {
    db.prepare('DELETE FROM local_sesion WHERE id = 1').run();
  } catch (e) {}
}

module.exports = {
  iniciarSesion,
  obtenerSesionActiva,
  cerrarSesion
};