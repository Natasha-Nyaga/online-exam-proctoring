import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Eye } from "lucide-react";

// Type guard for a valid profile object
function isValidProfile(p: unknown): p is { name: string } {
  return (
    typeof p === "object" &&
    p !== null &&
    "name" in p &&
    typeof (p as any).name === "string"
  );
}

interface ExamSession {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  total_score: number | null;
  exams: { title: string };
  student_id: string;
  students?: {
    profiles?: { name: string };
  };
  profiles?: { name: string };
  incident_count?: number;
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
      const { data: sessionsData, error } = await supabase
        .from("exam_sessions")
        .select(`
          id,
          started_at,
          completed_at,
          status,
          total_score,
          exams (title),
          student_id,
          students!student_id (
            profiles (name)
          )
        `)
        .order("started_at", { ascending: false });

      if (error) {
        console.error("Supabase error:", error);
        throw error;
      }
      if (!sessionsData) {
        console.error("No sessions data returned from Supabase.");
      }

      // Fetch incident counts for each session
      const sessionsWithCounts = await Promise.all(
        (sessionsData || []).map(async (session) => {
          const { count, error: incidentError } = await supabase
            .from("cheating_incidents")
            .select("*", { count: "exact", head: true })
            .eq("session_id", session.id);
          if (incidentError) {
            console.error("Incident count error for session", session.id, incidentError);
          }

          // Extract student name from nested join
          const studentName = session.students?.profiles?.name || "Unknown";

          return { 
            ...session, 
            profiles: { name: studentName }, 
            incident_count: count || 0 
          };
        })
      );

      setSessions(sessionsWithCounts);
    } catch (error: any) {
      console.error("FetchSessions error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load exam sessions",
        className: "bg-error text-error-foreground",
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
        className: "bg-success text-success-foreground",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to download report",
        className: "bg-error text-error-foreground",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Student Exam Sessions & Flagged Reports</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Monitor exam sessions, view anomaly counts, and download detailed incident reports
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/20">
            <p className="text-muted-foreground text-lg font-medium">No exam sessions found</p>
            <p className="text-sm text-muted-foreground mt-2">
              Sessions will appear here once students complete exams
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Student Name</TableHead>
                  <TableHead className="font-semibold">Student ID</TableHead>
                  <TableHead className="font-semibold">Exam Title</TableHead>
                  <TableHead className="font-semibold">Score</TableHead>
                  <TableHead className="font-semibold">Started At</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold text-center">Anomalies</TableHead>
                  <TableHead className="font-semibold">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">
                      {isValidProfile(session.profiles)
                        ? session.profiles.name
                        : "Unknown"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {session.student_id}
                    </TableCell>
                    <TableCell>{session.exams.title}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-primary">
                        {session.total_score !== null ? session.total_score : "N/A"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(session.started_at).toLocaleString()}
                    </TableCell>
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
                    <TableCell className="text-center">
                      <Badge 
                        variant={session.incident_count! > 0 ? "destructive" : "outline"}
                        className="font-semibold"
                      >
                        {session.incident_count}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadCheatingReport(session.id)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExamSessionsList;
