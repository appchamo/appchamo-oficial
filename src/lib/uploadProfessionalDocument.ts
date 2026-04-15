import { supabase } from "@/integrations/supabase/client";

/**
 * Android/WebView: PDFs da galeria às vezes vêm como stream `content://` que falha em alguns caminhos.
 * Ler para ArrayBuffer e recriar o File garante um blob enviável.
 */
async function normalizeFileForUpload(file: File): Promise<File> {
  const buf = await file.arrayBuffer();
  const lower = (file.name || "").toLowerCase();
  const mime =
    file.type ||
    (lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
            ? "image/jpeg"
            : "application/octet-stream");
  const safe =
    (file.name || (mime === "application/pdf" ? "documento.pdf" : "documento.jpg"))
      .replace(/[^\w.\-\u00C0-\u024F]+/g, "_")
      .slice(0, 180) || "documento.bin";
  return new File([buf], safe, { type: mime });
}

/**
 * Upload para `uploads` com o cliente Supabase (JWT da sessão).
 * Evita Edge Function + fetch manual, que no Android/WebView gerava 401 ou "Failed to fetch".
 * Política: `authenticated_upload_uploads` (bucket uploads).
 */
export async function uploadProfessionalDocument(file: File, userId: string): Promise<{ path: string }> {
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user?.id) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (user.id !== userId) {
    throw new Error("Não autorizado a enviar documentos por outra conta.");
  }

  const normalized = await normalizeFileForUpload(file);
  const ext = normalized.name.includes(".") ? (normalized.name.split(".").pop() ?? "bin") : "bin";
  const fileName = `documents/${userId}/${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}.${ext}`;

  const { data, error } = await supabase.storage.from("uploads").upload(fileName, normalized, {
    contentType: normalized.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || "Falha ao enviar documento. Tenta novamente.");
  }
  if (!data?.path) {
    throw new Error("Falha ao enviar documento. Tenta novamente.");
  }
  return { path: data.path };
}
