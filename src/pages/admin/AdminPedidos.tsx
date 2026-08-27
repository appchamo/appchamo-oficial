import AdminLayout from "@/components/AdminLayout";
import AdminOpenRequestsPanel from "@/components/admin/AdminOpenRequestsPanel";

const AdminPedidos = () => {
  return (
    <AdminLayout title="Pedidos abertos">
      <div className="max-w-6xl mx-auto">
        <p className="text-sm text-muted-foreground mb-4">
          Pedidos abertos automaticamente para a região quando um profissional não responde. Aqui você pode
          acompanhar, encerrar ou apagar qualquer pedido. Pedidos parados por mais de 72h expiram sozinhos.
        </p>
        <AdminOpenRequestsPanel />
      </div>
    </AdminLayout>
  );
};

export default AdminPedidos;
