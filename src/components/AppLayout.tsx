import Header from "./Header";
import BottomNav from "./BottomNav";

interface AppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

const AppLayout = ({ children, showHeader = true }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background pb-20">
      {showHeader && <Header />}
      {children}
      <BottomNav />
    </div>
  );
};

export default AppLayout;
