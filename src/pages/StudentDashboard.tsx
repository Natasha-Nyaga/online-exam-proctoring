import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { StudentSidebar } from "@/components/student/StudentSidebar";
import { useToast } from "@/hooks/use-toast";
import { Clock, FileText } from "lucide-react";
import { StudentProfile } from "@/components/student/StudentProfile";
import { FlaggedIncidents } from "@/components/student/FlaggedIncidents";
import { CompletedSessions } from "@/components/student/CompletedSessions";

interface Exam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
}

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [activeTab, setActiveTab] = useState("exams");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/student-login");
        return;
      }

      // Get student profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        setStudentName(profile.name);
      }

      // Fetch available exams
      const { data: examsData, error } = await supabase
        .from("exams")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to load exams",
          className: "bg-error text-error-foreground",
        });
      } else {
        setExams(examsData || []);
      }
      
      setLoading(false);
    };

    checkAuth();
  }, [navigate, toast]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/student-login");
  };

  const startExam = (examId: string) => {
    navigate(`/calibration?examId=${examId}`);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <StudentSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        
        <div className="flex-1 flex flex-col">
          <header className="border-b bg-secondary shadow-sm">
            <div className="px-4 py-6 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div>
                  <h1 className="text-2xl font-bold text-secondary-foreground">Student Dashboard</h1>
                  <p className="text-secondary-foreground/80">Welcome, {studentName}</p>
                </div>
              </div>
              <Button onClick={handleLogout} variant="outline" className="bg-card hover:bg-secondary-foreground/10">
                Logout
              </Button>
            </div>
          </header>

          <main className="flex-1 p-8 overflow-auto">
            {activeTab === "exams" && (
              <>
                {loading ? (
                  <p className="text-muted-foreground">Loading exams...</p>
                ) : exams.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No exams available at the moment.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {exams.map((exam) => (
                      <Card key={exam.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                          <CardTitle>{exam.title}</CardTitle>
                          <CardDescription>{exam.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                            <Clock className="h-4 w-4" />
                            <span>{exam.duration_minutes} minutes</span>
                          </div>
                          <Button onClick={() => startExam(exam.id)} className="w-full">
                            Start Exam
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "profile" && <StudentProfile />}
            {activeTab === "incidents" && <FlaggedIncidents />}
            {activeTab === "sessions" && <CompletedSessions />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default StudentDashboard;
