import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface DocumentsNoticeModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onContinue: () => void;
  /** Ao fechar (X, overlay ou Voltar) sem continuar */
  onBack?: () => void;
}

/**
 * Explicativo antes da etapa de envio de documentos (cadastro profissional ou tornar-se profissional).
 */
export function DocumentsNoticeModal({
  open,
  onOpenChange,
  onContinue,
  onBack,
}: DocumentsNoticeModalProps) {
  const handleOpenChange = (next: boolean) => {
    if (!next) onBack?.();
    onOpenChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[440px] gap-4">
        <DialogHeader>
          <DialogTitle className="text-left text-lg leading-snug">
            Vamos pedir seus documentos
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground text-left">
          <p className="font-semibold text-foreground">Por que pedimos documentação?</p>
          <p>
            Pedimos documento com foto para manter <strong>segurança no aplicativo</strong>: confirmamos
            que quem oferece serviços é quem diz ser, reduzimos fraudes e protegemos clientes e
            profissionais. Os arquivos são usados só para essa verificação e tratados conforme nossa
            Política de Privacidade.
          </p>
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-2">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => handleOpenChange(false)}>
            Voltar
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              onContinue();
            }}
          >
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
