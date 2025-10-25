import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import CreateExamForm from "@/components/admin/CreateExamForm";
import ExamSessionsList from "@/components/admin/ExamSessionsList";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin-login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        setAdminName(profile.name);
      }
    };

    checkAuth();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin-login");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Instructor Dashboard</h1>
            <p className="text-muted-foreground mt-1">Welcome back, {adminName || "Instructor"}</p>
          </div>
          <Button onClick={handleLogout} variant="outline" size="lg">
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="sessions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="sessions" className="text-base">
              Flagged Sessions
            </TabsTrigger>
            <TabsTrigger value="create" className="text-base">
              Upload Exam
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="space-y-4">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold mb-2">Student Exam Sessions</h2>
              <p className="text-muted-foreground">
                View all completed exam sessions, cheating incidents, and download detailed reports
              </p>
            </div>
            <ExamSessionsList />
          </TabsContent>

          <TabsContent value="create" className="space-y-4">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold mb-2">Upload New Examination</h2>
              <p className="text-muted-foreground">
                Create a new exam that will be visible to all students
              </p>
            </div>
            <CreateExamForm />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
