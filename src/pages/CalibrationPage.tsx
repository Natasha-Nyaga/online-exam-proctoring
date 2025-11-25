import React from "react";
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
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config";

// --- Configuration and Data Definitions ---

interface CalibrationQuestion {
    id: number;
    text: string;
    type: "essay" | "mcq";
    options?: string[];
}

const CALIBRATION_QUESTIONS: CalibrationQuestion[] = [
    { id: 1, type: "essay", text: "Describe your typical study routine and how you prepare for exams. Include details about your study environment, time management, and preferred learning methods." },
    { id: 2, type: "essay", text: "What are your academic goals for this course? Explain what you hope to learn and how you plan to achieve these goals." },
    { id: 3, type: "mcq", text: "How would you rate your confidence level in taking online exams?", options: ["Very confident", "Somewhat confident", "Neutral", "Somewhat uncertain", "Very uncertain"] },
    { id: 4, type: "mcq", text: "Which learning style do you prefer most?", options: ["Visual (diagrams, charts)", "Auditory (lectures, discussions)", "Reading/Writing", "Kinesthetic (hands-on)", "Multimodal (combination)"] },
    { id: 5, type: "essay", text: "Reflect on a challenging academic experience you've faced and how you overcame it. What did you learn from this experience?" },
    { id: 6, type: "mcq", text: "How many hours per week do you typically dedicate to studying for this course?", options: ["Less than 3 hours", "3-5 hours", "6-10 hours", "11-15 hours", "More than 15 hours"] },
];

const CALIBRATION_DURATION = 10 * 60;
const DEFAULT_COURSE_NAME = "General";
const DEFAULT_THRESHOLD = 0.8;

const CalibrationPage = () => {

    const keystrokeDynamics = useKeystrokeDynamics();
    const mouseDynamics = useMouseDynamics();

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const examId = searchParams.get("examId");
    const { toast } = useToast();

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(CALIBRATION_DURATION);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => {
            console.log("[Calibration Debug] Keystroke:", keystrokeDynamics.getCurrentMetrics());
            console.log("[Calibration Debug] Mouse:", mouseDynamics.getCurrentMetrics());
        }, 3000);
        return () => clearInterval(interval);
    }, [keystrokeDynamics, mouseDynamics]);

    useEffect(() => {
        const initializeCalibration = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate("/student-login");
                return;
            }

            // Optional: Check for existing exam session (not strictly required)
            try {
                const studentId = session.user.id;
                const { data: { session: authSession } } = await supabase.auth.getSession();
                const accessToken = authSession?.access_token;
                await fetch(`${SUPABASE_URL}/rest/v1/exam_sessions?exam_id=eq.${examId}&student_id=eq.${studentId}&status=eq.in_progress&select=*`, {
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${accessToken}`,
                    },
                });
            } catch (err) {
                console.warn("[CalibrationPage] Ignoring exam_sessions fetch error:", err);
            }

            // Create a new calibration session record
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
    }, [navigate, examId]);

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

    // --- Single function to POST baseline to backend ---
    const postCalibrationBaseline = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const studentId = session?.user?.id;
        if (!studentId || !sessionId) return;

        // Collect all raw events from your hooks
        const keystrokeEvents = keystrokeDynamics.keystrokeEvents.current || [];
        const mouseEvents = mouseDynamics.cursorPositions.current || [];

        if (!keystrokeEvents.length && !mouseEvents.length) {
            toast({
                title: "Calibration Error",
                description: "No keystroke or mouse events recorded. Please interact with the calibration questions before submitting.",
                className: "bg-destructive text-destructive-foreground"
            });
            console.warn("[Calibration] No keystroke or mouse events to submit as baseline.");
            return;
        }
        if (!keystrokeEvents.length) {
            toast({
                title: "Calibration Warning",
                description: "No keystroke events recorded. Only mouse events will be used for baseline.",
                className: "bg-warning text-warning-foreground"
            });
            console.warn("[Calibration] No keystroke events recorded.");
        }
        if (!mouseEvents.length) {
            toast({
                title: "Calibration Warning",
                description: "No mouse events recorded. Only keystroke events will be used for baseline.",
                className: "bg-warning text-warning-foreground"
            });
            console.warn("[Calibration] No mouse events recorded.");
        }
        try {
            const payload = {
                student_id: studentId,
                calibration_session_id: sessionId,
                course_name: DEFAULT_COURSE_NAME,
                keystroke_events: keystrokeEvents,
                mouse_events: mouseEvents,
            };
            console.log("[Calibration] Baseline POST payload:", payload);
            const response = await fetch("http://127.0.0.1:5000/api/calibration/save-baseline", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            console.log("[Calibration] Baseline POST result:", result);
        } catch (err) {
            console.error("[Calibration] Baseline POST error:", err);
        }
    };

    const handleNext = async () => {
        setCurrentQuestionIndex(i => Math.min(i + 1, CALIBRATION_QUESTIONS.length - 1));
    };

    const handlePrevious = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex((prev) => prev - 1);
        }
    };

    const handleSubmit = async () => {
        if (!sessionId) {
            toast({
                title: "Error",
                description: "Calibration session not initialized. Please refresh.",
                className: "bg-destructive text-destructive-foreground"
            });
            return;
        }

        // 1. Post ALL accumulated raw data to the Flask server
        await postCalibrationBaseline();

        // 2. Update the Supabase session status to completed
        const { error } = await supabase
            .from("calibration_sessions")
            .update({
                status: "completed",
                completed_at: new Date().toISOString()
            })
            .eq("id", sessionId);

        if (error) {
            console.error("Supabase session update failed:", error);
            toast({
                title: "Database Error",
                description: "Failed to mark calibration session as complete.",
                className: "bg-destructive text-destructive-foreground"
            });
            return;
        }

        // 3. Final steps
        toast({
            title: "Calibration Complete! 🚀",
            description: "Your behavioral baseline data has been submitted and saved.",
        });

        // Reset dynamics after submission to clear the collected data
        keystrokeDynamics.resetMetrics();
        mouseDynamics.resetMetrics();

        if (examId) navigate(`/exam/${examId}`);
        else navigate("/student-dashboard");
    };

    if (loading) {
        return <div className="flex items-center justify-center min-h-screen">Loading calibration...</div>;
    }

    const currentQuestion = CALIBRATION_QUESTIONS[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / CALIBRATION_QUESTIONS.length) * 100;
    const answeredCount = Object.keys(answers).length;

    return (
        <div className="min-h-screen bg-background">
            {/* Monitoring Notice Banner */}
            <div className="bg-primary text-primary-foreground px-4 py-2 flex items-center justify-center gap-2">
                <div className="flex items-center gap-2 animate-pulse">
                    <div className="h-3 w-3 rounded-full bg-primary-foreground" />
                    <AlertCircle className="h-4 w-4" />
                </div>
                <span className="font-medium">Calibration in Progress - Behavioral Monitoring Active</span>
            </div>

            {/* Header with Timer and Progress */}
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
                            <span> Question {currentQuestionIndex + 1} of {CALIBRATION_QUESTIONS.length} </span>
                            <span> Answered: {answeredCount} / {CALIBRATION_QUESTIONS.length} </span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </div>
                </div>
            </header>

            {/* Question Area */}
            <main className="container mx-auto px-4 py-8">
                <Card className="max-w-3xl mx-auto">
                    <CardContent className="pt-6">
                        <div className="mb-4">
                            <span className="text-xs font-semibold uppercase text-muted-foreground">
                                {currentQuestion.type === "essay" ? "Essay Question" : "Multiple Choice"}
                            </span>
                        </div>
                        <h2 className="text-lg font-semibold mb-6">{currentQuestion.text}</h2>

                        {/* Conditional Rendering for Question Type */}
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
                                        <div key={index} className="flex items-center space-x-2 p-3 rounded-md border hover:bg-accent transition-colors">
                                            <RadioGroupItem value={option} id={`option-${index}`} />
                                            <Label htmlFor={`option-${index}`} className="cursor-pointer flex-1">{option}</Label>
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

                        {/* Navigation Buttons */}
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