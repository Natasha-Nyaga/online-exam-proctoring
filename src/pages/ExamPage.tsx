import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Clock } from "lucide-react";
import { AlertCircle, Clock } from "lucide-react";

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  options: any;
  order_number: number;
}

const ExamPage = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [examTitle, setExamTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string>("");

  useEffect(() => {
    const initializeExam = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !userData?.user?.id) {
        navigate("/student-login");
        return;
      }
      setStudentId(userData.user.id);

      // Check for existing paused session
      const { data: existingSession } = await supabase
        .from("exam_sessions")
        .select("*")
        .eq("exam_id", examId)
        .eq("student_id", session.user.id)
        .eq("status", "in_progress")
        .single();

      // Get exam details
      const { data: examData } = await supabase
        .from("exams")
        .select("title, duration_minutes")
        .eq("id", examId)
        .single();

      if (examData) {
        setExamTitle(examData.title);
        
        // Calculate remaining time if resuming
        if (existingSession) {
          const elapsedMinutes = Math.floor(
            (Date.now() - new Date(existingSession.started_at).getTime()) / 60000
          );
          const remainingMinutes = examData.duration_minutes - elapsedMinutes;
          setTimeLeft(Math.max(0, remainingMinutes * 60));
          setSessionId(existingSession.id);
        } else {
          setTimeLeft(examData.duration_minutes * 60);
        }
      }

      // Get questions
      const { data: questionsData } = await supabase
        .from("questions")
        .select("*")
        .eq("exam_id", examId)
        .order("order_number");

      if (questionsData) {
        setQuestions(questionsData);
      }

      // Create or use existing exam session
      if (!existingSession) {
        const { data: sessionData } = await supabase
          .from("exam_sessions")
          .insert({
            exam_id: examId,
            student_id: session.user.id,
            status: "in_progress",
          })
          .select()
          .single();

        if (sessionData) {
          setSessionId(sessionData.id);
        }
      } else {
        // Load previous answers
        const { data: previousAnswers } = await supabase
          .from("answers")
          .select("question_id, answer_text")
          .eq("session_id", existingSession.id);

        if (previousAnswers) {
          const answersMap = previousAnswers.reduce((acc, ans) => {
            acc[ans.question_id] = ans.answer_text;
            return acc;
          }, {} as Record<string, string>);
          setAnswers(answersMap);
        }
      }

      setLoading(false);
    };
    initializeExam();
  }, [examId, navigate]);

  useEffect(() => {
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!sessionId) return;

    try {
      // Save all answers
      const answerInserts = Object.entries(answers).map(([questionId, answer]) => ({
        session_id: sessionId,
        question_id: questionId,
        answer_text: answer,
      }));

      await supabase.from("answers").insert(answerInserts);

      // Update session status
      await supabase
        .from("exam_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", sessionId);

      toast({
        title: "Exam submitted!",
        description: "Your answers have been recorded.",
        className: "bg-success text-success-foreground",
      });

      navigate("/exam-complete");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit exam",
        className: "bg-error text-error-foreground",
      });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading exam...</div>;
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Monitoring Notice */}
      <div className="bg-error text-error-foreground px-4 py-2 flex items-center justify-center gap-2">
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-3 w-3 rounded-full bg-error-foreground" />
          <AlertCircle className="h-4 w-4" />
        </div>
        <span className="font-medium">Monitoring in Progress</span>
      </div>

      {/* Monitoring component removed: ExamMonitor was deleted */}

      {/* Header */}
      <header className="border-b bg-secondary shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold text-secondary-foreground">{examTitle}</h1>
            <div className="flex items-center gap-2 text-lg font-semibold text-secondary-foreground">
              <Clock className="h-5 w-5" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
              <span>
                Answered: {answeredCount} / {questions.length}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
      </header>

      {/* Question */}
      <main className="container mx-auto px-4 py-8">
        <Card className="max-w-3xl mx-auto">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold mb-6">{currentQuestion?.question_text}</h2>

            {currentQuestion?.question_type === "mcq" && currentQuestion.options ? (
              <RadioGroup
                value={answers[currentQuestion.id] || ""}
                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
              >
                <div className="space-y-3">
                  {currentQuestion.options.map((option, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`option-${index}`} />
                      <Label htmlFor={`option-${index}`} className="cursor-pointer">
                        {option}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            ) : (
              <Textarea
                value={answers[currentQuestion?.id] || ""}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                placeholder="Type your answer here..."
                className="min-h-[200px]"
              />
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              <Button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
                variant="outline"
              >
                Previous
              </Button>

              {currentQuestionIndex === questions.length - 1 ? (
                <Button onClick={handleSubmit}>Submit Exam</Button>
              ) : (
                <Button onClick={handleNext}>Next</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ExamPage;
