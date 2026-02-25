import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";

// 🚀 FUNÇÃO AUXILIAR PARA OTIMIZAR URL (Adicionada)
// Ela verifica se a imagem vem do seu Supabase e aplica o redimensionamento
const getOptimizedUrl = (url: string | undefined) => {
  if (!url) return url;
  
  // Se a URL for do seu bucket do Supabase, adicionamos os parâmetros de transformação
  if (url.includes("supabase.co/storage/v1/object/public/")) {
    // Adiciona parâmetros de largura, altura e qualidade (70% é o ideal para mobile)
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}width=150&height=150&quality=70&resize=cover`;
  }
  return url;
};

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, ...props }, ref) => (
  <AvatarPrimitive.Image 
    ref={ref} 
    // ✨ Aqui a mágica acontece: a src passa pela otimização antes de carregar
    src={getOptimizedUrl(src)} 
    className={cn("aspect-square h-full w-full", className)} 
    {...props} 
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };