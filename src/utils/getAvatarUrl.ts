export const getAvatarUrl = (avatarUrl?: string | null) => {
  if (!avatarUrl) return "/default-avatar.png";

  // Caso já seja URL completa (modelo antigo)
  if (avatarUrl.startsWith("http")) {
    return avatarUrl;
  }

  // Caso seja apenas o path salvo no banco
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${avatarUrl}`;
};
