import AppLayout from "@/components/AppLayout";
import CommunityFeed from "@/components/community/CommunityFeed";

/** Rota dedicada /pro/comunidade (menu lateral) — mesmo feed da Home com ?feed=comunidade */
const Community = () => (
  <AppLayout>
    <CommunityFeed variant="standalone" />
  </AppLayout>
);

export default Community;
