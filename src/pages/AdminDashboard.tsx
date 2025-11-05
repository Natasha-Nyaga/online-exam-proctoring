import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useToast } from "@/hooks/use-toast";
import CreateExamForm from "@/components/admin/CreateExamForm";
import ExamSessionsList from "@/components/admin/ExamSessionsList";
import { MyExams } from "@/components/admin/MyExams";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [adminName, setAdminName] = useState("");
  const [activeTab, setActiveTab] = useState("sessions");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin-login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("name, role")
        .eq("id", session.user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        toast({
          title: "Access Denied",
          description: "You do not have permission to access the instructor dashboard.",
          className: "bg-error text-error-foreground",
        });
        navigate("/student-dashboard");
        return;
      }

      setAdminName(profile.name);
    };

    checkAuth();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        
        <div className="flex-1 flex flex-col">
          <header className="border-b bg-secondary shadow-sm">
            <div className="px-4 py-6 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-2xl font-bold text-secondary-foreground">Admin Dashboard</h1>
                  <p className="text-secondary-foreground/80">Welcome back, {adminName || "Admin"}</p>
                </div>
              </div>
              <Button onClick={handleLogout} variant="outline" className="bg-card hover:bg-secondary-foreground/10">
                Logout
              </Button>
            </div>
          </header>

          <main className="flex-1 p-8 overflow-auto">
            {activeTab === "sessions" && <ExamSessionsList />}
            {activeTab === "my-exams" && <MyExams />}
            {activeTab === "create" && <CreateExamForm />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminDashboard;
