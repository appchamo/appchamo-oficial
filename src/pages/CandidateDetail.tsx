import { useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import ResumeProfileView from "@/components/jobs/ResumeProfileView";

const CandidateDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  return (
    <AppLayout>
      <main className="px-4 py-4">
        {userId ? <ResumeProfileView targetUserId={userId} isOwner={false} /> : null}
      </main>
    </AppLayout>
  );
};

export default CandidateDetail;
