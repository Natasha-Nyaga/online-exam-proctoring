import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";

interface Session {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  total_score: number | null;
  exams: { title: string };
}

export const CompletedSessions = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSessions = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: sessionsData } = await supabase
        .from("exam_sessions")
        .select(`
          id,
          started_at,
          completed_at,
          status,
          total_score,
          exams (title)
        `)
        .eq("student_id", session.user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      if (sessionsData) {
        setSessions(sessionsData);
      }
      setLoading(false);
    };

    fetchSessions();
  }, []);

  if (loading) {
    return <div className="text-muted-foreground">Loading sessions...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          Completed Exam Sessions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No completed sessions yet</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium">{session.exams.title}</span>
                  <Badge variant="default">Completed</Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Score: {session.total_score ?? "Not graded"}</p>
                  <p>Completed: {session.completed_at ? new Date(session.completed_at).toLocaleString() : "N/A"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
