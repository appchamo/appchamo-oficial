import AppLayout from "@/components/AppLayout";
import CommunityFeed from "@/components/community/CommunityFeed";
import { Navigate, useParams } from "react-router-dom";

/** Uma publicação em ecrã completo; partilha e notificações usam `/p/comunidade/:postId`. */
const CommunityPostPage = () => {
  const { postId } = useParams();
  const id = (postId || "").trim();
  if (!id) return <Navigate to="/home?feed=comunidade" replace />;
  return (
    <AppLayout>
      <CommunityFeed variant="embedded" singlePostId={id} showBackToCommunity />
    </AppLayout>
  );
};

export default CommunityPostPage;
