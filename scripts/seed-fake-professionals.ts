/**
 * Seed: 100 profissionais fake em MG (Triângulo Mineiro e redondezas)
 * - 5 profissionais por cidade (20 cidades)
 * - Foto de perfil, descrição, avaliações e comentários
 * - Planos: free, pro, vip, business (25 cada)
 *
 * Uso: npm run seed:professionals
 * Defina no .env: VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_URL)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Carrega .env na raiz do projeto (opcional)
try {
  const envPath = join(process.cwd(), ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_URL no .env)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CIDADES_MG = [
  "Uberlândia", "Uberaba", "Araxá", "Patos de Minas", "Araguari",
  "Ituiutaba", "Monte Carmelo", "Prata", "Tupaciguara", "Frutal",
  "Campos Altos", "São Gotardo", "Coromandel", "Estrela do Sul", "Iraí de Minas",
  "Sacramento", "Tapira", "Perdizes", "Santa Vitória", "União de Minas",
];

const PLANOS = ["free", "pro", "vip", "business"] as const;

const NOMES = [
  "Carlos Eduardo", "Ana Paula", "Roberto Silva", "Fernanda Lima", "Marcos Oliveira",
  "Juliana Costa", "Ricardo Santos", "Patrícia Alves", "Bruno Ferreira", "Camila Rocha",
  "Lucas Martins", "Amanda Souza", "Pedro Henrique", "Larissa Dias", "Rafael Pereira",
  "Beatriz Nunes", "Thiago Carvalho", "Mariana Gomes", "Felipe Ribeiro", "Isabela Castro",
  "Gabriel Lima", "Carolina Mendes", "Daniel Oliveira", "Leticia Araújo", "André Barbosa",
  "Natália Correia", "Leonardo Pinto", "Vanessa Teixeira", "Rodrigo Nascimento", "Renata Lopes",
  "Gustavo Azevedo", "Priscila Moreira", "Henrique Cavalcanti", "Tatiana Freitas", "Eduardo Cardoso",
  "Aline Vasconcelos", "Vinícius Rodrigues", "Cláudia Farias", "Matheus Brito", "Adriana Monteiro",
  "Igor Cavalheiro", "Bianca Soares", "Diego Almeida", "Fabiana Cunha", "Júlio César",
  "Luciana Barros", "Fábio Tavares", "Sandra Reis", "Alexandre Coelho", "Mônica Andrade",
  "Paulo Sérgio", "Cristina Machado", "Leandro Fonseca", "Eliane Campos", "Anderson Melo",
  "Simone Barbosa", "César Augusto", "Rosana Dantas", "Maurício Araújo", "Luciana Pires",
  "Renato Gomes", "Viviane Costa", "Sérgio Nogueira", "Regina Lemos", "Wellington Dias",
  "Cintia Rocha", "Flávio Martins", "Helena Souza", "Gilberto Oliveira", "Lúcia Ferreira",
  "Hugo Pereira", "Márcia Silva", "Oscar Santos", "Célia Ribeiro", "Nelson Carvalho",
  "Débora Alves", "Pablo Mendes", "Sônia Castro", "Raul Gomes", "Tânia Nascimento",
  "Fábio Júnior", "Rita Lima", "Wagner Pinto", "Sílvia Freitas", "Caio Rodrigues",
  "Lorena Teixeira", "Bruno Henrique", "Michele Araújo", "Guilherme Soares", "Lilian Costa",
];

const BIOS = [
  "Profissional com mais de 10 anos de experiência. Atendimento humanizado e qualidade garantida.",
  "Especialista na área, comprometido com a satisfação do cliente. Atendo na região do Triângulo.",
  "Trabalho com dedicação e pontualidade. Entre em contato para orçamentos sem compromisso.",
  "Foco em resultados e atendimento personalizado. Agende seu horário.",
  "Profissional certificado, pronta para atender você com excelência.",
  "Atendimento de qualidade e preço justo. Experiência e seriedade.",
  "Resolvo seu problema com eficiência. Atendo Uberlândia e região.",
  "Compromisso com o cliente e trabalho bem feito. Solicite um orçamento.",
  "Especialista dedicado. Atendimento rápido e com garantia.",
  "Anos de experiência no mercado. Satisfação do cliente em primeiro lugar.",
];

const COMENTARIOS_AVALIACAO = [
  "Atendimento excelente, muito profissional!",
  "Resolveu meu problema rapidinho, super recomendo.",
  "Pessoa educada e trabalho impecável.",
  "Já chamei outras vezes e sempre atende bem.",
  "Muito bom, preço justo e qualidade.",
  "Recomendo demais, nota 10!",
  "Atendeu no horário combinado, tudo certo.",
  "Ótimo profissional, voltarei a contratar.",
  "Serviço de qualidade, indico.",
  "Muito satisfeito com o resultado.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function main() {
  console.log("🔍 Buscando categorias e profissões...");
  const { data: categories } = await supabase.from("categories").select("id").eq("active", true).limit(1);
  const { data: professions } = await supabase.from("professions").select("id, category_id").eq("active", true).limit(10);
  const categoryId = categories?.[0]?.id;
  const professionIds = professions || [];
  if (!categoryId || professionIds.length === 0) {
    console.error("Cadastre ao menos uma categoria e uma profissão no admin.");
    process.exit(1);
  }

  console.log("👤 Criando 1 usuário cliente fake (para avaliações)...");
  const { data: clientUser, error: errClient } = await supabase.auth.admin.createUser({
    email: "cliente-seed-avaliacoes@chamo-fake.local",
    password: "SeedChamo2026!",
    email_confirm: true,
    user_metadata: { full_name: "Cliente Avaliador", user_type: "client" },
  });
  if (errClient && errClient.message?.includes("already been registered") === false) {
    console.error("Erro ao criar cliente:", errClient.message);
    process.exit(1);
  }
  let fakeClientId = clientUser?.user?.id ?? null;
  if (!fakeClientId) {
    const { data: profile } = await supabase.from("profiles").select("user_id").eq("email", "cliente-seed-avaliacoes@chamo-fake.local").single();
    fakeClientId = profile?.user_id ?? null;
  }
  if (!fakeClientId) {
    console.error("Cliente seed não encontrado.");
    process.exit(1);
  }

  const created: { user_id: string; professional_id: string; plan: string; city: string }[] = [];
  let planIndex = 0;

  for (let i = 0; i < 100; i++) {
    const city = CIDADES_MG[i % CIDADES_MG.length];
    const plan = PLANOS[planIndex % PLANOS.length];
    planIndex++;
    const nome = NOMES[i % NOMES.length];
    const email = `seed-pro-${i + 1}@chamo-fake.local`;
    const avatarNum = (i % 70) + 1;
    const avatarUrl = `https://i.pravatar.cc/400?img=${avatarNum}`;

    const { data: user, error: userErr } = await supabase.auth.admin.createUser({
      email,
      password: "SeedChamo2026!",
      email_confirm: true,
      user_metadata: { full_name: nome, user_type: "professional" },
    });

    if (userErr) {
      if (userErr.message?.includes("already been registered")) {
        const { data: prof } = await supabase.from("profiles").select("user_id").eq("email", email).single();
        if (prof?.user_id) {
          const { data: proRow } = await supabase.from("professionals").select("id").eq("user_id", prof.user_id).single();
          if (proRow) {
            await supabase.from("subscriptions").upsert(
              { user_id: prof.user_id, plan_id: plan, status: "active" },
              { onConflict: "user_id" }
            );
            created.push({ user_id: prof.user_id, professional_id: proRow.id, plan, city });
            process.stdout.write(".");
            continue;
          }
        }
      }
      console.error(`\nErro ao criar usuário ${i + 1}:`, userErr.message);
      continue;
    }

    const userId = user.user?.id;
    if (!userId) continue;

    await supabase
      .from("profiles")
      .update({
        avatar_url: avatarUrl,
        address_city: city,
        address_state: "MG",
        address_country: "Brasil",
      })
      .eq("user_id", userId);

    const profession = professionIds[i % professionIds.length];
    const { data: proRow, error: proErr } = await supabase
      .from("professionals")
      .insert({
        user_id: userId,
        category_id: categoryId,
        profession_id: profession?.id ?? professionIds[0]?.id,
        bio: pick(BIOS),
        profile_status: "approved",
        active: true,
        verified: plan === "vip" || plan === "business",
        rating: 0,
        total_reviews: 0,
        total_services: 0,
        availability_status: "available",
      })
      .select("id")
      .single();

    if (proErr) {
      console.error(`\nErro ao criar professional ${i + 1}:`, proErr.message);
      continue;
    }

    await supabase.from("subscriptions").upsert(
      { user_id: userId, plan_id: plan, status: "active" },
      { onConflict: "user_id" }
    );

    created.push({ user_id: userId, professional_id: proRow!.id, plan, city });
    process.stdout.write(".");
  }

  console.log(`\n✅ ${created.length} profissionais criados. Gerando avaliações...`);

  for (const item of created) {
    const numReviews = 2 + Math.floor(Math.random() * 5);
    const ratings: number[] = [];
    const comments = pickN(COMENTARIOS_AVALIACAO, numReviews);

    for (let r = 0; r < numReviews; r++) {
      const rating = 3 + Math.floor(Math.random() * 3);
      ratings.push(rating);
      const { data: req } = await supabase
        .from("service_requests")
        .insert({
          client_id: fakeClientId,
          professional_id: item.professional_id,
          status: "completed",
        })
        .select("id")
        .single();

      if (req?.id) {
        await supabase.from("reviews").insert({
          request_id: req.id,
          professional_id: item.professional_id,
          client_id: fakeClientId,
          rating,
          comment: comments[r] ?? null,
        });
      }
    }

    const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : 0;
    await supabase
      .from("professionals")
      .update({
        rating: avgRating,
        total_reviews: ratings.length,
        total_services: ratings.length,
      })
      .eq("id", item.professional_id);
  }

  console.log("✅ Avaliações e comentários vinculados.");
  console.log("\nResumo por plano:");
  const byPlan = created.reduce((acc, p) => {
    acc[p.plan] = (acc[p.plan] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  Object.entries(byPlan).forEach(([plan, count]) => console.log(`  ${plan}: ${count}`));
  console.log("\nResumo por cidade (primeiras 5):");
  const byCity = created.reduce((acc, p) => {
    acc[p.city] = (acc[p.city] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  Object.entries(byCity)
    .slice(0, 5)
    .forEach(([city, count]) => console.log(`  ${city}: ${count}`));
  console.log("\n🎉 Seed concluído. 100 profissionais fake em MG (Triângulo e redondezas).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
