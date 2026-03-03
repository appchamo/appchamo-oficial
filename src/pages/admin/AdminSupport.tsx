import AdminLayout from "@/components/AdminLayout";
import SupportCentralContent from "@/components/SupportCentralContent";

const AdminSupport = () => {
  return (
    <SupportCentralContent
      renderLayout={({ title, children }) => (
        <AdminLayout title={title}>{children}</AdminLayout>
      )}
    />
  );
};

export default AdminSupport;
