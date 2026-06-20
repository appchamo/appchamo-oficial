import AppLayout from "@/components/AppLayout";
import CouponsContent from "@/components/CouponsContent";

const Coupons = () => (
  <AppLayout>
    <main className="max-w-screen-lg mx-auto px-4 py-5">
      <h1 className="text-xl font-bold text-foreground mb-4">Meus Cupons</h1>
      <CouponsContent />
    </main>
  </AppLayout>
);

export default Coupons;
