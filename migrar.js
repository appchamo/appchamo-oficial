import { createClient } from '@supabase/supabase-js';

// Configurações de OHIO (Antigo)
const OLD_URL = 'https://mrfippvowbudtctahgag.supabase.co';
const OLD_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZmlwcHZvd2J1ZHRjdGFoZ2FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3OTY5MSwiZXhwIjoyMDg2OTU1NjkxfQ.S5E6ZBxhoLy3a_IgRdieGS83fD5ILs05023Z5L33Oqs';

// Configurações de SÃO PAULO (Novo)
const NEW_URL = 'https://wfxeiuqxzrlnvlopcrwd.supabase.co';
const NEW_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeGVpdXF4enJsbnZsb3BjcndkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA3NTI0MiwiZXhwIjoyMDg3NjUxMjQyfQ.wtZ6FaU3YAQDY63wGYHv4qrudRZmdHB9D7hkkcwnYHE';

const oldSupabase = createClient(OLD_URL, OLD_SERVICE_KEY);
const newSupabase = createClient(NEW_URL, NEW_SERVICE_KEY);

async function migrarUsuarios() {
  console.log("🚀 1. Iniciando migração de usuários...");
  const { data: { users }, error } = await oldSupabase.auth.admin.listUsers();
  
  if (error) return console.error("Erro em Ohio:", error);
  console.log(`Encontrados: ${users.length} usuários.`);

  for (const user of users) {
    const { error: insertError } = await newSupabase.auth.admin.createUser({
      email: user.email,
      password: 'SenhaProvisoria123!', 
      email_confirm: true,
      user_metadata: user.user_metadata,
      app_metadata: user.app_metadata
    });
    if (insertError) console.log(`[!] Erro no ${user.email}: ${insertError.message}`);
    else console.log(`[OK] Usuário ${user.email} migrado.`);
  }
}

async function listarEReplicar(bucket, path = '') {
  const { data: items, error } = await oldSupabase.storage.from(bucket).list(path);
  if (error) return console.error(`Erro no path ${path}:`, error.message);

  for (const item of items) {
    const fullPath = path ? `${path}/${item.name}` : item.name;

    // No list do Supabase, se não tem ID ou se não tem metadata, geralmente é uma pasta
    if (!item.id || item.metadata === null) { 
      await listarEReplicar(bucket, fullPath);
    } else {
      console.log(`📦 Copiando arquivo: ${fullPath}`);
      const { data: blob, error: dlError } = await oldSupabase.storage.from(bucket).download(fullPath);
      
      if (!dlError && blob) {
        const { error: upError } = await newSupabase.storage.from(bucket).upload(fullPath, blob, { upsert: true });
        if (upError) console.error(`❌ Erro no upload: ${fullPath}`, upError.message);
      } else if (dlError) {
        console.error(`❌ Erro no download: ${fullPath}`, dlError.message);
      }
    }
  }
}

async function migrarStorage() {
  console.log("🚀 2. Iniciando migração do Storage...");
  const buckets = ['uploads', 'business-proofs'];
  for (const b of buckets) {
    console.log(`--- Processando Bucket: ${b} ---`);
    await listarEReplicar(b);
  }
}

async function start() {
  try {
    await migrarUsuarios();
    await migrarStorage();
    console.log("🏁 MIGRAÇÃO CONCLUÍDA COM SUCESSO!");
  } catch (err) {
    console.error("Erro fatal no script:", err);
  }
}

start();