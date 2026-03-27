import { Navigate, useParams } from "react-router-dom";

/** Abre a Home na aba Comunidade com foco no post (query `post`). */
const CommunityPostDeepLink = () => {
  const { postId } = useParams();
  const id = (postId || "").trim();
  if (!id) return <Navigate to="/home?feed=comunidade" replace />;
  return <Navigate to={`/home?feed=comunidade&post=${encodeURIComponent(id)}`} replace />;
};

export default CommunityPostDeepLink;
