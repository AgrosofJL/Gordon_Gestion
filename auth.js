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
  if (online && supabaseCampo) {
    try {
      console.log(`[AUTH] Consultando usuario '${userClean}' en Supabase...`);
      
      const { data, error } = await supabaseCampo
        .from('sys_usuarios')
        .select('*')
        .ilike('usuario', userClean)
        .limit(1);

      if (!error && data && data.length > 0) {
        const uRemoto = data[0];

        // Validar si el usuario está activo (soporta 1, '1', 'ACTIVO' o true)
        const estadoActivo = String(uRemoto.activo || '').toUpperCase();
        const esActivo = estadoActivo === '1' || estadoActivo === 'ACTIVO' || estadoActivo === 'TRUE';

        if (!esActivo) {
          return { ok: false, motivo: 'usuario_inactivo' };
        }

        // Comparar contraseña
        if (String(uRemoto.password || '').trim() !== passClean) {
          return { ok: false, motivo: 'credenciales_invalidas' };
        }

        // =====================================================================
        // PASO 2: TODO OK -> INSERTAR / ACTUALIZAR EN SQLITE LOCAL
        // =====================================================================
        console.log(`[AUTH] Credenciales válidas. Guardando copia en SQLite...`);
        
        db.prepare(`
          INSERT INTO local_usuarios (id, usuario, nombre_completo, rol, unidad_negocio, password, activo, actualizado_en)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(usuario) DO UPDATE SET
            id = excluded.id,
            nombre_completo = excluded.nombre_completo,
            rol = excluded.rol,
            unidad_negocio = excluded.unidad_negocio,
            password = excluded.password,
            activo = 1,
            actualizado_en = excluded.actualizado_en
        `).run(
          uRemoto.id,
          uRemoto.usuario,
          uRemoto.nombre_completo || uRemoto.usuario,
          uRemoto.rol,
          uRemoto.unidad_negocio || 'General',
          uRemoto.password,
          new Date().toISOString()
        );

        // PASO 3: GRABAR SESIÓN ACTIVA (id = 1) PARA EL MENÚ
        db.prepare(`
          INSERT INTO local_sesion (id, usuario, nombre_completo, rol, unidad_negocio, modo, iniciado_en)
          VALUES (1, ?, ?, ?, ?, 'online', datetime('now', 'localtime'))
          ON CONFLICT(id) DO UPDATE SET
            usuario = excluded.usuario,
            nombre_completo = excluded.nombre_completo,
            rol = excluded.rol,
            unidad_negocio = excluded.unidad_negocio,
            modo = excluded.modo,
            iniciado_en = excluded.iniciado_en
        `).run(
          uRemoto.usuario,
          uRemoto.nombre_completo || uRemoto.usuario,
          uRemoto.rol,
          uRemoto.unidad_negocio || 'General'
        );

        // PASO 4: SINCRONIZACIÓN EN SEGUNDO PLANO (Bajar permisos y maestros)
        if (typeof ejecutarSincronizacionCompleta === 'function') {
          ejecutarSincronizacionCompleta().catch(e => console.warn('Sincronización post-login en progreso...', e.message));
        }

        return { ok: true, usuario: uRemoto };
      } else {
        return { ok: false, motivo: 'credenciales_invalidas' };
      }
    } catch (err) {
      console.warn("[AUTH] Falló la consulta remota a Supabase, probando respaldo local...", err.message);
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