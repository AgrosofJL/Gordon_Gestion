// conexion.js
const { createClient } = require('@supabase/supabase-js');

// CONFIGURACIÓN PROYECTO 1: Campo, Insumos, Labores
const SUPABASE_P1_URL = "https://zcmyglespedhcppgxwpg.supabase.co";
const SUPABASE_P1_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjbXlnbGVzcGVkaGNwcGd4d3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxODI1MTUsImV4cCI6MjA5NTc1ODUxNX0.ouoVoCa5smtHJpTRDMN1dx9dx2qLkoE0qDL5Ug9Dowc";


// CONFIGURACIÓN PROYECTO 2: Cosecha, Despachos, Recepción
const SUPABASE_P2_URL = "https://whiwwfqabpkukamcowbg.supabase.co";
const SUPABASE_P2_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoaXd3ZnFhYnBrdWthbWNvd2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NTI3MDgsImV4cCI6MjA5MzQyODcwOH0.XK-pOH-LuKOoekko6mAoefd6jxAdk5lUdpeuMyzLde4";

// Inicializar ambos clientes
const supabaseCampo = createClient(SUPABASE_P1_URL, SUPABASE_P1_ANON_KEY);
const supabaseCosecha = createClient(SUPABASE_P2_URL, SUPABASE_P2_ANON_KEY);

module.exports = {
  supabaseCampo,
  supabaseCosecha
};