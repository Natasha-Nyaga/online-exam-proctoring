import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Eye } from "lucide-react";

interface ExamSession {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  exams: { title: string };
  students: { 
    student_id: string;
    profiles: { name: string };
  };
}

const ExamSessionsList = () => {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select(`
          id,
          started_at,
          completed_at,
          status,
          exams (title),
          students (
            student_id,
            profiles (name)
          )
        `)
        .order("started_at", { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load exam sessions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadCheatingReport = async (sessionId: string) => {
    try {
      const { data: incidents, error } = await supabase
        .from("cheating_incidents")
        .select("*")
        .eq("session_id", sessionId);

      if (error) throw error;

      // Create CSV content
      const csvContent = [
        ["Timestamp", "Type", "Severity", "Description"],
        ...incidents.map(inc => [
          new Date(inc.timestamp).toLocaleString(),
          inc.incident_type,
          inc.severity,
          inc.description || "",
        ]),
      ]
        .map(row => row.join(","))
        .join("\n");

      // Download file
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cheating-report-${sessionId}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Report downloaded successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to download report",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <p className="text-muted-foreground">Loading sessions...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Completed Exam Sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No exam sessions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>{session.students.profiles.name}</TableCell>
                  <TableCell>{session.students.student_id}</TableCell>
                  <TableCell>{session.exams.title}</TableCell>
                  <TableCell>{new Date(session.started_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        session.status === "completed"
                          ? "default"
                          : session.status === "in_progress"
                          ? "secondary"
                          : "destructive"
                      }
                    >
                      {session.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadCheatingReport(session.id)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Report
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default ExamSessionsList;
