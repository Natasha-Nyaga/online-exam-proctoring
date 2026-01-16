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

interface CalibrationQuestion {
    id: number;
    text: string;
    type: "essay" | "mcq";
    options?: string[];
}

const CALIBRATION_QUESTIONS: CalibrationQuestion[] = [
    { id: 1, type: "essay", text: "Describe your typical study routine and how you prepare for exams. Include details about your study environment, time management, and preferred learning methods." },
    { id: 2, type: "essay", text: "What are your academic goals for this course? Explain what you hope to learn and how you plan to achieve these goals." },
    { id: 3, type: "essay", text: "Reflect on a challenging academic experience you've faced and how you overcame it. What did you learn from this experience?" },
    { id: 4, type: "essay", text: "Explain how you manage distractions while studying or taking online exams. What strategies help you stay focused?" },
    { id: 5, type: "essay", text: "Describe your ideal learning environment and how it influences your performance in online or in-person classes." },
    { id: 6, type: "essay", text: "Discuss how you usually prepare for high-pressure academic tasks. How do you manage stress and maintain productivity?" },
    { id: 7, type: "essay", text: "Explain a study technique or learning method that has significantly improved your academic performance. Why does it work for you?" },
    { id: 8, type: "essay", text: "Describe how you balance academic responsibilities with other commitments such as work, family, or extracurricular activities." },
    { id: 9, type: "essay", text: "In your own words, explain what motivates you to perform well academically. How do you stay motivated throughout the semester?" },
    { id: 10, type: "essay", text: "Reflect on a time when you had to learn a difficult concept. How did you approach it, and what steps did you take to fully understand it?" }
];

const CALIBRATION_DURATION = 10 * 60; // 10 minutes

const CalibrationPage = () => {
    const keystrokeDynamics = useKeystrokeDynamics();
    const mouseDynamics = useMouseDynamics();

    // Global Mouse Event Listeners
    useEffect(() => {
        const handleMouseEvent = (type: string, e: MouseEvent | Event) => {
            const mouseEvent = e as MouseEvent;
            if (mouseDynamics.cursorPositions && mouseDynamics.cursorPositions.current) {
                mouseDynamics.cursorPositions.current.push({
                    type,
                    timestamp: Date.now(),
                    x: mouseEvent.clientX || 0,
                    y: mouseEvent.clientY || 0,
                    // tab: document.hidden ? 'inactive' : 'active'
                });
            }
        };

        const onVisibilityChange = () => {
            handleMouseEvent(document.hidden ? 'blur' : 'focus', new Event('visibilitychange'));
        };

        window.addEventListener('mousemove', (e) => handleMouseEvent('move', e));
        window.addEventListener('copy', (e) => handleMouseEvent('copy', e));
        window.addEventListener('cut', (e) => handleMouseEvent('cut', e));
        window.addEventListener('paste', (e) => handleMouseEvent('paste', e));
        window.addEventListener('dblclick', (e) => handleMouseEvent('dblclick', e));
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            window.removeEventListener('mousemove', (e) => handleMouseEvent('move', e));
            window.removeEventListener('copy', (e) => handleMouseEvent('copy', e));
            window.removeEventListener('cut', (e) => handleMouseEvent('cut', e));
            window.addEventListener('paste', (e) => handleMouseEvent('paste', e));
            window.removeEventListener('dblclick', (e) => handleMouseEvent('dblclick', e));
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [mouseDynamics]);

    // Global Keystroke Listeners
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            keystrokeDynamics.handleKeyDown(e);
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            keystrokeDynamics.handleKeyUp(e);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [keystrokeDynamics]);

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const examId = searchParams.get("examId");
    const { toast } = useToast();

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(CALIBRATION_DURATION);
    const [loading, setLoading] = useState(true);

    // Debug logging
    useEffect(() => {
        const interval = setInterval(() => {
            const kMetrics = keystrokeDynamics.getCurrentMetrics();
            const mMetrics = mouseDynamics.getCurrentMetrics();
            console.log("[Calibration Debug] Keystroke events:", kMetrics.totalEvents);
            console.log("[Calibration Debug] Mouse events:", mMetrics.cursorPositions.length);
        }, 5000);
        return () => clearInterval(interval);
    }, [keystrokeDynamics, mouseDynamics]);

    useEffect(() => {
        const initializeCalibration = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate("/student-login");
                return;
            }

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

            console.log("[CalibrationPage] Session started:", session?.user?.id);
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

    const postCalibrationBaseline = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const studentId = session?.user?.id;
        if (!studentId || !sessionId) return;

        const keystrokeEvents: import("@/hooks/useKeystrokeDynamics").KeystrokeEvent[] = keystrokeDynamics.keystrokeEvents.current || [];
        const mouseEvents: import("@/hooks/useMouseDynamics").CursorPos[] = mouseDynamics.cursorPositions.current || [];

        console.log("\n" + "=".repeat(60));
        console.log("[Calibration] Submitting baseline data");
        console.log(`[Calibration] Keystroke events: ${keystrokeEvents.length}`);
        console.log(`[Calibration] Mouse events: ${mouseEvents.length}`);
        console.log("=".repeat(60) + "\n");

        if (!keystrokeEvents.length && !mouseEvents.length) {
            toast({
                title: "Calibration Error",
                description: "No behavioral data recorded. Please interact with the questions.",
                variant: "destructive"
            });
            console.error("[Calibration] No events to submit");
            return;
        }

        if (!keystrokeEvents.length) {
            toast({
                title: "Warning",
                description: "No keystroke data recorded. Calibration may be incomplete.",
                variant: "destructive"
            });
        }

        try {
            const payload = {
                student_id: studentId,
                calibration_session_id: sessionId,
                course_name: "General",
                keystroke_events: keystrokeEvents,
                mouse_events: mouseEvents,
            };

            console.log("[Calibration] Sending payload to backend...");
            
            const response = await fetch("http://127.0.0.1:5000/api/calibration/save-baseline", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            console.log("[Calibration] Backend response:", result);

            if (result.status === "baseline_saved") {
                console.log("[Calibration] ✓ Baseline saved successfully!");
                console.log(`[Calibration] Threshold: ${result.threshold}`);
                console.log(`[Calibration] Baseline quality: ${result.stats?.baseline_quality}`);
                
                toast({
                    title: "Calibration Complete! ✅",
                    description: `Baseline established. Threshold: ${result.threshold?.toFixed(2)}`,
                });
            } else {
                console.warn("[Calibration] Unexpected response:", result);
            }

        } catch (err) {
            console.error("[Calibration] Baseline POST error:", err);
            toast({
                title: "Network Error",
                description: "Failed to save calibration data. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleNext = () => {
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
                description: "Calibration session not initialized.",
                variant: "destructive"
            });
            return;
        }

        // 1. Post baseline to backend
        await postCalibrationBaseline();

        // 2. Update Supabase session status
        const { error } = await supabase
            .from("calibration_sessions")
            .update({
                status: "completed",
                completed_at: new Date().toISOString()
            })
            .eq("id", sessionId);

        if (error) {
            console.error("Supabase update failed:", error);
            toast({
                title: "Database Error",
                description: "Failed to mark calibration as complete.",
                variant: "destructive"
            });
            return;
        }

        // 3. Reset dynamics
        keystrokeDynamics.resetMetrics();
        mouseDynamics.resetMetrics();

        if (examId) navigate(`/exam/${examId}`);
        else navigate("/student-dashboard");
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p>Loading calibration...</p>
                </div>
            </div>
        );
    }

    const currentQuestion = CALIBRATION_QUESTIONS[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / CALIBRATION_QUESTIONS.length) * 100;
    const answeredCount = Object.keys(answers).length;

    return (
        <div className="min-h-screen bg-background">
            {/* Monitoring Banner */}
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
                            <span>Question {currentQuestionIndex + 1} of {CALIBRATION_QUESTIONS.length}</span>
                            <span>Answered: {answeredCount} / {CALIBRATION_QUESTIONS.length}</span>
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

                        {currentQuestion.type === "mcq" && currentQuestion.options ? (
                            <RadioGroup
                                value={answers[currentQuestion.id] || ""}
                                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                            >
                                <div className="space-y-3">
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
                                placeholder="Type your answer here... (Your typing patterns are being recorded)"
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