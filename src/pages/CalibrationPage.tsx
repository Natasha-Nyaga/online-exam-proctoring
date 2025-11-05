import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Clock } from "lucide-react";
import { useKeystrokeDynamics } from "@/hooks/useKeystrokeDynamics";
import { useMouseDynamics } from "@/hooks/useMouseDynamics";

interface CalibrationQuestion {
  id: number;
  text: string;
  type: "essay" | "mcq";
  options?: string[];
}

const CALIBRATION_QUESTIONS: CalibrationQuestion[] = [
  {
    id: 1,
    type: "essay",
    text: "Describe your typical study routine and how you prepare for exams. Include details about your study environment, time management, and preferred learning methods.",
  },
  {
    id: 2,
    type: "essay",
    text: "What are your academic goals for this course? Explain what you hope to learn and how you plan to achieve these goals.",
  },
  {
    id: 3,
    type: "mcq",
    text: "How would you rate your confidence level in taking online exams?",
    options: ["Very confident", "Somewhat confident", "Neutral", "Somewhat uncertain", "Very uncertain"],
  },
  {
    id: 4,
    type: "mcq",
    text: "Which learning style do you prefer most?",
    options: ["Visual (diagrams, charts)", "Auditory (lectures, discussions)", "Reading/Writing", "Kinesthetic (hands-on)", "Multimodal (combination)"],
  },
  {
    id: 5,
    type: "essay",
    text: "Reflect on a challenging academic experience you've faced and how you overcame it. What did you learn from this experience?",
  },
  {
    id: 6,
    type: "mcq",
    text: "How many hours per week do you typically dedicate to studying for this course?",
    options: ["Less than 3 hours", "3-5 hours", "6-10 hours", "11-15 hours", "More than 15 hours"],
  },
];

const CALIBRATION_DURATION = 10 * 60; // 10 minutes in seconds

const CalibrationPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const examId = searchParams.get("examId");
  const { toast } = useToast();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(CALIBRATION_DURATION);
  const [loading, setLoading] = useState(true);

  const keystrokeDynamics = useKeystrokeDynamics();
  const mouseDynamics = useMouseDynamics();

  useEffect(() => {
    const initializeCalibration = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/student-login");
        return;
      }

      // Create calibration session
      const { data: sessionData } = await supabase
        .from("calibration_sessions")
        .insert({
          student_id: session.user.id,
          status: "in_progress",
        })
        .select()
        .single();

      if (sessionData) {
        setSessionId(sessionData.id);
      }

      console.log("[CalibrationPage] Calibration session started for student:", session?.user?.id);

      setLoading(false);
    };

    initializeCalibration();
  }, [navigate]);

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

  const handleAnswerChange = (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const saveBehavioralMetrics = async (questionIndex: number) => {
    if (!sessionId) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const currentQuestion = CALIBRATION_QUESTIONS[questionIndex];

    console.log("[CalibrationPage] Saving behavioral metrics for question", questionIndex);

    if (currentQuestion.type === "essay") {
      const metrics = keystrokeDynamics.getCurrentMetrics();
      
      await supabase.from("behavioral_metrics").insert({
        calibration_session_id: sessionId,
        student_id: session.user.id,
        metric_type: "keystroke",
        question_type: "essay",
        question_index: questionIndex,
        dwell_times: metrics.dwellTimes as any,
        flight_times: metrics.flightTimes as any,
        typing_speed: metrics.typingSpeed,
        error_rate: metrics.errorRate,
        key_sequence: metrics.keySequence as any,
      } as any);

      keystrokeDynamics.resetMetrics();
    } else if (currentQuestion.type === "mcq") {
      const metrics = mouseDynamics.getCurrentMetrics();
      
      await supabase.from("behavioral_metrics").insert({
        calibration_session_id: sessionId,
        student_id: session.user.id,
        metric_type: "mouse",
        question_type: "mcq",
        question_index: questionIndex,
        cursor_positions: metrics.cursorPositions as any,
        movement_speed: metrics.movementSpeed,
        acceleration: metrics.acceleration,
        click_frequency: metrics.clickFrequency,
        hover_times: metrics.hoverTimes as any,
        trajectory_smoothness: metrics.trajectorySmoothness,
        click_positions: metrics.clickPositions as any,
      } as any);

      mouseDynamics.resetMetrics();
    }
  };

  const handleNext = async () => {
    await saveBehavioralMetrics(currentQuestionIndex);

    if (currentQuestionIndex < CALIBRATION_QUESTIONS.length - 1) {
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
      // Save metrics for the current question
      await saveBehavioralMetrics(currentQuestionIndex);

      // Update session status
      await supabase
        .from("calibration_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", sessionId);

      console.log("[CalibrationPage] Calibration complete for session:", sessionId);

      toast({
        title: "Calibration completed!",
        description: "Your behavioral baseline has been recorded.",
        className: "bg-success text-success-foreground",
      });

      if (examId) {
        navigate(`/exam/${examId}`);
      } else {
        navigate("/student-dashboard");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to complete calibration",
        className: "bg-error text-error-foreground",
      });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading calibration...</div>;
  }

  const currentQuestion = CALIBRATION_QUESTIONS[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / CALIBRATION_QUESTIONS.length) * 100;
  const answeredCount = Object.keys(answers).length;

  return (
  <div className="min-h-screen bg-background">
      {/* Monitoring Notice */}
      <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-center gap-2">
        <div className="flex items-center gap-2 animate-pulse">
          <div className="h-3 w-3 rounded-full bg-primary-foreground" />
          <AlertCircle className="h-4 w-4" />
        </div>
        <span className="font-medium">Calibration in Progress - Behavioral Monitoring Active</span>
      </div>

      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-xl font-bold">Behavioral Calibration Phase</h1>
              <p className="text-sm text-muted-foreground">Establishing your behavioral baseline</p>
            </div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="h-5 w-5" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                Question {currentQuestionIndex + 1} of {CALIBRATION_QUESTIONS.length}
              </span>
              <span>
                Answered: {answeredCount} / {CALIBRATION_QUESTIONS.length}
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
            <div className="mb-4">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                {currentQuestion.type === "essay" ? "Essay Question" : "Multiple Choice"}
              </span>
            </div>
            <h2 className="text-lg font-semibold mb-6">{currentQuestion.text}</h2>

            {currentQuestion.type === "mcq" && currentQuestion.options ? (
              <RadioGroup
                value={answers[currentQuestion.id] || ""}
                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
              >
                <div 
                  className="space-y-3"
                  onMouseMove={mouseDynamics.handleMouseMove}
                  onClick={mouseDynamics.handleClick}
                >
                  {currentQuestion.options.map((option, index) => (
                    <div 
                      key={index} 
                      className="flex items-center space-x-2 p-3 rounded-md border hover:bg-accent transition-colors"
                      onMouseEnter={() => mouseDynamics.handleMouseEnter(index)}
                      onMouseLeave={mouseDynamics.handleMouseLeave}
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
                value={answers[currentQuestion.id] || ""}
                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                onKeyDown={keystrokeDynamics.handleKeyDown}
                onKeyUp={keystrokeDynamics.handleKeyUp}
                placeholder="Type your answer here... (Your typing patterns are being recorded for calibration)"
                className="min-h-[250px]"
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

              {currentQuestionIndex === CALIBRATION_QUESTIONS.length - 1 ? (
                <Button onClick={handleSubmit}>Complete Calibration</Button>
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

export default CalibrationPage;
