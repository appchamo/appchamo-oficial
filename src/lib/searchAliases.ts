/**
 * Mapa de sinônimos e termos relacionados para busca de profissionais.
 * O cliente pode pesquisar de várias formas; todos os termos abaixo ajudam a achar o profissional certo.
 */
export const SEARCH_ALIASES: Record<string, string[]> = {
  // —— Construção e reforma ——
  pedreiro: ["pedreiro", "construcao", "reforma", "alvenaria", "obra", "mestre de obras", "construcao civil"],
  construcao: ["construcao", "reforma", "pedreiro", "alvenaria", "obra"],
  reforma: ["reforma", "construcao", "pedreiro", "renovacao"],
  obra: ["obra", "construcao", "reforma", "pedreiro"],
  alvenaria: ["alvenaria", "pedreiro", "construcao", "tijolo"],
  pintor: ["pintor", "pintura", "pintura residencial", "pintura predial", "pintura de paredes"],
  pintura: ["pintura", "pintor", "residencial", "predial"],
  encanador: ["encanador", "encanamento", "hidraulica", "encanador residencial", "bombeiro hidraulico", "encanamento residencial"],
  encanamento: ["encanamento", "encanador", "hidraulica", "encanador"],
  hidraulica: ["hidraulica", "encanador", "encanamento", "encanador"],
  gesseiro: ["gesseiro", "gesso", "drywall", "reforma e acabamento", "acabamento"],
  drywall: ["drywall", "gesso", "gesseiro", "instalador de drywall"],
  "instalador de drywall": ["drywall", "gesso", "gesseiro"],
  azulejista: ["azulejista", "azulejo", "revestimento", "reforma e acabamento", "rejunte"],
  rejuntador: ["rejuntador", "rejunte", "reforma e acabamento", "azulejo"],
  serralheiro: ["serralheiro", "serralheria", "portao", "grade", "metal"],
  serralheria: ["serralheria", "serralheiro", "portao", "ferro"],
  marceneiro: ["marceneiro", "marcenaria", "moveis planejados", "armario", "moveis"],
  marcenaria: ["marcenaria", "marceneiro", "moveis", "armario"],
  vidraceiro: ["vidraceiro", "vidro", "vidracaria", "vidros"],
  impermeabilizacao: ["impermeabilizacao", "impermeabilizador", "reforma", "infiltracao"],

  // —— Elétrica e automação ——
  eletricista: ["eletricista", "eletrica", "eletrico", "eletricidade", "instalacao eletrica", "eletrica e automacao"],
  eletri: ["eletricista", "eletrica", "eletrico"],
  eletrica: ["eletrica", "eletricista", "eletricidade", "automacao"],
  automacao: ["automacao", "eletrica", "eletricista", "residencial", "predial"],

  // —— Automotivo ——
  mecanico: ["mecanico", "mecanica", "automotivo", "carro", "veiculo", "mecanica automotiva"],
  mecanica: ["mecanica", "mecanico", "automotivo", "carro"],
  funilaria: ["funilaria", "funileiro", "automotivo", "pintura automotiva", "funilaria e pintura"],
  funileiro: ["funileiro", "funilaria", "pintura automotiva", "automotivo"],
  borracheiro: ["borracheiro", "automotivo", "pneu", "troca de pneu", "pneus"],
  pneu: ["pneu", "pneus", "borracheiro", "automotivo"],
  "pintura automotiva": ["pintura automotiva", "funilaria", "funileiro", "automotivo", "estetica automotiva"],
  "estetica automotiva": ["estetica automotiva", "automotivo", "lavagem", "polimento", "detailing"],
  carro: ["carro", "automotivo", "mecanico", "veiculo"],
  automotivo: ["automotivo", "mecanico", "funilaria", "borracheiro", "carro"],

  // —— Educação e idiomas ——
  "aula de ingles": ["ingles", "idiomas", "escola de idiomas", "curso de ingles", "ingles"],
  "escola de ingles": ["ingles", "idiomas", "escola de idiomas"],
  "curso de ingles": ["ingles", "idiomas", "escola de idiomas"],
  ingles: ["ingles", "idiomas", "escola de idiomas", "curso de idiomas"],
  idiomas: ["idiomas", "ingles", "escola de idiomas", "curso de idiomas"],
  "escola de idiomas": ["idiomas", "ingles", "escola de idiomas", "curso de idiomas"],
  professor: ["professor", "aula particular", "reforco", "educacao", "ensino"],
  "aula particular": ["aula particular", "professor", "reforco", "educacao"],
  reforco: ["reforco", "professor", "aula particular", "educacao"],
  educacao: ["educacao", "ensino", "professor", "escola", "curso"],
  ensino: ["ensino", "educacao", "professor", "aula"],

  // —— Saúde e cuidados ——
  enfermeiro: ["enfermeiro", "enfermagem", "saude", "cuidados", "cuidador"],
  enfermagem: ["enfermagem", "enfermeiro", "saude", "cuidados"],
  cuidador: ["cuidador", "cuidados", "idoso", "saude", "enfermagem"],
  cuidados: ["cuidados", "cuidador", "saude", "enfermagem", "saude e cuidados"],
  fisioterapeuta: ["fisioterapeuta", "fisioterapia", "saude", "reabilitacao"],
  fisioterapia: ["fisioterapia", "fisioterapeuta", "saude"],
  saude: ["saude", "cuidados", "enfermagem", "cuidador", "fisioterapia"],

  // —— Agro e máquinas ——
  trator: ["trator", "agricola", "agro", "maquinas agricolas", "terraplanagem"],
  agro: ["agro", "pecuaria", "agricola", "maquinas agricolas"],
  "maquinas agricolas": ["maquinas agricolas", "agro", "terraplanagem", "trator"],
  terraplanagem: ["terraplanagem", "maquinas", "agricola", "terra"],
  pecuaria: ["pecuaria", "agro", "agricola"],

  // —— Jurídico e administrativo ——
  advogado: ["advogado", "juridico", "direito", "advocacia"],
  juridico: ["juridico", "advogado", "direito", "advocacia"],
  contador: ["contador", "contabilidade", "administrativo", "contabil"],
  contabilidade: ["contabilidade", "contador", "administrativo"],
  administrativo: ["administrativo", "contador", "juridico", "assessoria"],
  assessoria: ["assessoria", "administrativo", "juridico", "contador"],

  // —— Assistência técnica / eletrônicos ——
  celular: ["celular", "smartphone", "assistencia tecnica", "conserto", "eletronicos"],
  smartphone: ["smartphone", "celular", "assistencia tecnica", "conserto"],
  "assistencia tecnica": ["assistencia tecnica", "eletronicos", "celular", "conserto", "reparo"],
  conserto: ["conserto", "reparo", "assistencia tecnica", "eletronicos"],
  reparo: ["reparo", "conserto", "assistencia tecnica"],
  notebook: ["notebook", "computador", "informatica", "assistencia tecnica"],
  computador: ["computador", "notebook", "informatica", "assistencia tecnica"],
  eletronico: ["eletronico", "eletronicos", "assistencia tecnica", "celular", "notebook"],

  // —— Design e marketing ——
  designer: ["designer", "design", "design grafico", "identidade visual", "arte"],
  design: ["design", "designer", "grafico", "identidade visual"],
  "gestao de trafego": ["trafego", "marketing", "digital", "gestor de trafego"],
  "gestor de trafego": ["trafego", "marketing", "digital", "gestao de trafego"],
  trafego: ["trafego", "marketing digital", "gestor de trafego"],
  "marketing digital": ["marketing", "digital", "trafego", "redes sociais"],
  marketing: ["marketing", "digital", "trafego", "assessoria"],
  "redes sociais": ["redes sociais", "social media", "marketing", "digital"],
  "social media": ["social media", "redes sociais", "marketing"],
  video: ["video", "videos", "producao", "marketing", "digital"],
  videos: ["videos", "video", "producao", "marketing"],

  // —— Beleza e estética ——
  cabeleireiro: ["cabeleireiro", "cabelo", "beleza", "barbearia", "salao"],
  cabelo: ["cabelo", "cabeleireiro", "beleza", "salao"],
  barbearia: ["barbearia", "barba", "cabeleireiro", "beleza"],
  manicure: ["manicure", "unha", "unhas", "beleza", "nail"],
  unha: ["unha", "unhas", "manicure", "beleza"],
  maquiagem: ["maquiagem", "maquiador", "beleza", "estetica"],
  beleza: ["beleza", "estetica", "cabelo", "unha", "maquiagem"],

  // —— Limpeza e serviços gerais ——
  diarista: ["diarista", "limpeza", "domestica", "faxina"],
  limpeza: ["limpeza", "diarista", "faxina", "limpeza residencial"],
  faxina: ["faxina", "limpeza", "diarista"],
  domestica: ["domestica", "diarista", "limpeza"],

  // —— Eventos e alimentação ——
  buffet: ["buffet", "eventos", "festas", "alimentacao", "comida"],
  eventos: ["eventos", "buffet", "festas", "organizacao"],
  festas: ["festas", "eventos", "buffet"],
  cozinheiro: ["cozinheiro", "culinaria", "comida", "eventos"],
  comida: ["comida", "culinaria", "buffet", "cozinheiro"],

  // —— Pet ——
  veterinario: ["veterinario", "pet", "animal", "cao", "gato"],
  pet: ["pet", "veterinario", "animal", "cao", "gato"],
  dog: ["cao", "pet", "veterinario", "animal"],
  cao: ["cao", "pet", "veterinario", "animal"],
  gato: ["gato", "pet", "veterinario", "animal"],

  // —— Fitness e esportes ——
  personal: ["personal", "personal trainer", "academia", "fitness", "treino"],
  "personal trainer": ["personal", "treino", "academia", "fitness"],
  academia: ["academia", "fitness", "personal", "treino"],
  fitness: ["fitness", "academia", "personal", "treino"],
  treino: ["treino", "personal", "fitness", "academia"],

  // —— Fotografia e mídia ——
  fotografo: ["fotografo", "fotografia", "fotos", "ensaios"],
  fotografia: ["fotografia", "fotografo", "fotos"],
  filmagem: ["filmagem", "video", "producao", "eventos"],
  producao: ["producao", "video", "filmagem", "eventos"],

  // —— Manutenção geral ——
  manutencao: ["manutencao", "reparo", "conserto", "manutencao residencial"],
  reparos: ["reparos", "reparo", "manutencao", "conserto"],

  // —— Variações e termos comuns (typos / como as pessoas buscam) ——
  eletrisista: ["eletricista", "eletrica"],
  hidraulico: ["hidraulica", "encanador", "encanamento"],
  "pintura automotiva": ["pintura", "pintor", "residencial", "automotiva"],
  moveis: ["moveis", "marcenaria", "marceneiro", "armario"],
  armario: ["armario", "marcenaria", "marceneiro", "moveis planejados"],
  portao: ["portao", "serralheiro", "serralheria", "automatizacao"],
  vidro: ["vidro", "vidraceiro", "vidracaria"],
  gesso: ["gesso", "gesseiro", "drywall"],
  revestimento: ["revestimento", "azulejo", "azulejista", "rejunte"],
  instalacao: ["instalacao", "eletrica", "eletricista", "encanamento"],
  veiculo: ["veiculo", "automotivo", "mecanico", "carro"],
  lavagem: ["lavagem", "automotivo", "estetica automotiva", "carro"],
  polimento: ["polimento", "automotivo", "estetica automotiva"],
  curso: ["curso", "educacao", "ingles", "idiomas", "escola"],
  aula: ["aula", "professor", "ingles", "educacao", "curso"],
  cuidado: ["cuidado", "cuidador", "cuidados", "saude"],
  idoso: ["idoso", "cuidador", "cuidados", "enfermagem"],
  direito: ["direito", "advogado", "juridico"],
  contabil: ["contabil", "contador", "contabilidade"],
  cel: ["celular", "celular", "assistencia tecnica"],
  telefone: ["celular", "assistencia tecnica", "eletronicos"],
  pc: ["computador", "notebook", "informatica", "assistencia tecnica"],
  arte: ["arte", "design", "designer", "grafico"],
  grafico: ["grafico", "design", "designer"],
  digital: ["digital", "marketing", "trafego", "redes sociais"],
    "rede social": ["redes sociais", "marketing", "social media"],
  unhas: ["unhas", "manicure", "unha", "beleza"],
  barba: ["barba", "barbearia", "cabeleireiro"],
  salao: ["salao", "cabeleireiro", "beleza", "cabelo"],
  limpar: ["limpeza", "diarista", "faxina"],
  faxineira: ["diarista", "limpeza", "faxina"],
  festa: ["festa", "eventos", "buffet"],
  evento: ["evento", "eventos", "buffet", "festas"],
  animal: ["animal", "pet", "veterinario", "cao", "gato"],
  treinar: ["treino", "personal", "fitness", "academia"],
  foto: ["foto", "fotografia", "fotografo"],
  filmagem: ["filmagem", "video", "producao"],
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/**
 * Termos "mais buscados" por chave de busca: profissionais que tenham algum destes na categoria/profissão
 * aparecem primeiro (ex.: pintor de casa antes de pintura automotiva; estética beleza antes de estética automotiva).
 */
export const SEARCH_PRIMARY: Record<string, string[]> = {
  pintor: ["construcao", "reforma", "pintor"],
  pint: ["construcao", "reforma", "pintor"],
  pintura: ["construcao", "reforma", "pintor", "pintura residencial", "pintura predial"],
  estetica: ["beleza", "barbearia", "cabeleireiro", "manicure", "unha", "maquiagem"],
  estet: ["beleza", "barbearia", "cabeleireiro", "manicure", "unha", "maquiagem"],
  mecanico: ["mecanico", "mecanica", "automotivo"],
  funilaria: ["funilaria", "funileiro", "automotivo"],
  "pintura automotiva": ["automotivo", "funilaria", "estetica automotiva"],
  eletricista: ["eletricista", "eletrica", "automacao"],
  encanador: ["encanador", "encanamento", "hidraulica"],
  pedreiro: ["pedreiro", "construcao", "reforma", "alvenaria"],
  ingles: ["ingles", "idiomas", "escola de idiomas"],
  idiomas: ["idiomas", "escola de idiomas"],
  designer: ["design", "designer", "design grafico"],
};

/** Retorna palavras-chave de "significado mais buscado" para a query; se a categoria/profissão do pro contiver alguma, ele sobe na lista */
export function getPrimaryKeywords(query: string): string[] {
  const q = norm(query.trim());
  if (!q) return [];
  const keys = Object.keys(SEARCH_PRIMARY).filter((key) => q.includes(norm(key)) || norm(key).includes(q));
  const set = new Set<string>();
  for (const key of keys) {
    for (const kw of SEARCH_PRIMARY[key]) set.add(kw);
  }
  return Array.from(set);
}

/** True se o profissional é do "significado mais buscado" para essa query (ex.: pintor de casa, estética beleza) */
export function isPrimaryMatch(query: string, categoryName: string, professionName: string): boolean {
  const keywords = getPrimaryKeywords(query);
  if (keywords.length === 0) return false;
  const cat = norm(categoryName);
  const prof = norm(professionName);
  const combined = `${cat} ${prof}`;
  for (const kw of keywords) {
    if (combined.includes(kw)) return true;
  }
  return false;
}
