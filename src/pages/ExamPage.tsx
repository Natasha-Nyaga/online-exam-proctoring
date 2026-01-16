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

const ANALYZE_BEHAVIOR_ENDPOINT = "http://localhost:5000/api/exam/analyze_behavior";
const MONITORING_INTERVAL_MS = 10000; // 10 seconds
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://qoidbubsollxvsuyqcir.supabase.co";

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

  // Exam State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [examTitle, setExamTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState<string>("");
  const [isAlerted, setIsAlerted] = useState(false);

  // Biometric Buffers
  const mouseBuffer = useRef<any[]>([]);
  const keyBuffer = useRef<any[]>([]);
  const lastSubmissionTime = useRef<number>(Date.now());
  
  // Track key press times for proper up_time/down_time calculation
  const keyDownTimes = useRef<Map<string, number>>(new Map());

  // =========================================================================
  // BIOMETRIC DATA COLLECTION - FIXED
  // =========================================================================

  useEffect(() => {
    // Mouse event handler
    const handleMouseEvent = (type: string, e: MouseEvent | Event) => {
      const mouseEvent = e as MouseEvent;
      mouseBuffer.current.push({
        type,
        timestamp: Date.now(),
        t: Date.now(), // Backend accepts both 'timestamp' and 't'
        x: mouseEvent.clientX || 0,
        y: mouseEvent.clientY || 0,
        event_type: type, // Backend looks for 'event_type' for copy/paste/dblclick
        tab: document.hidden ? 'inactive' : 'active' // For inactive_duration calculation
      });
    };

    // FIXED: Proper keystroke capture with separate keydown/keyup
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const key = e.key;
      
      // Store down time for this key
      keyDownTimes.current.set(key, now);
      
      // Add keydown event
      keyBuffer.current.push({
        key: key,
        type: 'keydown',
        timestamp: now,
        down_time: now,
      });
      
      console.log(`[Keystroke] Down: ${key} at ${now}`);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const now = Date.now();
      const key = e.key;
      
      // Get the corresponding down time
      const downTime = keyDownTimes.current.get(key) || now;
      
      // Add keyup event
      keyBuffer.current.push({
        key: key,
        type: 'keyup',
        timestamp: now,
        up_time: now,
        down_time: downTime, // Include down_time for reference
      });
      
      // Clean up
      keyDownTimes.current.delete(key);
      
      console.log(`[Keystroke] Up: ${key} at ${now} (held for ${now - downTime}ms)`);
    };
    
    // Tab visibility for focus/blur
    const onVisibilityChange = () => {
      handleMouseEvent(document.hidden ? 'blur' : 'focus', new Event('visibilitychange'));
    };

    // Attach all listeners
    window.addEventListener('mousemove', (e) => handleMouseEvent('move', e));
    window.addEventListener('copy', (e) => handleMouseEvent('copy', e));
    window.addEventListener('cut', (e) => handleMouseEvent('cut', e));
    window.addEventListener('paste', (e) => handleMouseEvent('paste', e));
    window.addEventListener('dblclick', (e) => handleMouseEvent('dblclick', e));
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp); // ADDED!

    // Debug log every 5 seconds
    const debugInterval = setInterval(() => {
      console.log(`[Exam Debug] Keystroke buffer: ${keyBuffer.current.length} events`);
      console.log(`[Exam Debug] Mouse buffer: ${mouseBuffer.current.length} events`);
      if (keyBuffer.current.length > 0) {
        console.log(`[Exam Debug] Last 3 keystrokes:`, keyBuffer.current.slice(-3));
      }
    }, 5000);

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', (e) => handleMouseEvent('move', e));
      window.removeEventListener('copy', (e) => handleMouseEvent('copy', e));
      window.removeEventListener('cut', (e) => handleMouseEvent('cut', e));
      window.removeEventListener('paste', (e) => handleMouseEvent('paste', e));
      window.removeEventListener('dblclick', (e) => handleMouseEvent('dblclick', e));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(debugInterval);
    };
  }, []);

  // =========================================================================
  // PERIODIC ANALYSIS SUBMISSION
  // =========================================================================

  const postExamBehavior = async () => {
    if (!sessionId || !studentId) {
      console.log('[Analysis] Skipping - no session or student ID');
      return;
    }

    // Check if we have enough data
    if (keyBuffer.current.length === 0 && mouseBuffer.current.length === 0) {
      console.log('[Analysis] Skipping - no events collected yet');
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('[Analysis] Sending behavioral data to backend');
    console.log(`[Analysis] Keystroke events: ${keyBuffer.current.length}`);
    console.log(`[Analysis] Mouse events: ${mouseBuffer.current.length}`);
    console.log('='.repeat(60) + '\n');

    const payload = {
      student_id: String(studentId),
      exam_session_id: String(sessionId),
      start_timestamp: Number(lastSubmissionTime.current),
      end_timestamp: Date.now(),
      mouse_events: [...mouseBuffer.current],
      key_events: [...keyBuffer.current], // Backend expects 'key_events'
    };

    try {
      const response = await fetch(ANALYZE_BEHAVIOR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      console.log('[Analysis] Backend response:', result);

      // Handle anomaly detection
      if (result.status === 'analyzed' && result.analysis) {
        const { fusion_risk_score, threshold_exceeded, cheating_incident_count } = result.analysis;
        
        console.log(`[Analysis] Risk Score: ${fusion_risk_score.toFixed(4)}`);
        console.log(`[Analysis] Threshold Exceeded: ${threshold_exceeded}`);
        console.log(`[Analysis] Total Incidents: ${cheating_incident_count}`);

        if (threshold_exceeded) {
          setIsAlerted(true);
          toast({
            title: "⚠️ Behavioral Anomaly Detected",
            description: `Unusual behavior detected. Incident #${cheating_incident_count}`,
            variant: "destructive",
          });

          // Reset alert after 5 seconds
          setTimeout(() => setIsAlerted(false), 5000);
        } else {
          setIsAlerted(false);
        }
      } else if (result.status === 'no_baseline') {
        console.warn('[Analysis] No baseline found for student');
        toast({
          title: "Calibration Required",
          description: "Please complete calibration first",
          variant: "destructive",
        });
      }

      // Clear buffers AFTER successful submission
      mouseBuffer.current = [];
      keyBuffer.current = [];
      lastSubmissionTime.current = Date.now();

    } catch (err) {
      console.error('[Analysis] POST error:', err);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze behavior. Monitoring continues.",
        variant: "destructive",
      });
    }
  };

  // Set up periodic submission
  useEffect(() => {
    if (!sessionId || !studentId) return;

    const interval = setInterval(postExamBehavior, MONITORING_INTERVAL_MS);
    
    console.log(`[Exam] Behavioral monitoring started (every ${MONITORING_INTERVAL_MS/1000}s)`);

    return () => {
      clearInterval(interval);
      console.log('[Exam] Behavioral monitoring stopped');
    };
  }, [sessionId, studentId]);

  // =========================================================================
  // EXAM SUBMISSION
  // =========================================================================

  const handleSubmit = useCallback(async () => {
    if (!sessionId) return;

    console.log('[Exam] Submitting exam...');

    try {
      // 1. Final behavioral analysis before submission
      await postExamBehavior();

      // 2. Save all answers
      const answerInserts = Object.entries(answers).map(([questionId, answer]) => ({
        session_id: sessionId,
        question_id: questionId,
        answer_text: answer,
      }));

      await supabase.from("answers").upsert(answerInserts, { onConflict: 'session_id, question_id' });

      // 3. Update session status
      const { error } = await supabase
        .from("exam_sessions")
        .update({ 
          status: "completed", 
          completed_at: new Date().toISOString() 
        })
        .eq("id", sessionId);

      if (error) {
        console.error("[Exam] Supabase update failed:", error);
        toast({
          title: "Database Error",
          description: "Failed to mark exam as complete.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Exam Submitted! ✅",
        description: "Your answers have been recorded.",
      });

      navigate("/exam-complete");

    } catch (error) {
      console.error("[Exam] Submission error:", error);
      toast({
        title: "Submission Error",
        description: "Failed to submit exam. Please try again.",
        variant: "destructive",
      });
    }
  }, [sessionId, answers, navigate, toast]);

  // =========================================================================
  // EXAM INITIALIZATION
  // =========================================================================

  useEffect(() => {
    const initializeExam = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/student-login");
        return;
      }

      const studentIdFromAuth = session.user.id;
      setStudentId(studentIdFromAuth);
      const accessToken = session.access_token;

      // Check for existing session
      const existingSessionResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/exam_sessions?exam_id=eq.${examId}&student_id=eq.${studentIdFromAuth}&status=eq.in_progress&select=*`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }
      );
      const existingSessionData = await existingSessionResponse.json();

      // Get exam details
      const { data: examData } = await supabase
        .from("exams")
        .select("title, duration_minutes")
        .eq("id", examId)
        .single();

      if (!examData) {
        setLoading(false);
        toast({ title: "Error", description: "Exam not found.", variant: "destructive" });
        return;
      }

      setExamTitle(examData.title);

      let currentSessionId: string | null = null;
      let initialTimeLeft = examData.duration_minutes * 60;

      // Resume existing session or create new
      if (existingSessionData && existingSessionData.length > 0) {
        const existingSession = existingSessionData[0];
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
        // Create new session
        const { data: sessionData } = await supabase
          .from("exam_sessions")
          .insert({
            exam_id: examId,
            student_id: studentIdFromAuth,
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

      console.log('[Exam] Initialization complete');
      console.log(`[Exam] Session ID: ${currentSessionId}`);
      console.log(`[Exam] Student ID: ${studentIdFromAuth}`);
      console.log(`[Exam] Time left: ${initialTimeLeft}s`);

      setLoading(false);
    };

    initializeExam();
  }, [examId, navigate, toast]);

  // Timer countdown
  useEffect(() => {
    if (loading || !sessionId) return;
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, loading, sessionId, handleSubmit]);

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================

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
  // RENDER
  // =========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading exam...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Monitoring Banner */}
      <div className={`px-4 py-2 flex items-center justify-center gap-2 transition-colors ${
        isAlerted ? 'bg-red-700 text-white animate-pulse' : 'bg-primary text-primary-foreground'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`h-3 w-3 rounded-full ${isAlerted ? 'bg-white' : 'bg-primary-foreground'}`} />
          <AlertCircle className="h-4 w-4" />
        </div>
        <span className="font-medium">
          {isAlerted ? '⚠️ BEHAVIORAL ANOMALY DETECTED' : 'Behavioral Monitoring Active'}
        </span>
      </div>

      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-bold">{examTitle}</h1>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="h-5 w-5" />
              <span className={timeLeft < 300 ? 'text-red-600' : ''}>
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
              <span>Answered: {answeredCount} / {questions.length}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </div>
      </header>

      {/* Question */}
      <main className="container mx-auto px-4 py-8">
        <Card className="max-w-3xl mx-auto">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold mb-6">
              {currentQuestion?.question_text}
            </h2>

            {currentQuestion?.question_type === "mcq" && currentQuestion.options ? (
              <RadioGroup
                value={answers[currentQuestion.id] || ""}
                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
              >
                <div className="space-y-3">
                  {currentQuestion.options.map((option: string, index: number) => (
                    <div 
                      key={index} 
                      className="flex items-center space-x-2 p-3 rounded-md border hover:bg-accent transition-colors"
                    >
                      <RadioGroupItem value={option} id={`option-${index}`} />
                      <Label htmlFor={`option-${index}`} className="cursor-pointer flex-1">
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
                placeholder="Type your answer here... (Your typing is being monitored)"
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
                <Button onClick={handleSubmit} className="bg-primary">
                  Submit Exam
                </Button>
              ) : (
                <Button onClick={handleNext}>
                  Next
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ExamPage;