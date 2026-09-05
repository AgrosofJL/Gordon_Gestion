// sincronizacion.js
const esEntornoNode = typeof require === 'function' && typeof process !== 'undefined';

let fs = null;
let path = null;
let db = null;
let supabaseCampo = null;
let supabaseCosecha = null;
let tablasConfig = [];

// ============================================================================
// CONFIGURACIÓN DE TABLAS (Universal: Node y Navegador)
// ============================================================================
const TABLAS_DEFECTO = [
  { local: 'local_sys_permisos_usuario', remoto: 'sys_permisos_usuario', proyecto: 'campo' },
  { local: 'local_p_cuadros', remoto: 'p_cuadros', proyecto: 'campo' },
  { local: 'local_p_cultivo', remoto: 'p_cultivo', proyecto: 'campo' },
  { local: 'local_p_inventario_plantacion', remoto: 'p_inventario_plantacion', proyecto: 'campo' },
  { local: 'local_p_marcos_plantacion', remoto: 'p_marcos_plantacion', proyecto: 'campo' },
  { local: 'local_p_variedades', remoto: 'p_variedades', proyecto: 'campo' },
  { local: 'local_p_nomina_personal', remoto: 'p_nomina_personal', proyecto: 'campo' },
  { local: 'local_p_legajo_datos', remoto: 'p_legajo_datos', proyecto: 'campo' },
  { local: 'local_p_macro_labores', remoto: 'p_macro_labores', proyecto: 'campo' },
  { local: 'local_p_tipo_control_aplicaciones', remoto: 'p_tipo_control_aplicaciones', proyecto: 'campo' },
  { local: 'local_p_aplicacionesOrdenes', remoto: 'p_aplicacionesOrdenes', proyecto: 'campo' },
  { local: 'local_p_recetas_aplicaciones', remoto: 'p_recetas_aplicaciones', proyecto: 'campo' },
  { local: 'local_i_insumos_rubros', remoto: 'i_insumos_rubros', proyecto: 'campo' },
  { local: 'local_i_insumos_subrubros', remoto: 'i_insumos_subrubros', proyecto: 'campo' },
  { local: 'local_i_insumos_catalogo', remoto: 'i_insumos_catalogo', proyecto: 'campo' },
  { local: 'local_i_insumos_detalle', remoto: 'i_insumos_detalle', proyecto: 'campo' },
  { local: 'local_i_insumos_movimientos', remoto: 'i_insumos_movimientos', proyecto: 'campo' },
  { local: 'local_i_insumosingresos', remoto: 'i_insumosingresos', proyecto: 'campo' },
  { local: 'local_c_consumos_combustibles', remoto: 'c_consumos_combustibles', proyecto: 'campo' },
  { local: 'local_m_labores_maquinaria', remoto: 'm_labores_maquinaria', proyecto: 'campo' },
  { local: 'local_p_personal_historial', remoto: 'p_personal_historial', proyecto: 'campo' },
  { local: 'local_p_normas_conducta', remoto: 'p_normas_conducta', proyecto: 'campo' },
  { local: 'local_p_personal_sanciones', remoto: 'p_personal_sanciones', proyecto: 'campo' },
  { local: 'local_r_campo_riego', remoto: 'r_campo_riego', proyecto: 'campo' },
  { local: 'local_r_jornada_trabajo', remoto: 'r_jornada_trabajo', proyecto: 'campo' },
  { local: 'local_r_mantenimiento_maquinaria', remoto: 'r_mantenimiento_maquinaria', proyecto: 'campo' },
  // Proyecto Cosecha
  { local: 'local_cosecha', remoto: 'cosecha', proyecto: 'cosecha' },
  { local: 'local_descarte', remoto: 'descarte', proyecto: 'cosecha' },
  { local: 'local_p_calibre', remoto: 'p_calibre', proyecto: 'cosecha' },
  { local: 'local_p_categoria', remoto: 'p_categoria', proyecto: 'cosecha' },
  { local: 'local_p_clientes', remoto: 'p_clientes', proyecto: 'cosecha' },
  { local: 'local_p_embalaje', remoto: 'p_embalaje', proyecto: 'cosecha' },
  { local: 'local_p_productores', remoto: 'p_productores', proyecto: 'cosecha' },
  { local: 'local_paletizado', remoto: 'paletizado', proyecto: 'cosecha' },
  { local: 'local_despachos_produccion', remoto: 'despachos_produccion', proyecto: 'cosecha' },
  { local: 'local_detalle_recepcion', remoto: 'detalle_recepcion', proyecto: 'cosecha' }
];

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
  } catch (e) {
    tablasConfig = TABLAS_DEFECTO;
  }
} else {
  // Entorno Web (Safari / GitHub Pages)
  tablasConfig = TABLAS_DEFECTO;

  // Credenciales directas en cliente Web sin persistencia conflictiva
  const P1_URL = "https://zcmyglespedhcppgxwpg.supabase.co";
  const P1_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjbXlnbGVzcGVkaGNwcGd4d3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxODI1MTUsImV4cCI6MjA5NTc1ODUxNX0.ouoVoCa5smtHJpTRDMN1dx9dx2qLkoE0qDL5Ug9Dowc";
  const P2_URL = "https://whiwwfqabpkukamcowbg.supabase.co";
  const P2_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoaXd3ZnFhYnBrdWthbWNvd2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NTI3MDgsImV4cCI6MjA5MzQyODcwOH0.XK-pOH-LuKOoekko6mAoefd6jxAdk5lUdpeuMyzLde4";

  if (window.supabase) {
    supabaseCampo = window.supabase.createClient(P1_URL, P1_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    supabaseCosecha = window.supabase.createClient(P2_URL, P2_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
}

// Mapa unificado de claves primarias
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
  'local_p_personal_sanciones': ['id', 'reg_local'],
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
      const cliente = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      if (!cliente) continue;

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

        const { error: dbErr } = await cliente
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
// 2. PULL: BAJAR Y CONCILIAR DATOS (SQLite en PC / LocalStorage en Web)
// ============================================================================
async function sincronizarTodo() {
  // --------------------------------------------------------------------------
  // CASO A: ENTORNO SAFARI / WEB (GITHUB PAGES)
  // --------------------------------------------------------------------------
  if (!esEntornoNode || !db) {
    console.log('--- [PULL WEB] Descargando todas las tablas a LocalStorage ---');

    for (const tabla of tablasConfig) {
      try {
        const cliente = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
        if (!cliente) continue;

        // Descarga de datos
        const { data, error } = await cliente
          .from(tabla.remoto)
          .select('*')
          .limit(1000);

        if (!error && data) {
          // ESTO LO MODIFIQUE: Se guarda cada tabla con su nombre local_xxx en LocalStorage
          localStorage.setItem(tabla.local, JSON.stringify(data));
          console.log(`  ✓ [WEB SYNC] ${tabla.local} guardada con ${data.length} registros.`);
        } else if (error) {
          console.warn(`  ⚠️ Error al bajar ${tabla.remoto}:`, error.message);
        }
      } catch (errWeb) {
        console.error(`Fallo bajando ${tabla.local} en la web:`, errWeb.message);
      }
    }

    // Refrescar permisos específicos
    try {
      const sesion = JSON.parse(localStorage.getItem('sesion_activa') || '{}');
      const usuarioActual = sesion.usuario || sesion.operario;
      if (usuarioActual && supabaseCampo) {
        const { data: permisos } = await supabaseCampo
          .from('sys_permisos_usuario')
          .select('*')
          .ilike('usuario', usuarioActual);

        if (permisos) {
          localStorage.setItem('permisos_usuario', JSON.stringify(permisos));
        }
      }
    } catch (e) {}

    console.log('✅ ¡Sincronización Web completada! Todas las tablas están en LocalStorage.');
    return;
  }

  // --------------------------------------------------------------------------
  // CASO B: ENTORNO ESCRITORIO (ELECTRON + SQLITE)
  // --------------------------------------------------------------------------
  console.log('--- [PULL ESCRITORIO] Descargando y conciliando en SQLite ---');

  for (const tabla of tablasConfig) {
    try {
      const cliente = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      if (!cliente) continue;

      let dataSupabase = [];
      let desde = 0, hasta = 999;
      let seguirDescargando = true;

      while (seguirDescargando) {
        const { data: chunk, error } = await cliente
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
      console.log(`✓ Tabla ${tabla.local} sincronizada y conciliada en SQLite.`);
    } catch (err) {
      console.error(`Fallo en el merge de la tabla ${tabla.local}:`, err.message);
    }
  }
}

// ============================================================================
// 3. MEDIA (Descarga física de imágenes)
// ============================================================================
async function descargarArchivosMedia() {
  if (!esEntornoNode || !db || !fs) return;
  console.log("--- [MEDIA] Verificando imágenes faltantes (solo escritorio) ---");
}

// ============================================================================
// 4. ORQUESTADOR PRINCIPAL
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