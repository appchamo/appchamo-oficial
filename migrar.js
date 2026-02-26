import { createClient } from '@supabase/supabase-js';

const OLD_URL = 'https://mrfippvowbudtctahgag.supabase.co';
const OLD_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yZmlwcHZvd2J1ZHRjdGFoZ2FnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3OTY5MSwiZXhwIjoyMDg2OTU1NjkxfQ.S5E6ZBxhoLy3a_IgRdieGS83fD5ILs05023Z5L33Oqs';

const NEW_URL = 'https://wfxeiuqxzrlnvlopcrwd.supabase.co';
const NEW_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmeGVpdXF4enJsbnZsb3BjcndkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA3NTI0MiwiZXhwIjoyMDg3NjUxMjQyfQ.wtZ6FaU3YAQDY63wGYHv4qrudRZmdHB9D7hkkcwnYHE';

const oldSupabase = createClient(OLD_URL, OLD_SERVICE_KEY);
const newSupabase = createClient(NEW_URL, NEW_SERVICE_KEY);

async function migrarStorage(bucket, path = '') {
  const { data: items, error } = await oldSupabase.storage.from(bucket).list(path);
  if (error) return;

  for (const item of items) {
    const fullPath = path ? `${path}/${item.name}` : item.name;
    if (!item.id) { // É pasta
      await migrarStorage(bucket, fullPath);
    } else {
      console.log(`🖼️ Movendo imagem: ${fullPath}`);
      const { data: blob } = await oldSupabase.storage.from(bucket).download(fullPath);
      if (blob) {
        await newSupabase.storage.from(bucket).upload(fullPath, blob, { upsert: true });
      }
    }
  }
}

async function migrarTabelasFixas() {
  // Tabelas que não dependem de usuários (Patrocinadores, Planos, etc)
  const tabelas = ['plans', 'categories', 'professions', 'platform_settings'];
  
  for (const t of tabelas) {
    console.log(`📊 Migrando tabela: ${t}`);
    const { data: linhas } = await oldSupabase.from(t).select('*');
    if (linhas && linhas.length > 0) {
      const { error } = await newSupabase.from(t).upsert(linhas);
      if (error) console.error(`❌ Erro em ${t}: ${error.message}`);
      else console.log(`✅ ${t} OK!`);
    }
  }
}

async function start() {
  console.log("🚀 Iniciando migração de Imagens e Tabelas...");
  await migrarTabelasFixas();
  
  console.log("📂 Movendo arquivos do Storage...");
  await migrarStorage('uploads');
  await migrarStorage('business-proofs');
  
  console.log("🏁 PRONTO! Imagens e Patrocinadores migrados.");
}

start();