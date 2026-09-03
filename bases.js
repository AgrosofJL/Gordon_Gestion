
// bases.js
const Database = require('better-sqlite3');
const { DB_PATH } = require('./db_path.js');
const db = new Database(DB_PATH);
const { supabaseCampo, supabaseCosecha } = require('./conexion');
 
// Inicialización de todas las tablas reflejo con sincronizado = 0
function inicializarTablasLocales() {
  db.transaction(() => {

    // ==========================================
    // AUTENTICACIÓN Y SESIÓN
    // ==========================================

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
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON local_usuarios (activo);`).run();

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

    // Datos de la empresa usados para completar los formularios oficiales de legajo
    // (Ficha de Ingreso, ART, Seguro de Vida, etc.). Editable desde Personal > Configurar Empresa,
    // para no tener que tocar código si cambia la ART, la aseguradora, el representante, etc.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_config_empresa (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        razon_social TEXT,
        cuit TEXT,
        domicilio_legal TEXT,
        domicilio_establecimiento TEXT,
        localidad_establecimiento TEXT,
        provincia_establecimiento TEXT,
        cp_establecimiento TEXT,
        representante TEXT,
        cargo_representante TEXT,
        art_nombre TEXT,
        art_contrato TEXT,
        seguro_aseguradora TEXT,
        seguro_poliza TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`
      INSERT OR IGNORE INTO local_config_empresa (
        id, razon_social, cuit, domicilio_legal, domicilio_establecimiento,
        localidad_establecimiento, provincia_establecimiento, cp_establecimiento,
        representante, cargo_representante, art_nombre, art_contrato, seguro_aseguradora, seguro_poliza
      ) VALUES (
        1, 'CECO S.A.', '30-68958736-0', 'España 252, Ciudad de Cipolletti, Provincia de Río Negro', 'Ruta Nac. 22 - Km 1050',
        'Chimpay', 'Rio Negro', '8364',
        'José Miguel Quiroga', 'Director', 'PREVENCION ART S.A.', '699275', 'MAPFRE ARGENTINA SEGUROS DE VIDA S.A.', '110-0052840-01'
      )
    `).run();

    // ==========================================
    // PROYECTO 1: CAMPO, INSUMOS, LABORES
    // ==========================================

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_0_unidades_negocio (
        id INTEGER PRIMARY KEY,
        unidad_negocio TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_0_un_sinc ON local_0_unidades_negocio (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_1_ciclo_contable (
        id INTEGER PRIMARY KEY,
        fecha_desde TEXT,
        fecha_hasta TEXT,
        ciclo TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_1_ciclo_sinc ON local_1_ciclo_contable (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_c_consumos_combustibles (
        id INTEGER,
        reg_local TEXT,
        fecha TEXT,
        cod_maq INTEGER,
        maquina TEXT,
        responsable TEXT,
        cantidad REAL,
        labor TEXT,
        centro_costo TEXT,
        litros REAL,
        cisterna TEXT,
        unidad_negocio TEXT,
        campaña TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_combustibles_sinc ON local_c_consumos_combustibles (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_combustibles_fecha ON local_c_consumos_combustibles (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_combustibles_maq ON local_c_consumos_combustibles (maquina);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_i_insumos_catalogo (
        id TEXT,
        reg_local TEXT,
        rubro TEXT,
        sub_rubro TEXT,
        articulo TEXT,
        descripcion TEXT,
        descripcion1 TEXT,
        descripcion2 TEXT,
        tc REAL,
        ti REAL,
        unidad TEXT,
        habilitado TEXT DEFAULT 'SI',
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cat_insumos_sinc ON local_i_insumos_catalogo (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cat_insumos_art ON local_i_insumos_catalogo (articulo);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cat_insumos_rubro ON local_i_insumos_catalogo (rubro, sub_rubro);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_i_insumos_detalle (
        id INTEGER,
        reg_local TEXT,
        reg_ingr TEXT,
        reg_apli TEXT,
        reg_comb TEXT,
        reg_egreso TEXT,
        reg_mant TEXT,
        articulo TEXT,
        cantidad REAL,
        imp_uni REAL,
        cotizacion REAL,
        imp_uni_usd REAL,
        maquina TEXT,
        cod_parcela INTEGER,
        parcela TEXT,
        variedad INTEGER,
        ubicación TEXT,
        fila TEXT,
        centro_costo TEXT,
        operario TEXT,
        campaña TEXT,
        unidad_negocio TEXT,
        articulo_rubro TEXT,
        art_subrubro TEXT,
        tc REAL,
        ti REAL,
        ciclo_contable TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_det_sinc ON local_i_insumos_detalle (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_det_art ON local_i_insumos_detalle (articulo);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_det_parcela ON local_i_insumos_detalle (parcela);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_i_insumos_movimientos (
        id INTEGER,
        reg_local TEXT,
        reg_ing TEXT,
        fecha TEXT,
        despacho TEXT,
        recibio TEXT,
        articulo TEXT,
        descripcion TEXT,
        tc TEXT,
        ti TEXT,
        cantidad REAL,
        imp_uni_usd REAL,
        cotizacion REAL,
        fec_venc TEXT,
        estado TEXT,
        deposito_origen TEXT,
        destino TEXT,
        remito TEXT,
        sub_rubro TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_mov_sinc ON local_i_insumos_movimientos (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_mov_fecha ON local_i_insumos_movimientos (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_mov_art ON local_i_insumos_movimientos (articulo);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_i_insumos_ordenes_Compra (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reg_local TEXT,
        fecha TEXT,
        orden_compra INTEGER,
        proveedor TEXT,
        articulo TEXT,
        cantidad REAL,
        imp_uni_usd REAL,
        cotizacion REAL,
        estado TEXT,
        factura TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_oc_sinc ON local_i_insumos_ordenes_Compra (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_oc_nro ON local_i_insumos_ordenes_Compra (orden_compra);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_oc_prov ON local_i_insumos_ordenes_Compra (proveedor);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_i_insumos_rubros (
        id_rubro INTEGER PRIMARY KEY AUTOINCREMENT,
        rubro TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_rubros_sinc ON local_i_insumos_rubros (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_i_insumos_subrubros (
        cod INTEGER PRIMARY KEY AUTOINCREMENT,
        rubro TEXT,
        sub_rubro TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_subrubros_sinc ON local_i_insumos_subrubros (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_i_insumosingresos (
        id INTEGER,
        reg_local TEXT,
        reg_orden TEXT,
        fecha TEXT,
        remito TEXT,
        orden_compra TEXT,
        proveedor TEXT,
        articulo TEXT,
        descripcion TEXT,
        tc REAL,
        ti REAL,
        cantidad REAL,
        imp_uni_usd REAL,
        cotizacion REAL,
        fec_venc TEXT,
        estado TEXT,
        recibio TEXT,
        desposito TEXT,
        habilitado TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_ing_sinc ON local_i_insumosingresos (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_ing_fecha ON local_i_insumosingresos (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ins_ing_remito ON local_i_insumosingresos (remito);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_m_labores_maquinaria (
        id INTEGER,
        reg_local TEXT,
        fecha TEXT,
        operario TEXT,
        cod_maq INTEGER,
        maquina TEXT,
        cod_sector INTEGER,
        sector TEXT,
        labor TEXT,
        horas REAL,
        centro_costo TEXT,
        unidad_negocio TEXT,
        ciclo_contable TEXT,
        campaña TEXT,
        sup_trab REAL,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_lab_maq_sinc ON local_m_labores_maquinaria (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_lab_maq_fecha ON local_m_labores_maquinaria (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_lab_maq_maq ON local_m_labores_maquinaria (maquina);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_aplicacionesOrdenes (
        cabecera INTEGER PRIMARY KEY,
        fecha TEXT,
        orden INTEGER,
        ref INTEGER,
        tipo_aplicacion TEXT,
        motivo_aplicacion TEXT,
        parcelas TEXT,
        estado TEXT,
        turno INTEGER,
        zona TEXT,
        aplicado_con TEXT,
        maquina_usada TEXT,
        tractor_usado TEXT,
        centro_costo TEXT,
        unidad_negocio TEXT,
        volumen_aplic NUMERIC,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_apli_ord_sinc ON local_p_aplicacionesOrdenes (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_apli_ord_fecha ON local_p_aplicacionesOrdenes (fecha);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_centroCostos (
        id INTEGER PRIMARY KEY,
        centro_costo TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cc_sinc ON local_p_centroCostos (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_labores_valorizado (
        id INTEGER PRIMARY KEY,
        fecha_desde TEXT,
        fecha_hasta TEXT,
        sector TEXT,
        parcela TEXT,
        ubicacion TEXT,
        macro_labor TEXT,
        labor TEXT,
        pago_por TEXT,
        importe_uni NUMERIC,
        estado TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_lab_val_sinc ON local_p_labores_valorizado (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_macro_labores (
        id INTEGER PRIMARY KEY,
        reg_local TEXT,
        macro_labor TEXT,
        labor TEXT,
        unidad_negocio TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_macro_lab_sinc ON local_p_macro_labores (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_personal_historial (
        id INTEGER,
        reg_local INTEGER,
        legajo TEXT,
        nombre_completo TEXT,
        dni INTEGER,
        fecha_desde TEXT,
        fecha_hasta TEXT,
        importe_hora NUMERIC,
        forma_pago TEXT,
        pago_mes NUMERIC,
        centro_costo TEXT,
        negocio TEXT,
        jornal REAL,
        imp_hs_50 NUMERIC,
        imp_hs_100 NUMERIC,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pers_hist_sinc ON local_p_personal_historial (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pers_hist_legajo ON local_p_personal_historial (legajo);`).run();

    // Normas de conducta (Campo/Empaque) editables desde el módulo de Personal.
    // Si no hay filas cargadas para un "tipo", la pantalla usa un texto por defecto
    // predefinido en código; en cuanto el operario guarda al menos una fila acá,
    // esas filas reemplazan al texto por defecto para ese tipo.
    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_normas_conducta (
        id INTEGER,
        reg_local TEXT,
        tipo TEXT,
        seccion TEXT,
        orden INTEGER,
        texto TEXT,
        detalle TEXT,
        activo INTEGER DEFAULT 1,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_normas_sinc ON local_p_normas_conducta (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_normas_tipo ON local_p_normas_conducta (tipo, seccion);`).run();

        db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_personal_sanciones (
        id INTEGER PRIMARY KEY,
        reg_local TEXT,
        empleado TEXT,
        dni INTEGER,
        legajo INTEGER,
        fecha_san TEXT,
        sancion_tipo TEXT,
        incurrencia TEXT,
        dias REAL,
        aplico TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();

    db.prepare(`
  CREATE TABLE IF NOT EXISTS local_p_proveedores (
    id INTEGER PRIMARY KEY,
    proveedor TEXT,
    cuit TEXT,
    localidad TEXT,
    actividad TEXT,
    sincronizado INTEGER DEFAULT 0
  )
`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_prov_sinc ON local_p_proveedores (sincronizado);`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_prov_nombre ON local_p_proveedores (proveedor);`).run();

// CORREGIDO: Sintaxis limpia sin comillas sueltas
db.prepare(`
  CREATE TABLE IF NOT EXISTS local_proveedores_cuentas (
    id INTEGER PRIMARY KEY,
    proveedor TEXT,
    razon_social TEXT,
    cuit TEXT,
    localidad TEXT,
    actividad TEXT,
    sincronizado INTEGER DEFAULT 0,
    reg_local TEXT,
    condicion_iva TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    condicion_pago_dias INTEGER DEFAULT 0,
    habilitado TEXT DEFAULT 'SI'
  )
`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_prov_cta_sinc ON local_proveedores_cuentas (sincronizado);`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_prov_cta_nombre ON local_proveedores_cuentas (proveedor);`).run();


    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_ctb_movimientos_cc (
        id INTEGER PRIMARY KEY,
        reg_local TEXT,
        proveedor TEXT,
        fecha TEXT,
        tipo TEXT,
        numero_comprobante TEXT,
        concepto TEXT,
        debe NUMERIC DEFAULT 0,
        haber NUMERIC DEFAULT 0,
        medio_pago TEXT,
        fecha_vencimiento TEXT,
        observaciones TEXT,
        operario TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ctb_mov_sinc ON local_ctb_movimientos_cc (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ctb_mov_proveedor ON local_ctb_movimientos_cc (proveedor);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ctb_mov_fecha ON local_ctb_movimientos_cc (fecha);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_recetas_aplicaciones (
        registro INTEGER,
        cabecera INTEGER,
        orden INTEGER,
        ref INTEGER,
        fecha TEXT,
        tipo_aplicacion TEXT,
        motivo_aplicacion TEXT,
        producto TEXT,
        principio_activo INTEGER,
        concentracion INTEGER,
        dosis NUMERIC,
        unidad_dosis TEXT,
        dosis_x_ha NUMERIC,
        responsable TEXT,
        dosis_maq NUMERIC,
        unidad_negocio TEXT,
        centro_costo TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (registro, cabecera)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_recetas_sinc ON local_p_recetas_aplicaciones (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_recetas_cab ON local_p_recetas_aplicaciones (cabecera);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_tipo_control_aplicaciones (
        codigo INTEGER PRIMARY KEY,
        tipo TEXT,
        tipo_control TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tipo_ctrl_sinc ON local_p_tipo_control_aplicaciones (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_par_depositos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deposito TEXT,
        zona TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_depositos_sinc ON local_par_depositos (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_par_maquinaria_herramientas (
        id INTEGER PRIMARY KEY,
        tipo TEXT,
        unidad TEXT,
        motor TEXT,
        chasis TEXT,
        modelo_a INTEGER,
        serie TEXT,
        potencia TEXT,
        propietario TEXT,
        codigo_interno TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_maq_herr_sinc ON local_par_maquinaria_herramientas (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_r_aplicaciones_fol_fert (
        registro INTEGER,
        reg_aplic TEXT,
        cab_aplic INTEGER,
        fecha TEXT,
        parcela TEXT,
        valvula_n TEXT,
        orden INTEGER,
        ref INTEGER,
        producto TEXT,
        dosis_ha NUMERIC,
        principio_activo TEXT,
        concentracion TEXT,
        tipo_aplicacion TEXT,
        motivo_aplicacion TEXT,
        cultivo TEXT,
        variedad TEXT,
        litros_aplic NUMERIC,
        consumo_prod NUMERIC,
        horas_aplic NUMERIC,
        sup_aplic NUMERIC,
        aplico TEXT,
        maquina TEXT,
        tractor TEXT,
        unidad_negocio TEXT,
        centro_costo TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (registro, reg_aplic, cab_aplic)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_apli_fol_sinc ON local_r_aplicaciones_fol_fert (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_apli_fol_fecha ON local_r_aplicaciones_fol_fert (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_apli_fol_parcela ON local_r_aplicaciones_fol_fert (parcela);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_r_campo_riego (
        id INTEGER,
        reg_local TEXT,
        fecha TEXT,
        parcela TEXT,
        valvula TEXT,
        cultivo TEXT,
        variedad TEXT,
        sup_riego NUMERIC,
        horas NUMERIC,
        lamina NUMERIC,
        total_mm NUMERIC,
        usuario TEXT,
        periodo INTEGER,
        operacion REAL,
        comentario TEXT,
        tipo_riego TEXT,
        centro_costo TEXT,
        unidad_negocio TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_riego_sinc ON local_r_campo_riego (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_riego_fecha ON local_r_campo_riego (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_riego_parcela ON local_r_campo_riego (parcela);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_r_jornada_trabajo (
        id INTEGER,
        reg_local TEXT,
        fecha TEXT,
        legajo TEXT,
        empleado TEXT,
        dni INTEGER,
        macro_labor TEXT,
        labor TEXT,
        sector TEXT,
        parcela TEXT,
        horas NUMERIC,
        forma_pago TEXT,
        jornal NUMERIC,
        hora_extra NUMERIC,
        imp_uni NUMERIC,
        total NUMERIC,
        en_recibo NUMERIC,
        fuera_recibo NUMERIC,
        centro_costo TEXT,
        unidad_negocio TEXT,
        campana TEXT,
        ciclo_contable TEXT,
        responsable TEXT,
        estado TEXT,
        total_hs NUMERIC,
        rendimiento REAL,
        unidad_destajo TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_jornada_sinc ON local_r_jornada_trabajo (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_jornada_fecha ON local_r_jornada_trabajo (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_jornada_legajo ON local_r_jornada_trabajo (legajo);`).run();

    
    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_r_mantenimiento_maquinaria (
        id INTEGER,
        reg_local TEXT,
        fecha TEXT,
        maquina TEXT,
        responsable TEXT,
        tipo_mant TEXT,
        mantenimiento TEXT,
        cantidad NUMERIC,
        insumo TEXT,
        imp_uni NUMERIC,
        hs_km NUMERIC,
        proximo_ser NUMERIC,
        centro_costo TEXT,
        unidad_negocio TEXT,
        ciclo_contable TEXT,
        campana TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_mant_maq_sinc ON local_r_mantenimiento_maquinaria (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_mant_maq_fecha ON local_r_mantenimiento_maquinaria (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_mant_maq_maq ON local_r_mantenimiento_maquinaria (maquina);`).run();

     db.prepare(`
      CREATE TABLE IF NOT EXISTS local_sys_permisos_usuario(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT NOT NULL,
        rol TEXT,
        menu TEXT,
        sub_menu TEXT,
        estado INTEGER DEFAULT 1,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();

    // ==========================================
    // PROYECTO 2: COSECHA Y LOGÍSTICA
    // ==========================================

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_ciclos_cosecha (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ciclo TEXT NOT NULL,
        fecha_desde TEXT NOT NULL,
        fecha_hasta TEXT NOT NULL,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_ciclos_cos_sinc ON local_ciclos_cosecha (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_cosecha_estimacion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reg_local TEXT,
        cod_marco INTEGER,
        cuadro TEXT,
        fila INTEGER,
        sup REAL,
        variedad TEXT,
        mtrs_surco REAL,
        ciclo INTEGER,
        estado TEXT,
        kg_prom REAL,
       cant_pila INTEGER,
      sincronizado INTEGER DEFAULT 0
  )
`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_cos_est_sinc ON local_cosecha_estimacion (sincronizado);`).run();


    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_config_descargas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rol TEXT UNIQUE NOT NULL,
        tablas_json TEXT NOT NULL,
        menus TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cfg_desc_sinc ON local_config_descargas (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_cosecha (
        id INTEGER,
        reg_local TEXT,
        bolson_n TEXT,
        nro_unidad INTEGER PRIMARY KEY AUTOINCREMENT,
        id_ingr INTEGER,
        fecha TEXT,
        empleado TEXT,
        parcela TEXT,
        fila INTEGER,
        especie TEXT,
        variedad TEXT,
        color TEXT,
        cod_traza TEXT,
        envase TEXT,
        cantidad INTEGER,
        estado TEXT DEFAULT 'ACTIVO',
        remito INTEGER,
        usuario TEXT,
        ubicacion TEXT,
        ciclo INTEGER,
        transporte TEXT,
        fecha_despacho TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cosecha_sinc ON local_cosecha (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cosecha_fecha ON local_cosecha (fecha);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cosecha_parcela ON local_cosecha (parcela);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cosecha_remito ON local_cosecha (remito);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_descarte (
        id INTEGER,
        reg_local TEXT,
        fecha TEXT,
        variedad TEXT,
        cant NUMERIC,
        kg NUMERIC,
        productor TEXT,
        mercaderia TEXT,
        ciclo INTEGER,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_descarte_sinc ON local_descarte (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_descarte_fecha ON local_descarte (fecha);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_despachos_produccion (
        id INTEGER,
        reg_local TEXT PRIMARY KEY,
        nro_pallet TEXT,
        remito TEXT,
        id_despacho TEXT,
        fecha_despacho TEXT,
        variedad TEXT,
        calibre TEXT,
        categoria TEXT,
        kg_pallet TEXT,
        cliente TEXT,
        provincia TEXT,
        localidad TEXT,
        guia TEXT,
        transporte TEXT,
        chofer TEXT,
        ciclo TEXT,
        patentes TEXT,
        dni_chofer TEXT,
        nro_lote TEXT,
        termografo TEXT,
        url_dtv TEXT,
        url_romaneo TEXT,
        url_peso TEXT,
        url_camioncarga TEXT,
        url_patente TEXT,
        url_precinto TEXT,
        url_evidencia TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_desp_prod_sinc ON local_despachos_produccion (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_desp_prod_fecha ON local_despachos_produccion (fecha_despacho);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_desp_prod_remito ON local_despachos_produccion (remito);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_detalle_recepcion (
        reg_local TEXT PRIMARY KEY,
        bolson_n TEXT,
        nro_unidad TEXT,
        tipo TEXT,
        cant INTEGER,
        id_ingr TEXT,
        fecha TEXT,
        empleado TEXT,
        cuadro TEXT,
        fila TEXT,
        especie TEXT,
        variedad TEXT,
        cod_traza TEXT,
        kilos TEXT,
        estado TEXT DEFAULT 'ACTIVO',
        materia_prima TEXT,
        remito TEXT,
        productor TEXT,
        color TEXT,
        calidad_recepcion TEXT,
        ciclo TEXT,
        id INTEGER,
        estado_origen TEXT,
        reg_cosecha TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_det_rec_sinc ON local_detalle_recepcion (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_det_rec_remito ON local_detalle_recepcion (remito);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_det_rec_fecha ON local_detalle_recepcion (fecha);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_calibre (
        id INTEGER,
        reg_local TEXT,
        calibre TEXT,
        nombre_calibre TEXT,
        especie TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_calibre_sinc ON local_p_calibre (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_categoria (
        id INTEGER,
        reg_local TEXT,
        categoria TEXT,
        mercado TEXT,
        materia TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_categoria_sinc ON local_p_categoria (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_clientes (
        id INTEGER,
        reg_local TEXT,
        cliente TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_clientes_sinc ON local_p_clientes (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_cuadros (
        cod_parcela INTEGER PRIMARY KEY,
        sector TEXT,
        sup NUMERIC,
        nombre TEXT,
        tipo TEXT,
        negocio TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cuadros_sinc ON local_p_cuadros (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_cultivo (
        cod_esp INTEGER,
        especie TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_cultivo_sinc ON local_p_cultivo (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_embalaje (
        id INTEGER,
        reg_local TEXT,
        nombre_embalaje TEXT,
        peso_uni TEXT,
        especie TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_embalaje_sinc ON local_p_embalaje (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_inventario_plantacion (
        id_inv INTEGER PRIMARY KEY,
        cod_marco INTEGER,
        zona TEXT,
        turno_riego INTEGER,
        orientacion TEXT,
        cuadro TEXT,
        fila INTEGER,
        v_riego TEXT,
        mtrs_surco TEXT,
        sup REAL,
        variedad TEXT,
        estado TEXT,
        ciclo INTEGER,
        estado_fila TEXT,
        fecha_siembra TEXT,
        semillas_x_mtrs REAL,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_inv_plant_sinc ON local_p_inventario_plantacion (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_inv_plant_cuadro ON local_p_inventario_plantacion (cuadro);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_marcos_plantacion (
        cod_marco INTEGER PRIMARY KEY,
        cod_parcela INTEGER,
        nombre_parcela TEXT,
        SupTotal REAL,
        valvula_riego TEXT,
        lamina_riego INTEGER,
        cuadro TEXT,
        orientacion TEXT,
        nombre_zona TEXT,
        turno INTEGER,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_marcos_plant_sinc ON local_p_marcos_plantacion (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_nomina_personal (
        legajo TEXT PRIMARY KEY,
        apellido TEXT,
        nombre TEXT,
        dni INTEGER,
        cuil TEXT,
        fecha_ingreso TEXT,
        labor TEXT,
        sector TEXT,
        centro_costo TEXT,
        estado TEXT DEFAULT 'ACTIVO',
        sexo TEXT,
        reg_local TEXT,
        categoria TEXT,
        nombre_completo TEXT,
        imp_hora REAL,
        jornal REAL,
        forma_pago TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_nomina_sinc ON local_p_nomina_personal (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_nomina_dni ON local_p_nomina_personal (dni);`).run();

    // Tabla separada para los datos de legajo (DDJJ domicilio, seguro de vida, etc.).
    // Se mantiene aparte de local_p_nomina_personal a propósito: esa tabla la
    // consumen varias apps más y no queremos arriesgar su esquema remoto en
    // Supabase. Esta vincula por "legajo" (FK real del lado de Supabase).
    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_legajo_datos (
        legajo TEXT PRIMARY KEY,
        fecha_nacimiento TEXT,
        estado_civil TEXT,
        nacionalidad TEXT,
        domicilio TEXT,
        cp TEXT,
        localidad TEXT,
        provincia TEXT,
        telefono TEXT,
        email TEXT,
        domicilio_notif TEXT,
        beneficiario_nombre TEXT,
        beneficiario_dni TEXT,
        beneficiario_parentesco TEXT,
        beneficiario_domicilio TEXT,
        beneficiario_localidad TEXT,
        beneficiario_provincia TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_legajo_datos_sinc ON local_p_legajo_datos (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_productores (
        id INTEGER,
        reg_local TEXT,
        productor TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_productores_sinc ON local_p_productores (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_tipo_pallet (
        id INTEGER PRIMARY KEY,
        pallet_nombre TEXT,
        cant_env NUMERIC,
        kg_envase NUMERIC,
        tipo TEXT,
        kg_pallet NUMERIC,
        especie TEXT,
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_tipo_pallet_sinc ON local_p_tipo_pallet (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_p_variedades (
        id_var INTEGER PRIMARY KEY,
        cod_esp INTEGER,
        variedad TEXT,
        especie TEXT,
        color TEXT,
        estado TEXT DEFAULT 'ACTIVO',
        sincronizado INTEGER DEFAULT 0
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_variedades_sinc ON local_p_variedades (sincronizado);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_paletizado (
        id INTEGER,
        reg_local TEXT,
        nro_pallet TEXT,
        fecha_proc TEXT,
        cant_unidades TEXT,
        especie TEXT,
        variedad TEXT,
        color TEXT,
        embalaje TEXT,
        id_ingr TEXT,
        cliente TEXT,
        id_despacho TEXT,
        categoria TEXT,
        calibre TEXT,
        calidad TEXT,
        peso_pallet TEXT,
        peso_uni TEXT,
        estado TEXT DEFAULT 'ACTIVO',
        tipo_pallet TEXT,
        productor TEXT,
        hs_reg TEXT,
        mercado TEXT,
        cuadro TEXT,
        fila TEXT,
        ciclo TEXT,
        peso_completo NUMERIC,
        nro_lote TEXT,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (id, reg_local)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_paletizado_sinc ON local_paletizado (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_paletizado_nro ON local_paletizado (nro_pallet);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_paletizado_fecha ON local_paletizado (fecha_proc);`).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS local_recepcion (
        reg_local TEXT,
        fecha TEXT,
        remito TEXT NOT NULL,
        cantidad TEXT,
        tipo TEXT,
        transporte TEXT,
        materia_prima TEXT,
        productor TEXT,
        tara_camion TEXT,
        peso_bruto TEXT,
        peso_neto TEXT,
        ciclo TEXT,
        id INTEGER UNIQUE,
        sincronizado INTEGER DEFAULT 0,
        PRIMARY KEY (reg_local, remito)
      )
    `).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_recepcion_sinc ON local_recepcion (sincronizado);`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_recepcion_fecha ON local_recepcion (fecha);`).run();

  })();

  console.log("Todas las tablas locales e índices creados correctamente.");
}

/**
 * Agrega columnas nuevas a tablas ya existentes sin perder los datos.
 * CREATE TABLE IF NOT EXISTS no alcanza para sumar columnas a una tabla vieja,
 * por eso se revisa con PRAGMA table_info y se agrega solo lo que falte.
 */
function agregarColumnaSiNoExiste(tabla, columna, definicion) {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all().map(c => c.name);
  if (!columnas.includes(columna)) {
    db.prepare(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`).run();
  }
}

function actualizarEsquemaLegajoPersonal() {
  const nuevasColumnas = [
    ['fecha_nacimiento', 'TEXT'],
    ['estado_civil', 'TEXT'],
    ['nacionalidad', 'TEXT'],
    ['domicilio', 'TEXT'],
    ['cp', 'TEXT'],
    ['localidad', 'TEXT'],
    ['provincia', 'TEXT'],
    ['telefono', 'TEXT'],
    ['email', 'TEXT'],
    ['domicilio_notif', 'TEXT'],
    ['beneficiario_nombre', 'TEXT'],
    ['beneficiario_dni', 'TEXT'],
    ['beneficiario_parentesco', 'TEXT'],
    ['beneficiario_domicilio', 'TEXT'],
    ['beneficiario_localidad', 'TEXT'],
    ['beneficiario_provincia', 'TEXT']
  ];
  nuevasColumnas.forEach(([columna, definicion]) => {
    try { agregarColumnaSiNoExiste('local_p_nomina_personal', columna, definicion); }
    catch(e) { console.error(`Error agregando columna ${columna}:`, e); }
  });
}

// Migración única (e idempotente): copia lo que ya se hubiera cargado en las
// columnas de legajo de local_p_nomina_personal hacia local_p_legajo_datos,
// que es la tabla que la app usa de acá en adelante para esos datos. No se
// borra ni se toca nada en local_p_nomina_personal: esas columnas quedan
// congeladas ahí y excluidas del push a Supabase (ver subir.js/sincronizacion.js)
// para no romper otras apps que ya consumen esa tabla en la nube.
function migrarDatosLegajoALegajoDatos() {
  try {
    db.prepare(`
      INSERT INTO local_p_legajo_datos (
        legajo, fecha_nacimiento, estado_civil, nacionalidad, domicilio, cp, localidad, provincia,
        telefono, email, domicilio_notif, beneficiario_nombre, beneficiario_dni, beneficiario_parentesco,
        beneficiario_domicilio, beneficiario_localidad, beneficiario_provincia, sincronizado
      )
      SELECT n.legajo, n.fecha_nacimiento, n.estado_civil, n.nacionalidad, n.domicilio, n.cp, n.localidad, n.provincia,
             n.telefono, n.email, n.domicilio_notif, n.beneficiario_nombre, n.beneficiario_dni, n.beneficiario_parentesco,
             n.beneficiario_domicilio, n.beneficiario_localidad, n.beneficiario_provincia, 0
      FROM local_p_nomina_personal n
      WHERE NOT EXISTS (SELECT 1 FROM local_p_legajo_datos d WHERE d.legajo = n.legajo)
        AND (
          n.fecha_nacimiento IS NOT NULL OR n.estado_civil IS NOT NULL OR n.nacionalidad IS NOT NULL OR
          n.domicilio IS NOT NULL OR n.cp IS NOT NULL OR n.localidad IS NOT NULL OR n.provincia IS NOT NULL OR
          n.telefono IS NOT NULL OR n.email IS NOT NULL OR n.domicilio_notif IS NOT NULL OR
          n.beneficiario_nombre IS NOT NULL OR n.beneficiario_dni IS NOT NULL OR n.beneficiario_parentesco IS NOT NULL OR
          n.beneficiario_domicilio IS NOT NULL OR n.beneficiario_localidad IS NOT NULL OR n.beneficiario_provincia IS NOT NULL
        )
    `).run();
  } catch(e) { console.error('Error migrando datos de legajo a local_p_legajo_datos:', e); }
}

function obtenerProximoID(nombreTabla, nombreCampo = 'id') {
  const result = db.prepare(`SELECT MAX(${nombreCampo}) AS maximo FROM ${nombreTabla}`).get();
  return (result.maximo || 0) + 1;
}
 

 
/**
 * Genera un ID alfanumérico aleatorio de 10 caracteres.
 * Utiliza letras mayúsculas, minúsculas y números (base 62).
 * @returns {string} ID de 10 dígitos para reg_local
 */
function generarRegLocal() {
  const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let resultado = '';
  const longitud = 10;
  
  for (let i = 0; i < longitud; i++) {
    const indiceRandom = Math.floor(Math.random() * caracteres.length);
    resultado += caracteres.charAt(indiceRandom);
  }
  
  return resultado;
}
 




// Inicializar base de datos
inicializarTablasLocales();
actualizarEsquemaLegajoPersonal();
migrarDatosLegajoALegajoDatos();

 
module.exports = {
  db,
  obtenerProximoID,
  generarRegLocal
};