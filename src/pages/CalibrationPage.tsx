import { useEffect, useState } from "react";
// React Router hooks for navigation and accessing URL parameters
import { useNavigate, useSearchParams } from "react-router-dom";
// Supabase client for authentication and database interaction
import { supabase } from "@/integrations/supabase/client";
// UI components from the Shadcn/UI library
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// Custom hook for displaying toast notifications
import { useToast } from "@/hooks/use-toast";
// Icons for visual feedback (AlertCircle for monitoring, Clock for timer)
import { AlertCircle, Clock } from "lucide-react";
// Custom hooks for capturing behavioral biometrics
import { useKeystrokeDynamics } from "@/hooks/useKeystrokeDynamics";
import { useMouseDynamics } from "@/hooks/useMouseDynamics";


// --- Configuration and Data Definitions ---

// TypeScript interface for a single calibration question
interface CalibrationQuestion {
    id: number;
    text: string;
    type: "essay" | "mcq"; // Type determines which metric (keystroke or mouse) is captured
    options?: string[];
}

// Static array of questions used for the calibration process
const CALIBRATION_QUESTIONS: CalibrationQuestion[] = [
    { id: 1, type: "essay", text: "Describe your typical study routine and how you prepare for exams. Include details about your study environment, time management, and preferred learning methods.", },
    { id: 2, type: "essay", text: "What are your academic goals for this course? Explain what you hope to learn and how you plan to achieve these goals.", },
    { id: 3, type: "mcq", text: "How would you rate your confidence level in taking online exams?", options: ["Very confident", "Somewhat confident", "Neutral", "Somewhat uncertain", "Very uncertain"], },
    { id: 4, type: "mcq", text: "Which learning style do you prefer most?", options: ["Visual (diagrams, charts)", "Auditory (lectures, discussions)", "Reading/Writing", "Kinesthetic (hands-on)", "Multimodal (combination)"], },
    { id: 5, type: "essay", text: "Reflect on a challenging academic experience you've faced and how you overcame it. What did you learn from this experience?", },
    { id: 6, type: "mcq", text: "How many hours per week do you typically dedicate to studying for this course?", options: ["Less than 3 hours", "3-5 hours", "6-10 hours", "11-15 hours", "More than 15 hours"], },
];

// Calibration duration in seconds (10 minutes)
const CALIBRATION_DURATION = 10 * 60;

// --- Main Component ---

const CalibrationPage = () => {
    // Environment variables for Supabase REST API access
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    // NOTE: fetchExamSession is defined but unused in the current component logic
    // It seems to be a vestige for checking exam session status before calibration.
    const fetchExamSession = async () => {
        if (!examId) return;
        const { data: { session } } = await supabase.auth.getSession();
        const studentId = session?.user?.id;
        if (!studentId) return;
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/exam_sessions?exam_id=eq.${examId}&student_id=eq.${studentId}&status=eq.in_progress&select=*`, {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                },
            });
            if (!res.ok) {
                console.error(`[CalibrationPage] Exam session fetch failed:`, res.status, await res.text());
                return null;
            }
            const sessionData = await res.json();
            console.log(`[CalibrationPage] Fetched exam session:`, sessionData);
            return sessionData;
        } catch (err) {
            console.error(`[CalibrationPage] Error fetching exam session:`, err);
            return null;
        }
    };

    // Initialize behavioral dynamics trackers
    const keystrokeDynamics = useKeystrokeDynamics();
    const mouseDynamics = useMouseDynamics();

    // Periodically log metrics for debugging (runs every 3 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            console.log("[Calibration Debug] Keystroke:", keystrokeDynamics.getCurrentMetrics());
            console.log("[Calibration Debug] Mouse:", mouseDynamics.getCurrentMetrics());
        }, 3000);
        return () => clearInterval(interval); // Cleanup function to stop logging on unmount
    }, [keystrokeDynamics, mouseDynamics]);

    // Initialize React Router and Toast hooks
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const examId = searchParams.get("examId"); // Get exam ID from URL if available
    const { toast } = useToast();

    // Component State
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    // Stores answers: { questionId: answerString }
    const [answers, setAnswers] = useState<Record<number, string>>({});
    // Stores the ID of the current calibration session record in the database
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [timeLeft, setTimeLeft] = useState(CALIBRATION_DURATION);
    const [loading, setLoading] = useState(true);

    // --- Effects for Initialization and Setup ---

    useEffect(() => {
        const initializeCalibration = async () => {
            // 1. Check user authentication
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                navigate("/student-login");
                return;
            }

            // 2. Safely check for existing exam session (optional logic, mostly ignored here)
            // This section checks if a main exam session is in progress, but the code proceeds regardless.
            // Use REST API fetch for exam_sessions since Supabase client is not typed for this table
            let existingSession = [];
            try {
                const studentId = session.user.id;
                const res = await fetch(`${SUPABASE_URL}/rest/v1/exam_sessions?exam_id=eq.${examId}&student_id=eq.${studentId}&status=eq.in_progress&select=*`, {
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    },
                });
                if (!res.ok) throw new Error(`Exam session fetch failed: ${res.status}`);
                existingSession = await res.json();
            } catch (err) {
                console.warn("[CalibrationPage] Ignoring exam_sessions fetch error:", err);
            }

            // 3. Create a new calibration session record in the database
            const { data: sessionData } = await supabase
                .from("calibration_sessions")
                .insert({
                    student_id: session.user.id,
                    status: "in_progress",
                })
                .select()
                .single(); // Expecting one record back

            if (sessionData) {
                setSessionId(sessionData.id); // Save the new session ID
            }

            console.log("[CalibrationPage] Calibration session started for student:", session?.user?.id);
            setLoading(false); // Stop loading screen
        };
        initializeCalibration();
    }, [navigate, examId]);

    // Timer effect (runs every second)
    useEffect(() => {
        if (timeLeft <= 0) {
            handleSubmit(); // Auto-submit when time runs out
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft((prev) => prev - 1);
        }, 1000);

        return () => clearInterval(timer); // Cleanup function for the timer
    }, [timeLeft]);

    // --- Utility Functions ---

    // Formats seconds into M:SS string
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // Handler to update the state with the student's answer
    const handleAnswerChange = (questionId: number, answer: string) => {
        setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    };

    // --- Behavioral Metrics Logic ---

    /**
     * Extracts, formats, and saves behavioral metrics (keystroke or mouse)
     * for the completed question into the database. Resets the tracker afterward.
     * @param questionIndex The index of the question that was just completed.
     */
    const saveBehavioralMetrics = async (questionIndex: number) => {
        if (!sessionId) return;
        const q = CALIBRATION_QUESTIONS[questionIndex];
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        if (q.type === "essay") {
            // --- Keystroke Dynamics Collection ---
            const raw = keystrokeDynamics.keystrokeEvents.current || [];
            const formattedRaw = raw.map(e => ({
                key: e.key,
                type: e.type,
                timestamp: e.timestamp
            }));
            // No feature extraction, just store empty vector
            const safeVector: number[] = [];

            await supabase.from("behavioral_metrics").insert({
                calibration_session_id: String(sessionId),
                student_id: userId,
                metric_type: "keystroke",
                question_type: "essay",
                question_index: questionIndex,
                metrics: {
                    keystroke_vector: safeVector,
                    key_sequence: formattedRaw
                }
            });
            keystrokeDynamics.resetMetrics();
        } else {
            // --- Mouse Dynamics Collection (for MCQ) ---
            const mouseMetrics = mouseDynamics.getCurrentMetrics();
            const formattedMouse = mouseMetrics.cursorPositions.map(p => ({
                x: p.x,
                y: p.y,
                t: p.t,
                click: !!p.click
            }));
            // No feature extraction, just store empty vector
            const safeVector: number[] = [];

            await supabase.from("behavioral_metrics").insert({
                calibration_session_id: String(sessionId),
                student_id: userId,
                metric_type: "mouse",
                question_type: "mcq",
                question_index: questionIndex,
                metrics: {
                    mouse_vector: safeVector,
                    cursor_positions: formattedMouse,
                    click_positions: formattedMouse.filter(p => p.click)
                }
            });
            mouseDynamics.resetMetrics();
        }
    };

    // --- Navigation Handlers ---

    const handleNext = async () => {
        // Save the metrics for the question just completed
        await saveBehavioralMetrics(currentQuestionIndex);
        // Move to the next question
        setCurrentQuestionIndex(i => Math.min(i + 1, CALIBRATION_QUESTIONS.length - 1));
    };

    const handlePrevious = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex((prev) => prev - 1);
        }
    };

    /**
     * Handles the final submission, saves the last metrics, updates session status,
     * and triggers the backend threshold computation.
     */
    const handleSubmit = async () => {
        if (!sessionId) return;
        // 1. Save metrics for the final question
        await saveBehavioralMetrics(currentQuestionIndex);
        // 2. Mark calibration session as completed
        await supabase
            .from("calibration_sessions")
            .update({
                status: "completed",
                completed_at: new Date().toISOString()
            })
            .eq("id", sessionId);
        // 3. Show completion toast and navigate
        toast({
            title: "Calibration complete",
            description: "Your behavioral calibration data has been saved.",
            className: "bg-success text-success-foreground"
        });
        if (examId) navigate(`/exam/${examId}`);
        else navigate("/student-dashboard");
    };

    // --- Render Logic ---

    // Show a simple loading state initially
    if (loading) {
        return <div className="flex items-center justify-center min-h-screen">Loading calibration...</div>;
    }

    const currentQuestion = CALIBRATION_QUESTIONS[currentQuestionIndex];
    // Calculate progress percentage
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
                            <span>{formatTime(timeLeft)}</span> {/* Display formatted remaining time */}
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
                            // Render RadioGroup for MCQ
                            <RadioGroup
                                value={answers[currentQuestion.id] || ""}
                                onValueChange={(value) => handleAnswerChange(currentQuestion.id, value)}
                            >
                                <div
                                    className="space-y-3"
                                    // Attach mouse dynamic listeners to the container
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
                            // Render Textarea for Essay
                            <Textarea
                                value={answers[currentQuestion.id] || ""}
                                onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                                // Attach keystroke dynamic listeners to the input field
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
                                // Show Complete button on the final question
                                <Button onClick={handleSubmit}>Complete Calibration</Button>
                            ) : (
                                // Show Next button otherwise
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