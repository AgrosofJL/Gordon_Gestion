const fs = require('fs');
const path = require('path');
const { db } = require('./bases.js'); 
const { supabaseCampo, supabaseCosecha } = require('./conexion.js'); 
const tablasConfig = require('./tablas_lista.js'); 
const pathModule = path;

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
  // Estas columnas viven además en local_p_legajo_datos (tabla nueva, vinculada
  // por legajo) y se sincronizan desde ahí. Se excluyen acá para no tocar el
  // esquema de p_nomina_personal en Supabase, que usan otras apps.
  'local_p_nomina_personal': [
    'fecha_nacimiento', 'estado_civil', 'nacionalidad', 'domicilio', 'cp', 'localidad', 'provincia',
    'telefono', 'email', 'domicilio_notif', 'beneficiario_nombre', 'beneficiario_dni',
    'beneficiario_parentesco', 'beneficiario_domicilio', 'beneficiario_localidad', 'beneficiario_provincia'
  ]
};

// ============================================================================
// 1. PUSH: SUBIR CAMBIOS LOCALES PENDIENTES (sincronizado = 0)
// ============================================================================
// ============================================================================
// 1. PUSH: SUBIR CAMBIOS LOCALES PENDIENTES (sincronizado = 0)
// ============================================================================
async function subirCambiosLocales() {
  console.log('--- [PUSH] Subiendo cambios locales no sincronizados ---');

  for (const tabla of tablasConfig) {
    try {
      const clienteSupabase = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      
      const pendientes = db.prepare(`SELECT * FROM ${tabla.local} WHERE sincronizado = 0`).all();
      if (pendientes.length === 0) continue;

      console.log(`Subiendo ${pendientes.length} registros pendientes de: ${tabla.local}...`);

      let pk = mapaClavesEspeciales[tabla.local] || 'reg_local';
      let pkCols = Array.isArray(pk) ? pk : [pk];
      let onConflictKey = Array.isArray(pk) ? pk.join(',') : pk;

      for (let row of pendientes) {
        let payloadNube = { ...row };

        // 1. Quitar banderas de control exclusivamente locales
        delete payloadNube.sincronizado;
        delete payloadNube.hora_volcado; // Usado solo para cálculo local de ritmos

        // 2. Si la PK no incluye 'id' o 'id' viene en 0/null/undefined, lo eliminamos
        if (!pkCols.includes('id') && payloadNube.hasOwnProperty('id')) {
          delete payloadNube.id;
        } else if (payloadNube.id === 0 || payloadNube.id === null || payloadNube.id === undefined) {
          delete payloadNube.id;
        }

        // 3. Limpiar columnas excluidas explícitamente por esquema
        for (const colExcluida of (columnasExcluidasPorTabla[tabla.local] || [])) {
          delete payloadNube[colExcluida];
        }

        // 4. Gestión especial de adjuntos / imágenes
        if (tabla.local === 'local_despachos_produccion') {
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

        // 5. Enviar payload limpio a Supabase
        const { error: dbErr } = await clienteSupabase
          .from(tabla.remoto)
          .upsert(payloadNube, { onConflict: onConflictKey });

        // 6. Si subió bien, actualizamos el estado sincronizado = 1 en SQLite
        if (!dbErr) {
          const whereClausulaPk = pkCols.map(col => `${col} = ?`).join(' AND ');
          const pkValores = pkCols.map(col => row[col]);

          db.prepare(`UPDATE ${tabla.local} SET sincronizado = 1 WHERE ${whereClausulaPk}`)
            .run(...pkValores);
            
          console.log(`  ✓ [PUSH OK] ${tabla.remoto} -> PK (${pkCols.join(',')}): ${pkValores.join(',')}`);
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
// 2. PULL: BAJAR Y FUSIONAR TABLAS DESDE LA NUBE
// ============================================================================
async function sincronizarTodo() {
  console.log('--- [PULL] Descargando y conciliando cambios de la nube ---');

  for (const tabla of tablasConfig) {
    try {
      const clienteSupabase = tabla.proyecto === 'campo' ? supabaseCampo : supabaseCosecha;
      
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
          } 
          else if (registroLocalPrevio.sincronizado === 1) {
            const asignacionesUpdate = columnasBase.map(col => `${col} = ?`).join(', ');
            const valores = columnasBase.map(col => typeof filaNube[col] === 'object' && filaNube[col] !== null ? JSON.stringify(filaNube[col]) : filaNube[col]);
            valores.push(...pkValores);

            db.prepare(`UPDATE ${tabla.local} SET ${asignacionesUpdate} WHERE ${whereClausulaPk}`).run(valores);
          }
          else {
            continue;
          }
        }
      });

      transaccionMerge();
      console.log(`✓ Tabla ${tabla.local} sincronizada y conciliada correctamente.`);

    } catch (err) {
      console.error(`Fallo en el merge de la tabla ${tabla.local}:`, err.message);
    }
  }
}

///* ESTO LO MODIFIQUE */
/* ESTO LO MODIFIQUE: Descarga y concilia las fotos de despachos guardadas desde la app móvil */
/* ESTO LO MODIFIQUE */
async function descargarArchivosMedia() {
  console.log("--- [MEDIA] Verificando y descargando imágenes faltantes ---");
  
  if (!db) return;

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

    // ACA ES LO NUEVO: Se determina el cliente Supabase correspondiente para despachos (cosecha)
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
        /* ESTO LO MODIFIQUE: Se cambia 'supabase' por 'clienteSupabaseMedia' y bucket 'despachos' */
        const { data, error } = await clienteSupabaseMedia.storage
          .from('despachos')
          .download(rutaRelativa);

        if (error) {
          console.warn(`⚠️ No se pudo descargar del bucket Supabase (${rutaRelativa}):`, error.message);
          continue;
        }

        if (data) {
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
// 4. ORQUESTADOR PRINCIPAL (LLAMADO DESDE EL BOTÓN "SINCRONIZAR")
// ============================================================================
async function ejecutarSincronizacionCompleta() {
  console.time('Tiempo Total Sincronización');
  try {
    await subirCambiosLocales();      // 1. Subir lo local pendiente (PUSH)
    await sincronizarTodo();          // 2. Traer y fusionar datos remotos (PULL)
    await descargarArchivosMedia();   // 3. Traer archivos adjuntos físicos (MEDIA)
    console.log('✅ ¡Sincronización unificada finalizada con éxito!');
  } catch (err) {
    console.error('❌ Error en el ciclo unificado de sincronización:', err);
  } finally {
    console.timeEnd('Tiempo Total Sincronización');
  }
}

module.exports = {
  subirCambiosLocales,
  sincronizarTodo,
  descargarArchivosMedia,
  ejecutarSincronizacionCompleta
};