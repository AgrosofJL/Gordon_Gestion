// sincronizacion.js
const esEntornoNode = typeof require === 'function' && typeof process !== 'undefined';

let fs = null;
let path = null;
let db = null;
let supabaseCampo = null;
let supabaseCosecha = null;
let tablasConfig = [];
let pathModule = null;

if (esEntornoNode) {
  fs = require('fs');
  path = require('path');
  pathModule = path;
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
  // Entorno Web (Safari / Chrome / GitHub Pages)
  tablasConfig = window.TABLAS_CONFIG || [];
  supabaseCampo = window._clientCampo;
  supabaseCosecha = window._clientCosecha;
}

// Columnas de imágenes a gestionar en la tabla de despachos
const columnasFotosDespachos = [
  'url_precinto', 'url_patente', 'url_camioncarga',
  'url_dtv', 'url_romaneo', 'url_peso', 'url_evidencia'
];

// Mapa unificado de claves primarias/únicas compartido para PUSH y PULL.
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
// 0. DELETE: REPLICAR ELIMINACIONES EN SUPABASE
// ============================================================================
async function procesarEliminacionesLocales() {
  console.log('--- [DELETE] Replicando bajas locales en la nube ---');

  // CASO A: Entorno Escritorio (SQLite)
  if (esEntornoNode && db) {
    const existeTabla = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='local_eliminaciones_pendientes'
    `).get();
    
    if (!existeTabla) return;

    const bajas = db.prepare(`SELECT * FROM local_eliminaciones_pendientes ORDER BY id ASC`).all();
    if (bajas.length === 0) return;

    for (const baja of bajas) {
      try {
        const clienteSupabase = baja.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
        let query = clienteSupabase.from(baja.tabla_remota).delete();

        if (baja.columna_pk.includes(',')) {
          let filtros = {};
          try { filtros = JSON.parse(baja.valor_pk); } catch(e) { continue; }
          for (const [col, val] of Object.entries(filtros)) {
            query = query.eq(col, val);
          }
        } else {
          query = query.eq(baja.columna_pk, baja.valor_pk);
        }

        const { error } = await query;
        if (!error) {
          db.prepare(`DELETE FROM local_eliminaciones_pendientes WHERE id = ?`).run(baja.id);
          console.log(`  ✓ [DELETE OK] ${baja.tabla_remota} -> ${baja.columna_pk} = ${baja.valor_pk}`);
        } else {
          console.error(`  ❌ Error al eliminar en ${baja.tabla_remota}:`, error.message);
        }
      } catch (err) {
        console.error(`Error procesando baja ${baja.id}:`, err.message);
      }
    }
    return;
  }

  // CASO B: Entorno Web (LocalStorage)
  try {
    const cola = JSON.parse(localStorage.getItem('local_eliminados_pendientes') || '[]');
    if (cola.length === 0) return;

    if (!supabaseCampo && window._clientCampo) supabaseCampo = window._clientCampo;
    if (!supabaseCosecha && window._clientCosecha) supabaseCosecha = window._clientCosecha;

    const pendientesRestantes = [];
    for (const item of cola) {
      const clienteSupabase = item.proyecto === 'cosecha' ? supabaseCosecha : supabaseCampo;
      if (!clienteSupabase) {
        pendientesRestantes.push(item);
        continue;
      }

      let query = clienteSupabase.from(item.tabla_remota).delete();
      if (item.columna_pk.includes(',')) {
        let filtros = {};
        try { filtros = JSON.parse(item.valor_pk); } catch(e) { continue; }
        for (const [col, val] of Object.entries(filtros)) {
          query = query.eq(col, val);
        }
      } else {
        query = query.eq(item.columna_pk, item.valor_pk);
      }

      const { error } = await query;
      if (!error) {
        console.log(`  ✓ [DELETE WEB OK] ${item.tabla_remota} -> ${item.columna_pk} = ${item.valor_pk}`);
      } else {
        console.error(`  ❌ Error al eliminar en Web (${item.tabla_remota}):`, error.message);
        pendientesRestantes.push(item);
      }
    }
    localStorage.setItem('local_eliminados_pendientes', JSON.stringify(pendientesRestantes));
  } catch (e) {
    console.error("Error procesando eliminaciones en Web:", e);
  }
}

// ============================================================================
// 1. PUSH: SUBIR CAMBIOS LOCALES PENDIENTES (sincronizado = 0)
// ============================================================================
async function subirCambiosLocales() {
  console.log('--- [PUSH] Subiendo cambios locales no sincronizados ---');

  if (!esEntornoNode) {
    if (!supabaseCampo && window._clientCampo) supabaseCampo = window._clientCampo;
    if (!supabaseCosecha && window._clientCosecha) supabaseCosecha = window._clientCosecha;
    if (!tablasConfig || tablasConfig.length === 0) tablasConfig = window.TABLAS_CONFIG || [];
  }

  for (const tabla of tablasConfig) {
    try {
      const clienteSupabase = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      if (!clienteSupabase) continue;

      let pendientes = [];

      // 1. Obtener registros pendientes locales
      if (esEntornoNode && db) {
        pendientes = db.prepare(`SELECT * FROM ${tabla.local} WHERE sincronizado = 0`).all();
      } else {
        const crudo = localStorage.getItem(tabla.local);
        if (crudo) {
          const todos = JSON.parse(crudo);
          pendientes = todos.filter(r => r.sincronizado === 0 || r.sincronizado === '0' || r.sincronizado === false);
        }
      }

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

        // Gestión de archivos adjuntos solo en Node (Escritorio)
        if (esEntornoNode && fs && tabla.local === 'local_despachos_produccion') {
          for (let col of columnasFotosDespachos) {
            let pathLocal = row[col];
            if (pathLocal && fs.existsSync(pathLocal)) {
              try {
                const fileBuffer = fs.readFileSync(pathLocal);
                const ext = path.extname(pathLocal) || '.jpg';
                const fileName = `remito_${row.remito || 'sin_remito'}_${col}_${Date.now()}${ext}`;

                const { data, error: storageErr } = await clienteSupabase.storage
                  .from('despachos')
                  .upload(fileName, fileBuffer, { contentType: 'image/jpeg', upsert: true });

                if (!storageErr && data) {
                  payloadNube[col] = fileName;
                }
              } catch (fErr) {
                console.warn(`Error leyendo archivo local ${pathLocal}:`, fErr.message);
              }
            }
          }
        }

        const { error: dbErr } = await clienteSupabase
          .from(tabla.remoto)
          .upsert(payloadNube, { onConflict: onConflictKey });

        if (!dbErr) {
          const pkValores = pkCols.map(col => row[col]);

          if (esEntornoNode && db) {
            const whereClausulaPk = pkCols.map(col => `${col} = ?`).join(' AND ');
            db.prepare(`UPDATE ${tabla.local} SET sincronizado = 1 WHERE ${whereClausulaPk}`)
              .run(...pkValores);
          } else {
            // Actualizar LocalStorage Web
            const listaLocal = JSON.parse(localStorage.getItem(tabla.local) || '[]');
            const index = listaLocal.findIndex(item => pkCols.every(col => String(item[col]) === String(row[col])));
            if (index !== -1) {
              listaLocal[index].sincronizado = 1;
              localStorage.setItem(tabla.local, JSON.stringify(listaLocal));
            }
          }
            
          console.log(`   ✓ [PUSH OK] ${tabla.remoto} -> PK (${pkCols.join(',')}): ${pkValores.join(',')}`);
        } else {
          console.error(`   ❌ Error al subir registro en ${tabla.remoto}:`, dbErr.message);
        }
      }
    } catch (err) {
      console.error(`Error en PUSH para tabla ${tabla.local}:`, err.message);
    }
  }
}

// ============================================================================
// 2. PULL: BAJAR Y FUSIONAR TABLAS DESDE LA NUBE
// ============================================================================
async function sincronizarTodo() {
  console.log('--- [PULL] Descargando y conciliando cambios de la nube ---');

  if (!esEntornoNode) {
    if (!supabaseCampo && window._clientCampo) supabaseCampo = window._clientCampo;
    if (!supabaseCosecha && window._clientCosecha) supabaseCosecha = window._clientCosecha;
    if (!tablasConfig || tablasConfig.length === 0) tablasConfig = window.TABLAS_CONFIG || [];
  }

  // Desactivar trigger temporal en Escritorio
  if (esEntornoNode && db) {
    try { db.prepare(`UPDATE local_sync_estado SET en_pull = 1 WHERE id = 1`).run(); } catch(e) {}
  }

  try {
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

        let pkColumna = mapaClavesEspeciales[tabla.local] || 'id';
        const pkColumnas = Array.isArray(pkColumna) ? pkColumna : [pkColumna];

        // ----------------------------------------------------
        // RAMA A: Escritorio (SQLite)
        // ----------------------------------------------------
        if (esEntornoNode && db) {
          const pragma = db.prepare(`PRAGMA table_info(${tabla.local})`).all();
          const columnasLocales = pragma.map(col => col.name);
          const tieneColumnaSincro = columnasLocales.includes('sincronizado');

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
              } 
              else if (registroLocalPrevio.sincronizado === 1) {
                const asignacionesUpdate = columnasBase.map(col => `${col} = ?`).join(', ');
                const valores = columnasBase.map(col => typeof filaNube[col] === 'object' && filaNube[col] !== null ? JSON.stringify(filaNube[col]) : filaNube[col]);
                valores.push(...pkValores);

                db.prepare(`UPDATE ${tabla.local} SET ${asignacionesUpdate} WHERE ${whereClausulaPk}`).run(valores);
              }
            }
          });

          transaccionMerge();
          console.log(`✓ [SQLite PULL] Tabla ${tabla.local} sincronizada.`);
        } 
        // ----------------------------------------------------
        // RAMA B: Web (LocalStorage)
        // ----------------------------------------------------
        else {
          // Marcamos todos los datos bajados de la nube con sincronizado = 1
          const datosProcesados = dataSupabase.map(item => ({
            ...item,
            sincronizado: 1
          }));
          localStorage.setItem(tabla.local, JSON.stringify(datosProcesados));
          console.log(`✓ [WEB PULL] ${tabla.local} guardada en localStorage (${datosProcesados.length} filas).`);
        }

      } catch (err) {
        console.error(`Fallo en el merge de la tabla ${tabla.local}:`, err.message);
      }
    }
  } finally {
    if (esEntornoNode && db) {
      try { db.prepare(`UPDATE local_sync_estado SET en_pull = 0 WHERE id = 1`).run(); } catch(e) {}
    }
  }
}

// ============================================================================
// 3. MEDIA: DESCARGAR ARCHIVOS ADJUNTOS FALTANTES
// ============================================================================
async function descargarArchivosMedia() {
  if (!esEntornoNode || !db || !fs) return;
  console.log("--- [MEDIA] Verificando y descargando imágenes faltantes ---");
  
  try {
    const despachos = db.prepare(`
      SELECT url_precinto, url_patente, url_camioncarga, url_dtv, url_romaneo, url_peso, url_evidencia 
      FROM local_despachos_produccion
    `).all();

    const camposEvidencias = [
      'url_precinto', 'url_patente', 'url_camioncarga', 
      'url_dtv', 'url_romaneo', 'url_peso', 'url_evidencia'
    ];

    const rutasAProcesar = new Set();
    despachos.forEach(row => {
      camposEvidencias.forEach(campo => {
        const val = row[campo];
        if (val && typeof val === 'string' && val.trim().length > 0) {
          let rutaLimpia = val.trim().replace(/^file:\/\/\//, '').replace(/\\/g, '/');
          rutasAProcesar.add(rutaLimpia);
        }
      });
    });

    const clienteSupabaseMedia = supabaseCosecha || supabaseCampo;

    for (const rutaRelativa of rutasAProcesar) {
      if (!rutaRelativa || typeof rutaRelativa !== 'string') continue;
      if (rutaRelativa.startsWith('http') || rutaRelativa.startsWith('data:')) continue;

      const rutaAbsoluta = path.join(process.cwd(), 'despachos_media', rutaRelativa);
      if (fs.existsSync(rutaAbsoluta)) continue;

      const carpetaContenedora = path.dirname(rutaAbsoluta);
      if (!fs.existsSync(carpetaContenedora)) {
        fs.mkdirSync(carpetaContenedora, { recursive: true });
      }

      try {
        const { data, error } = await clienteSupabaseMedia.storage
          .from('despachos')
          .download(rutaRelativa);

        if (!error && data) {
          const buffer = Buffer.from(await data.arrayBuffer());
          fs.writeFileSync(rutaAbsoluta, buffer);
          console.log(`✓ Imagen guardada localmente: ${rutaRelativa}`);
        }
      } catch (errFile) {
        console.error(`Error al descargar archivo ${rutaRelativa}:`, errFile.message);
      }
    }
  } catch (e) {
    console.error("❌ Error general procesando descarga de media:", e.message);
  }
}

// ============================================================================
// 4. ORQUESTADOR PRINCIPAL
// ============================================================================
async function ejecutarSincronizacionCompleta() {
  console.time('Tiempo Total Sincronización');
  try {
    await procesarEliminacionesLocales(); // 1. Replicar bajas pendientes
    await subirCambiosLocales();           // 2. Subir inserts/updates (PUSH)
    await sincronizarTodo();               // 3. Traer datos remotos (PULL)
    if (esEntornoNode) {
      await descargarArchivosMedia();      // 4. Traer adjuntos físicos (Solo PC)
    }
    console.log('✅ ¡Sincronización unificada finalizada con éxito!');
  } catch (err) {
    console.error('❌ Error en el ciclo unificado de sincronización:', err);
  } finally {
    console.timeEnd('Tiempo Total Sincronización');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    procesarEliminacionesLocales,
    subirCambiosLocales,
    sincronizarTodo,
    descargarArchivosMedia,
    ejecutarSincronizacionCompleta
  };
} else {
  window.procesarEliminacionesLocales = procesarEliminacionesLocales;
  window.subirCambiosLocales = subirCambiosLocales;
  window.sincronizarTodo = sincronizarTodo;
  window.ejecutarSincronizacionCompleta = ejecutarSincronizacionCompleta;
}