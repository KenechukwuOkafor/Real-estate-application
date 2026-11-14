import { AdminNav } from "@/features/admin/components/admin-nav";

/**
 * Every admin page gets the admin navigation, so no admin page is reachable
 * only by typing its URL. Authorization stays where it was: each page's
 * service call requires the admin role and redirects otherwise.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
