import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import OpenServiceRequestModal from "@/components/home/OpenServiceRequestModal";

/**
 * Rota direta `/solicitar-servico` — mesmo fluxo da Home, em modal.
 */
const SolicitarServico = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  return (
    <AppLayout>
      <OpenServiceRequestModal
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) navigate(-1);
        }}
      />
    </AppLayout>
  );
};

export default SolicitarServico;
