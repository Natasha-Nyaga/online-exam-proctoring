import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, FileText } from "lucide-react";

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
          variant: "destructive",
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
  <div className="min-h-screen bg-background">
      <header className="border-b bg-primary">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-black">Student Dashboard</h1>
            <p className="text-black/80">Welcome, {studentName}</p>
          </div>
          <Button onClick={handleLogout} className="bg-white text-primary font-semibold hover:bg-primary-foreground hover:text-white border-none">
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold mb-6">Available Exams</h2>
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
      </main>
    </div>
  );
};

export default StudentDashboard;
