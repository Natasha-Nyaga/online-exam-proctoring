import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Exam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  created_at: string;
  completed_count: number;
  total_sessions: number;
}

export function MyExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchMyExams();
  }, []);

  const fetchMyExams = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch exams created by this admin
      const { data: examsData, error: examsError } = await supabase
        .from("exams")
        .select("*")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (examsError) throw examsError;

      // For each exam, count total sessions and completed sessions
      const examsWithStats = await Promise.all(
        (examsData || []).map(async (exam) => {
          const { count: totalSessions } = await supabase
            .from("exam_sessions")
            .select("*", { count: "exact", head: true })
            .eq("exam_id", exam.id);

          const { count: completedCount } = await supabase
            .from("exam_sessions")
            .select("*", { count: "exact", head: true })
            .eq("exam_id", exam.id)
            .eq("status", "completed");

          return {
            ...exam,
            total_sessions: totalSessions || 0,
            completed_count: completedCount || 0,
          };
        })
      );

      setExams(examsWithStats);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">My Exams</h2>
        <p className="text-muted-foreground">View exams you've created and their completion statistics</p>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No exams created yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => (
            <Card key={exam.id}>
              <CardHeader>
                <CardTitle>{exam.title}</CardTitle>
                <CardDescription>{exam.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-medium">{exam.duration_minutes} minutes</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Sessions:</span>
                  <span className="font-medium">{exam.total_sessions}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Completed:</span>
                  <span className="font-medium text-primary">{exam.completed_count}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">In Progress:</span>
                  <span className="font-medium">{exam.total_sessions - exam.completed_count}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
