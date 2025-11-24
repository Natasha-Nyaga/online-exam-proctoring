import { useEffect, useState, useRef, useCallback } from "react";
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

// --- CONFIGURATION ---
// IMPORTANT: Replace with your actual backend URL for the anomaly endpoint
const ANALYZE_BEHAVIOR_ENDPOINT = "http://localhost:5000/api/exam/analyze_behavior";
const MONITORING_INTERVAL_MS = 10000; // 10 seconds

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

  // --- Exam State ---
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [examTitle, setExamTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string>("");
  const [isAlerted, setIsAlerted] = useState(false);

  // --- Biometric Buffers ---
  const mouseBuffer = useRef<any[]>([]);
  const keyBuffer = useRef<any[]>([]);
  const lastSubmissionTime = useRef<number>(Date.now());

  // =========================================================================
  // SECTION 1: CORE EXAM LOGIC (TIME, QUESTIONS, ANSWERS)
  // =========================================================================

  const handleSubmit = useCallback(async () => {
    if (!sessionId) return;

    // Clear the anomaly monitoring interval to ensure no data is sent after submission
    // (This requires the interval to be defined outside of this function scope or cleared 
    // using a ref if necessary, but stopping the page navigation is usually enough.)

    try {
      // 1. Save all answers
      const answerInserts = Object.entries(answers).map(([questionId, answer]) => ({
        session_id: sessionId,
        question_id: questionId,
        answer_text: answer,
        // Assuming your 'answers' table can handle upserts/inserts based on session_id + question_id
      }));

      // NOTE: This insert needs to be robust (handle existing answers gracefully)
      // A simple insert will fail if answers already exist. Consider a batch upsert or 'on conflict' logic.
      await supabase.from("answers").upsert(answerInserts, { onConflict: 'session_id, question_id' });


      // 2. Update session status
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
      console.error("Submission Error:", error);
      toast({
        title: "Error",
        description: "Failed to submit exam",
        className: "bg-error text-error-foreground",
      });
    }
  }, [sessionId, answers, navigate, toast]); // Added handleSubmit to dependencies

  // --- Exam Initialization (Runs once) ---
  useEffect(() => {
    const initializeExam = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !userData?.user?.id) {
        navigate("/student-login");
        return;
      }
      const currentStudentId = userData.user.id;
      setStudentId(currentStudentId);

      // 1. Check for existing paused session (and get exam details)
      const [{ data: existingSession }, { data: examData }] = await Promise.all([
        supabase.from("exam_sessions").select("*").eq("exam_id", examId).eq("student_id", currentStudentId).eq("status", "in_progress").single(),
        supabase.from("exams").select("title, duration_minutes").eq("id", examId).single(),
      ]);

      if (!examData) {
        setLoading(false);
        toast({ title: "Error", description: "Exam not found.", variant: "destructive" });
        return;
      }

      setExamTitle(examData.title);

      let currentSessionId: string | null = null;
      let initialTimeLeft = examData.duration_minutes * 60;

      // Calculate remaining time if resuming
      if (existingSession) {
        const elapsedSeconds = Math.floor(
          (Date.now() - new Date(existingSession.started_at).getTime()) / 1000
        );
        initialTimeLeft = Math.max(0, (examData.duration_minutes * 60) - elapsedSeconds);
        currentSessionId = existingSession.id;
        
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

      } else {
        // Create new exam session
        const { data: sessionData } = await supabase
          .from("exam_sessions")
          .insert({
            exam_id: examId,
            student_id: currentStudentId,
            status: "in_progress",
          })
          .select()
          .single();

        if (sessionData) {
          currentSessionId = sessionData.id;
        }
      }

      setSessionId(currentSessionId);
      setTimeLeft(initialTimeLeft);
      
      // Get questions
      const { data: questionsData } = await supabase
        .from("questions")
        .select("*")
        .eq("exam_id", examId)
        .order("order_number");

      if (questionsData) {
        setQuestions(questionsData);
      }

      setLoading(false);
    };
    initializeExam();
  }, [examId, navigate, toast]);

  // --- Timer Countdown ---
  useEffect(() => {
    if (loading || !sessionId) return;
    if (timeLeft <= 0) {
      handleSubmit(); // Auto-submit when time runs out
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, loading, sessionId, handleSubmit]);


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

  // =========================================================================
  // SECTION 2: BIOMETRIC DATA COLLECTION
  // =========================================================================

  // --- Event Listeners ---
  useEffect(() => {
    // Mouse event handler (captures move, copy, cut, paste, dblclick)
    const handleMouseEvent = (type: string, e: MouseEvent | Event) => {
      const mouseEvent = e as MouseEvent;
      mouseBuffer.current.push({
        type,
        timestamp: Date.now(),
        x: mouseEvent.clientX || 0,
        y: mouseEvent.clientY || 0
      });
    };

    // Keystroke handler (captures key presses)
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      keyBuffer.current.push({
        key: e.key,
        down_time: now,
        up_time: now,
        timestamp: now,
        type: 'keydown'
      });
    };
    
    // Tab Visibility Change handler (for 'focus'/'blur' behavior)
    const onVisibilityChange = () => {
      handleMouseEvent(document.hidden ? 'blur' : 'focus', new Event('')); // Pass a generic event
    };

    // Attach Listeners
    window.addEventListener('mousemove', (e) => handleMouseEvent('move', e));
    window.addEventListener('copy', (e) => handleMouseEvent('copy', e));
    window.addEventListener('cut', (e) => handleMouseEvent('cut', e));
    window.addEventListener('paste', (e) => handleMouseEvent('paste', e));
    window.addEventListener('dblclick', (e) => handleMouseEvent('dblclick', e));
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', (e) => handleMouseEvent('move', e));
      window.removeEventListener('copy', (e) => handleMouseEvent('copy', e));
      window.removeEventListener('cut', (e) => handleMouseEvent('cut', e));
      window.removeEventListener('paste', (e) => handleMouseEvent('paste', e));
      window.removeEventListener('dblclick', (e) => handleMouseEvent('dblclick', e));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // --- Data Sender Interval ---
  useEffect(() => {
    if (!sessionId || !studentId) return;

    const sendBiometrics = async () => {
      if (mouseBuffer.current.length === 0 && keyBuffer.current.length === 0) return;

      const currentTime = Date.now();
      
      const payload = {
        student_id: String(studentId),
        exam_id: String(examId),
        exam_session_id: String(sessionId),
        start_timestamp: Number(lastSubmissionTime.current),
        end_timestamp: Number(currentTime),
        mouse_events: [...mouseBuffer.current],
        keystroke_events: [...keyBuffer.current],
        // NOTE: Video score would be added here if you implemented video analytics
        // video_score: [latest_video_analysis_score]
      };

      // Clear buffers and update last submission time immediately
      mouseBuffer.current = [];
      keyBuffer.current = [];
      lastSubmissionTime.current = currentTime;

      try {
        const response = await fetch(ANALYZE_BEHAVIOR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        /*...*/
        const data = await response.json();
        console.log("AI Analysis:", data);

        // Check for high anomaly score from the Fusion Model
        if (data.analysis?.fusion_risk_score > 0.7) { // Assuming risk score is 0 to 1
            setIsAlerted(true); // Set state to show a visual warning to the student/admin
            toast({
              title: "Security Alert!",
              description: "Suspicious behavior detected. Your session is being closely monitored.",
              className: "bg-error text-error-foreground",
              duration: 5000,
            });
        }

      } catch (error) {
        console.error("Error sending biometrics:", error);
      }
    };

    const interval = setInterval(sendBiometrics, MONITORING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, studentId, examId, toast]);

  // =========================================================================
  // SECTION 3: RENDER
  // =========================================================================

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading exam...</div>;
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Monitoring Notice */}
      <div className={`px-4 py-2 flex items-center justify-center gap-2 ${isAlerted ? 'bg-red-700 text-white animate-pulse' : 'bg-error text-error-foreground'}`}>
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${isAlerted ? 'bg-white' : 'bg-error-foreground'}`} />
          <AlertCircle className="h-4 w-4" />
        </div>
        <span className="font-medium">Monitoring in Progress {isAlerted ? '(HIGH ALERT)' : ''}</span>
      </div>

      {/* Header */}
      <header className="border-b bg-secondary shadow-sm">
        {/* ... (Header content remains the same) ... */}
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
        {/* ... (Main content remains the same) ... */}
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