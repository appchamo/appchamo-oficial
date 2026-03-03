import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";

const ExclusaoDeConta = () => {
  const { user } = useAuth();

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center gap-3 mb-4">
          <Link to={user ? "/profile" : "/"} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Exclusão de conta</h1>
        </div>

        <div className="bg-card border rounded-2xl p-6 shadow-card space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-extrabold text-gradient">Chamô</h2>
            <p className="text-sm text-muted-foreground mt-1">Informações sobre exclusão da sua conta</p>
          </div>

          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">Como excluir sua conta</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Abra o app Chamô e faça login na sua conta.</li>
              <li>Acesse <strong>Perfil</strong> (ícone ou menu).</li>
              <li>Toque em <strong>Excluir minha conta</strong> (ou opção equivalente nas configurações).</li>
              <li>Confirme a exclusão conforme as instruções na tela.</li>
              <li>Se não encontrar a opção no app, entre em contato conosco pelo canal indicado abaixo.</li>
            </ol>
          </section>

          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">Quais dados são excluídos</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Com a exclusão da conta, removemos do nosso sistema, entre outros:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Dados cadastrais (nome, e-mail, telefone, CPF/CNPJ, endereço)</li>
              <li>Perfil público (foto, descrição, categorias)</li>
              <li>Histórico de conversas e mensagens</li>
              <li>Solicitações de serviço e agendamentos vinculados à conta</li>
              <li>Assinaturas e dados de pagamento associados ao perfil</li>
              <li>Notificações e preferências da conta</li>
            </ul>
          </section>

          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">Dados que podem ser mantidos por obrigação legal</h3>
            <p className="text-sm text-muted-foreground">
              Por exigência legal, fiscal ou para resolução de disputas, podemos reter por período determinado:
              registros de transações financeiras, dados necessários para cumprimento de obrigações fiscais e
              documentação que a lei exija manter. O tratamento desses dados segue a legislação aplicável e
              nossa Política de Privacidade.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">Prazo de exclusão</h3>
            <p className="text-sm text-muted-foreground">
              A exclusão da conta e dos dados vinculados a ela é processada em até <strong>30 (trinta) dias</strong> a
              partir da confirmação do pedido. Durante esse período, a conta permanece inativa e os dados são
              removidos de forma segura de nossos sistemas, exceto onde a lei exija retenção.
            </p>
          </section>

          <section>
            <h3 className="text-base font-semibold text-foreground mb-2">Contato para solicitação</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Para solicitar a exclusão da conta ou tirar dúvidas sobre o processo:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li><strong>E-mail:</strong> suporte@appchamo.com</li>
              <li><strong>No app:</strong> use a opção de Suporte no menu ou em Perfil.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              Ao entrar em contato, informe o e-mail ou telefone da conta a ser excluída para que possamos
              localizar e processar seu pedido.
            </p>
          </section>
        </div>
      </main>
    </AppLayout>
  );
};

export default ExclusaoDeConta;
