// sincronizacion.js
const esEntornoNode = typeof require === 'function' && typeof process !== 'undefined';

let fs = null;
let path = null;
let db = null;
let supabaseCampo = null;
let supabaseCosecha = null;
let tablasConfig = [];

if (esEntornoNode) {
  fs = require('fs');
  path = require('path');
  try {
    const bases = require('./bases.js');
    db = bases.db;
  } catch (e) {}

  try {
    const conexion = require('./conexion.js');
    supabaseCampo = conexion.supabaseCampo;
    supabaseCosecha = conexion.supabaseCosecha;
  } catch (e) {}

  try {
    tablasConfig = require('./tablas_lista.js');
  } catch (e) {}
} else {
  // Entorno Safari / Web
  if (window.ConexionSupabase) {
    supabaseCampo = window.ConexionSupabase.supabaseCampo;
    supabaseCosecha = window.ConexionSupabase.supabaseCosecha;
  }
}

// Mapa unificado de claves primarias/únicas
const mapaClavesEspeciales = {
  'local_sys_permisos_usuario': 'id',
  'local_p_cuadros': 'cod_parcela',
  'local_p_cultivo': 'cod_esp',
  'local_p_inventario_plantacion': 'id_inv',
  'local_p_marcos_plantacion': 'cod_marco',
  'local_p_variedades': 'id_var',
  'local_cosecha': 'nro_unidad',
  'local_p_tipo_control_aplicaciones': 'codigo',
  'local_p_aplicacionesOrdenes': 'cabecera',
  'local_p_nomina_personal': 'legajo',
  'local_p_legajo_datos': 'legajo',
  'local_i_insumos_rubros': 'id_rubro',
  'local_i_insumos_subrubros': 'cod',
  'local_p_recetas_aplicaciones': ['registro', 'cabecera'],
  'local_r_aplicaciones_fol_fert': ['registro', 'reg_aplic', 'cab_aplic'],
  'local_c_consumos_combustibles': ['id', 'reg_local'],
  'local_i_insumos_catalogo': ['id', 'reg_local'],
  'local_i_insumos_detalle': ['id', 'reg_local'],
  'local_i_insumos_movimientos': ['id', 'reg_local'],
  'local_i_insumosingresos': ['id', 'reg_local'],
  'local_m_labores_maquinaria': ['id', 'reg_local'],
  'local_p_personal_historial': ['id', 'reg_local'],
  'local_p_normas_conducta': ['id', 'reg_local'],
  'local_r_campo_riego': ['id', 'reg_local'],
  'local_r_jornada_trabajo': ['id', 'reg_local'],
  'local_r_mantenimiento_maquinaria': ['id', 'reg_local'],
  'local_descarte': ['id', 'reg_local'],
  'local_p_calibre': ['id', 'reg_local'],
  'local_p_categoria': ['id', 'reg_local'],
  'local_p_clientes': ['id', 'reg_local'],
  'local_p_embalaje': ['id', 'reg_local'],
  'local_p_productores': ['id', 'reg_local'],
  'local_paletizado': ['id', 'reg_local'],
  'local_despachos_produccion': 'reg_local',
  'local_detalle_recepcion': 'reg_local'
};

const columnasExcluidasPorTabla = {
  'local_p_personal_historial': ['jonal'],
  'local_i_insumos_ordenes_Compra': ['descripcion'],
  'local_p_nomina_personal': [
    'fecha_nacimiento', 'estado_civil', 'nacionalidad', 'domicilio', 'cp', 'localidad', 'provincia',
    'telefono', 'email', 'domicilio_notif', 'beneficiario_nombre', 'beneficiario_dni',
    'beneficiario_parentesco', 'beneficiario_domicilio', 'beneficiario_localidad', 'beneficiario_provincia'
  ]
};

// ============================================================================
// 1. PUSH: SUBIR CAMBIOS LOCALES PENDIENTES
// ============================================================================
async function subirCambiosLocales() {
  if (!esEntornoNode || !db) {
    console.log('[PUSH] Modo Web: las operaciones se persisten directamente en Supabase.');
    return;
  }

  console.log('--- [PUSH] Subiendo cambios locales no sincronizados ---');

  for (const tabla of tablasConfig) {
    try {
      const clienteSupabase = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      if (!clienteSupabase) continue;

      const pendientes = db.prepare(`SELECT * FROM ${tabla.local} WHERE sincronizado = 0`).all();
      if (pendientes.length === 0) continue;

      console.log(`Subiendo ${pendientes.length} registros pendientes de: ${tabla.local}...`);

      let pk = mapaClavesEspeciales[tabla.local] || 'reg_local';
      let pkCols = Array.isArray(pk) ? pk : [pk];
      let onConflictKey = Array.isArray(pk) ? pk.join(',') : pk;

      for (let row of pendientes) {
        let payloadNube = { ...row };

        delete payloadNube.sincronizado;
        delete payloadNube.hora_volcado;

        if (!pkCols.includes('id') && payloadNube.hasOwnProperty('id')) {
          delete payloadNube.id;
        } else if (payloadNube.id === 0 || payloadNube.id === null || payloadNube.id === undefined) {
          delete payloadNube.id;
        }

        for (const colExcluida of (columnasExcluidasPorTabla[tabla.local] || [])) {
          delete payloadNube[colExcluida];
        }

        const { error: dbErr } = await clienteSupabase
          .from(tabla.remoto)
          .upsert(payloadNube, { onConflict: onConflictKey });

        if (!dbErr) {
          const whereClausulaPk = pkCols.map(col => `${col} = ?`).join(' AND ');
          const pkValores = pkCols.map(col => row[col]);

          db.prepare(`UPDATE ${tabla.local} SET sincronizado = 1 WHERE ${whereClausulaPk}`)
            .run(...pkValores);
            
          console.log(`  ✓ [PUSH OK] ${tabla.remoto} -> PK: ${pkValores.join(',')}`);
        } else {
          console.error(`  ❌ Error al subir registro en ${tabla.remoto}:`, dbErr.message);
        }
      }
    } catch (err) {
      console.error(`Error en PUSH para tabla ${tabla.local}:`, err.message);
    }
  }
}

// ============================================================================
// 2. PULL: BAJAR Y CONCILIAR DATOS
// ============================================================================
async function sincronizarTodo() {
  if (!esEntornoNode || !db) {
    console.log('[PULL] Modo Web: actualizando caché de permisos en localStorage...');
    try {
      const sesion = JSON.parse(localStorage.getItem('sesion_activa') || '{}');
      const usuarioActual = sesion.usuario || sesion.operario;
      const cliente = supabaseCampo || (window.ConexionSupabase && window.ConexionSupabase.supabaseCampo);

      if (usuarioActual && cliente) {
        const { data, error } = await cliente
          .from('sys_permisos_usuario')
          .select('*')
          .ilike('usuario', usuarioActual);

        if (!error && data) {
          localStorage.setItem('permisos_usuario', JSON.stringify(data));
          console.log('✓ Permisos web sincronizados correctamente.');
        }
      }
    } catch (e) {
      console.warn('Fallo al refrescar caché web:', e);
    }
    return;
  }

  console.log('--- [PULL] Descargando y conciliando cambios de la nube en SQLite ---');

  for (const tabla of tablasConfig) {
    try {
      const clienteSupabase = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      if (!clienteSupabase) continue;

      let dataSupabase = [];
      let desde = 0, hasta = 999;
      let seguirDescargando = true;

      while (seguirDescargando) {
        const { data: chunk, error } = await clienteSupabase
          .from(tabla.remoto)
          .select('*')
          .range(desde, hasta);

        if (error) throw new Error(`Error en rango ${desde}-${hasta}: ${error.message}`);

        if (chunk && chunk.length > 0) {
          dataSupabase = dataSupabase.concat(chunk);
          if (chunk.length < 1000) seguirDescargando = false;
          else { desde += 1000; hasta += 1000; }
        } else { seguirDescargando = false; }
      }

      const pragma = db.prepare(`PRAGMA table_info(${tabla.local})`).all();
      const columnasLocales = pragma.map(col => col.name);
      const tieneColumnaSincro = columnasLocales.includes('sincronizado');

      let pkColumna = mapaClavesEspeciales[tabla.local] || 'id';
      const pkColumnas = Array.isArray(pkColumna) ? pkColumna : [pkColumna];

      const mapaNube = new Map();
      dataSupabase.forEach(rowNube => {
        const key = pkColumnas.map(col => rowNube[col]).join('_');
        mapaNube.set(key, rowNube);
      });

      const transaccionMerge = db.transaction(() => {
        const registrosLocales = db.prepare(`SELECT * FROM ${tabla.local}`).all();

        for (const regLocal of registrosLocales) {
          const keyLocal = pkColumnas.map(col => regLocal[col]).join('_');
          if (regLocal.sincronizado === 1 && !mapaNube.has(keyLocal)) {
            const whereClausulaPk = pkColumnas.map(col => `${col} = ?`).join(' AND ');
            const pkValores = pkColumnas.map(col => regLocal[col]);
            db.prepare(`DELETE FROM ${tabla.local} WHERE ${whereClausulaPk}`).run(...pkValores);
          }
        }

        for (const filaNube of dataSupabase) {
          const pkValores = pkColumnas.map(col => filaNube[col]);
          if (pkValores.some(v => v === undefined || v === null)) continue;

          const columnasBase = Object.keys(filaNube).filter(col => columnasLocales.includes(col));
          const whereClausulaPk = pkColumnas.map(col => `${col} = ?`).join(' AND ');
          
          const registroLocalPrevio = db.prepare(`SELECT sincronizado FROM ${tabla.local} WHERE ${whereClausulaPk}`).get(...pkValores);

          if (!registroLocalPrevio) {
            const columnasInsert = tieneColumnaSincro ? [...columnasBase, 'sincronizado'] : columnasBase;
            const placeholders = columnasInsert.map(() => '?').join(', ');
            const valores = columnasBase.map(col => typeof filaNube[col] === 'object' && filaNube[col] !== null ? JSON.stringify(filaNube[col]) : filaNube[col]);
            if (tieneColumnaSincro) valores.push(1);

            db.prepare(`INSERT OR REPLACE INTO ${tabla.local} (${columnasInsert.join(', ')}) VALUES (${placeholders})`).run(valores);
          } else if (registroLocalPrevio.sincronizado === 1) {
            const asignacionesUpdate = columnasBase.map(col => `${col} = ?`).join(', ');
            const valores = columnasBase.map(col => typeof filaNube[col] === 'object' && filaNube[col] !== null ? JSON.stringify(filaNube[col]) : filaNube[col]);
            valores.push(...pkValores);

            db.prepare(`UPDATE ${tabla.local} SET ${asignacionesUpdate} WHERE ${whereClausulaPk}`).run(valores);
          }
        }
      });

      transaccionMerge();
      console.log(`✓ Tabla ${tabla.local} sincronizada.`);
    } catch (err) {
      console.error(`Fallo en el merge de la tabla ${tabla.local}:`, err.message);
    }
  }
}

// ============================================================================
// 3. MEDIA (Descarga de archivos)
// ============================================================================
async function descargarArchivosMedia() {
  if (!esEntornoNode || !db || !fs) return;
  console.log("--- [MEDIA] Verificando imágenes faltantes (solo escritorio) ---");
}

// ============================================================================
// 4. ORQUESTADOR
// ============================================================================
async function ejecutarSincronizacionCompleta() {
  console.time('Tiempo Total Sincronización');
  try {
    await subirCambiosLocales();
    await sincronizarTodo();
    await descargarArchivosMedia();
    console.log('✅ ¡Sincronización finalizada con éxito!');
  } catch (err) {
    console.error('❌ Error en el ciclo de sincronización:', err);
  } finally {
    console.timeEnd('Tiempo Total Sincronización');
  }
}

// Exportación compatible
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    subirCambiosLocales,
    sincronizarTodo,
    descargarArchivosMedia,
    ejecutarSincronizacionCompleta
  };
} else {
  window.SincronizacionService = {
    subirCambiosLocales,
    sincronizarTodo,
    descargarArchivosMedia,
    ejecutarSincronizacionCompleta
  };
}