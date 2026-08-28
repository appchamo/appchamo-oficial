import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import ResumeProfileView from "@/components/jobs/ResumeProfileView";
import { Loader2 } from "lucide-react";

const MeuCurriculo = () => {
  const { user, loading } = useAuth();
  return (
    <AppLayout>
      <main className="px-4 py-4">
        {loading || !user ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <ResumeProfileView targetUserId={user.id} isOwner />
        )}
      </main>
    </AppLayout>
  );
};

export default MeuCurriculo;
