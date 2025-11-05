import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Edit, Trash2, Users } from "lucide-react";

interface Exam {
  id: string;
  title: string;
  description: string;
  duration_minutes: number;
  created_at: string;
  completed_count: number;
  total_sessions: number;
}

interface StudentScore {
  id: string;
  student_name: string;
  student_id: string;
  total_score: number | null;
  status: string;
  started_at: string;
  completed_at: string | null;
}

export function MyExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteExamId, setDeleteExamId] = useState<string | null>(null);
  const [scoresDialogOpen, setScoresDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [studentScores, setStudentScores] = useState<StudentScore[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
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

  const handleDeleteExam = async () => {
    if (!deleteExamId) return;

    try {
      const { error } = await supabase
        .from("exams")
        .delete()
        .eq("id", deleteExamId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Exam deleted successfully",
      });

      setDeleteExamId(null);
      fetchMyExams();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchStudentScores = async (exam: Exam) => {
    setSelectedExam(exam);
    setScoresDialogOpen(true);
    setScoresLoading(true);

    try {
      const { data: sessions, error } = await supabase
        .from("exam_sessions")
        .select(`
          id,
          total_score,
          status,
          started_at,
          completed_at,
          student_id,
          students!student_id (
            student_id,
            profiles (name)
          )
        `)
        .eq("exam_id", exam.id)
        .order("started_at", { ascending: false });

      if (error) throw error;

      const scores: StudentScore[] = (sessions || []).map((session: any) => ({
        id: session.id,
        student_name: session.students?.profiles?.name || "Unknown",
        student_id: session.students?.student_id || session.student_id,
        total_score: session.total_score,
        status: session.status,
        started_at: session.started_at,
        completed_at: session.completed_at,
      }));

      setStudentScores(scores);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setScoresLoading(false);
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
              <CardContent className="space-y-4">
                <div className="space-y-2">
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
                </div>
                
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => fetchStudentScores(exam)}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Scores
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteExamId(exam.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteExamId} onOpenChange={() => setDeleteExamId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this exam and all associated sessions and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExam} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Student Scores Dialog */}
      <Dialog open={scoresDialogOpen} onOpenChange={setScoresDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student Scores - {selectedExam?.title}</DialogTitle>
            <DialogDescription>View all student scores for this exam</DialogDescription>
          </DialogHeader>

          {scoresLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : studentScores.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No students have taken this exam yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentScores.map((score) => (
                  <TableRow key={score.id}>
                    <TableCell className="font-medium">{score.student_name}</TableCell>
                    <TableCell>{score.student_id}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-primary">
                        {score.total_score !== null ? score.total_score : "N/A"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={score.status === "completed" ? "default" : "secondary"}>
                        {score.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(score.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {score.completed_at ? new Date(score.completed_at).toLocaleString() : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setScoresDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
