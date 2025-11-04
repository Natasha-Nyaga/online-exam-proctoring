import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Upload } from "lucide-react";

interface Question {
  question_text: string;
  question_type: "mcq" | "essay";
  options: string[];
  correct_answer?: string;
  points: number;
}

const CreateExamForm = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [examDescription, setExamDescription] = useState("");
  const [duration, setDuration] = useState(60);
  const [questions, setQuestions] = useState<Question[]>([
    { question_text: "", question_type: "mcq", options: ["", "", "", ""], correct_answer: "", points: 1 },
  ]);

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      toast({
        title: "Invalid file",
        description: "Please upload a PDF file",
        className: "bg-error text-error-foreground",
      });
      return;
    }

    try {
      toast({ title: "Processing PDF", description: "Starting PDF upload..." });
      console.log("[PDF Debug] Starting upload");

      let pdfjsLib;
      try {
        pdfjsLib = await import("pdfjs-dist");
        console.log("[PDF Debug] pdfjs-dist imported", pdfjsLib);
        toast({ title: "PDF.js imported", description: "Worker setup..." });
      } catch (err) {
        console.error("[PDF Debug] Failed to import pdfjs-dist", err);
        toast({
          title: "PDF.js import error",
          description: err?.message || String(err),
          className: "bg-error text-error-foreground",
        });
        return;
      }

      try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";
        console.log("[PDF Debug] Worker src set");
  toast({ title: "Worker src set", description: "/pdf.worker.js" });
      } catch (err) {
        console.error("[PDF Debug] Failed to set workerSrc", err);
        toast({
          title: "Worker src error",
          description: err?.message || String(err),
          className: "bg-error text-error-foreground",
        });
        return;
      }

      let arrayBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
        console.log("[PDF Debug] ArrayBuffer loaded", arrayBuffer.byteLength);
        toast({ title: "PDF loaded", description: "Parsing PDF..." });
      } catch (err) {
        console.error("[PDF Debug] Failed to load ArrayBuffer", err);
        toast({
          title: "ArrayBuffer error",
          description: err?.message || String(err),
          className: "bg-error text-error-foreground",
        });
        return;
      }

      let pdf;
      try {
        // Add a timeout to catch silent worker failures
        const pdfPromise = pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("PDF.js worker did not respond (timeout). Check workerSrc and network).")), 10000)
        );
        pdf = await Promise.race([pdfPromise, timeoutPromise]);
        console.log("[PDF Debug] PDF loaded", pdf);
        toast({ title: "PDF loaded", description: `Pages: ${pdf.numPages}` });
      } catch (err) {
        console.error("[PDF Debug] PDF.js getDocument error or timeout", err);
        toast({
          title: "PDF.js getDocument error or timeout",
          description: err?.message || String(err),
          className: "bg-error text-error-foreground",
        });
        return;
      }

      let extractedText = "";
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          console.log(`[PDF Debug] Page ${i} loaded`, page);
          toast({ title: `Page ${i} loaded`, description: `Extracting text...` });
          const textContent = await page.getTextContent();
          console.log(`[PDF Debug] Page ${i} textContent`, textContent);
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          extractedText += pageText + "\n";
        }
        console.log("[PDF Extracted Text]", extractedText);
        toast({
          title: "PDF Extracted Text (debug)",
          description: extractedText.slice(0, 400) + (extractedText.length > 400 ? "..." : ""),
          className: "bg-muted text-muted-foreground",
        });
      } catch (err) {
        console.error("[PDF Debug] Error extracting text from PDF", err);
        toast({
          title: "Text extraction error",
          description: err?.message || String(err),
          className: "bg-error text-error-foreground",
        });
        return;
      }

      let parsedQuestions = [];
      try {
        parsedQuestions = parseQuestionsFromText(extractedText);
        console.log("[PDF Debug] Parsed questions", parsedQuestions);
      } catch (err) {
        console.error("[PDF Debug] Error parsing questions from text", err);
        toast({
          title: "Question parsing error",
          description: err?.message || String(err),
          className: "bg-error text-error-foreground",
        });
        return;
      }

      if (parsedQuestions.length > 0) {
        setQuestions(parsedQuestions);
        toast({
          title: "Success!",
          description: `Extracted ${parsedQuestions.length} questions from PDF`,
          className: "bg-success text-success-foreground",
        });
      } else {
        toast({
          title: "No questions found",
          description: "Could not extract questions. Please add manually.",
          className: "bg-error text-error-foreground",
        });
      }
    } catch (error) {
      console.error("[PDF Debug] PDF parsing error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to process PDF. Please add questions manually.",
        className: "bg-error text-error-foreground",
      });
    }
  };

  const parseQuestionsFromText = (text: string): Question[] => {
    const questions: Question[] = [];
    const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
    let currentQuestion: Partial<Question> | null = null;
    let inOptions = false;
    let isEssaySection = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^Essay Questions$/i.test(line)) {
        isEssaySection = true;
        continue;
      }
      // Detect question (starts with number followed by period or parenthesis)
      if (/^\d+[\.)]?\s/.test(line)) {
        if (currentQuestion && currentQuestion.question_text) {
          // If no options, treat as essay
          if (!currentQuestion.options || currentQuestion.options.length < 2) {
            currentQuestion.question_type = "essay";
            currentQuestion.options = ["", "", "", ""];
          }
          questions.push(currentQuestion as Question);
        }
        currentQuestion = {
          question_text: line.replace(/^\d+[\.)]?\s/, ""),
          question_type: isEssaySection ? "essay" : "mcq",
          options: [],
          correct_answer: "",
          points: 1,
        };
        inOptions = false;
      }
      // MCQ options: A. Option, B. Option, etc.
      else if (currentQuestion && !isEssaySection && /^[A-E][.]\s/.test(line)) {
        const option = line.replace(/^[A-E][.]\s/, "").trim();
        currentQuestion.options = currentQuestion.options || [];
        currentQuestion.options.push(option);
        inOptions = true;
      }
      // Detect correct answer for MCQ: 'Answer: B. Stack'
      else if (currentQuestion && /^Answer:\s*/i.test(line)) {
        const answerText = line.replace(/^Answer:\s*/i, "").trim();
        // Try to extract the letter and match to option
        const match = answerText.match(/^([A-E])[.]\s*(.*)/);
        if (match && currentQuestion.options && currentQuestion.options.length) {
          const idx = match[1].charCodeAt(0) - 65;
          currentQuestion.correct_answer = currentQuestion.options[idx] || "";
        } else {
          currentQuestion.correct_answer = answerText;
        }
      }
      // Essay answer: 'Answer: ...' (full text)
      else if (currentQuestion && isEssaySection && /^Answer:/i.test(line)) {
        currentQuestion.correct_answer = line.replace(/^Answer:/i, "").trim();
      }
      // Continue current question text (if not in options)
      else if (currentQuestion && !inOptions && line && !/^Explanation:/i.test(line)) {
        currentQuestion.question_text += " " + line;
      }
      // Optionally, skip explanations
    }
    // Add last question
    if (currentQuestion && currentQuestion.question_text) {
      if (!currentQuestion.options || currentQuestion.options.length < 2) {
        currentQuestion.question_type = "essay";
        currentQuestion.options = ["", "", "", ""];
      }
      questions.push(currentQuestion as Question);
    }
    // Ensure all MCQs have at least 4 options
    return questions.map(q => ({
      ...q,
      options: q.options && q.options.length >= 2
        ? [...q.options, ...Array(Math.max(0, 4 - q.options.length)).fill("")]
        : ["", "", "", ""],
      correct_answer: q.correct_answer || "",
    }));
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      { question_text: "", question_type: "mcq", options: ["", "", "", ""], correct_answer: "", points: 1 },
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof Question, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const updateOption = (questionIndex: number, optionIndex: number, value: string) => {
    const updated = [...questions];
    updated[questionIndex].options[optionIndex] = value;
    setQuestions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Create exam
      const { data: examData, error: examError } = await supabase
        .from("exams")
        .insert({
          title: examTitle,
          description: examDescription,
          duration_minutes: duration,
          created_by: session.user.id,
        })
        .select()
        .single();

      if (examError) throw examError;

      // Create questions
      const questionsToInsert = questions.map((q, index) => ({
        exam_id: examData.id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.question_type === "mcq" ? q.options : null,
        correct_answer: q.question_type === "mcq" ? q.correct_answer : null,
        points: q.points,
        order_number: index + 1,
      }));

      const { error: questionsError } = await supabase
        .from("questions")
        .insert(questionsToInsert);

      if (questionsError) throw questionsError;

      toast({
        title: "Success!",
        description: "Exam created successfully.",
        className: "bg-success text-success-foreground",
      });

      // Reset form
      setExamTitle("");
      setExamDescription("");
      setDuration(60);
      setQuestions([
        { question_text: "", question_type: "mcq", options: ["", "", "", ""], correct_answer: "", points: 1 },
      ]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create exam",
        className: "bg-error text-error-foreground",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Create New Examination</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Upload a new exam with multiple-choice or essay questions
          </p>
        </CardHeader>
        <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="pdf-upload">Quick Upload (Optional)</Label>
            <div className="flex items-center gap-4">
              <Input
                id="pdf-upload"
                type="file"
                accept=".pdf"
                onChange={handlePDFUpload}
                className="cursor-pointer"
              />
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a PDF with questions to automatically populate the form. Supports standard exam formats.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Exam Title</Label>
            <Input
              id="title"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={examDescription}
              onChange={(e) => setExamDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              required
              min="1"
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label>Questions</Label>
              <Button type="button" onClick={addQuestion} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Question
              </Button>
            </div>

            {questions.map((question, qIndex) => (
              <Card key={qIndex}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <Label>Question {qIndex + 1}</Label>
                    {questions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeQuestion(qIndex)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <Textarea
                    placeholder="Enter question text"
                    value={question.question_text}
                    onChange={(e) => updateQuestion(qIndex, "question_text", e.target.value)}
                    required
                  />

                  <Select
                    value={question.question_type}
                    onValueChange={(value) => updateQuestion(qIndex, "question_type", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mcq">Multiple Choice</SelectItem>
                      <SelectItem value="essay">Essay</SelectItem>
                    </SelectContent>
                  </Select>

                  {question.question_type === "mcq" && (
                    <div className="space-y-2">
                      <Label>Options</Label>
                      {question.options.map((option, oIndex) => (
                        <Input
                          key={oIndex}
                          placeholder={`Option ${oIndex + 1}`}
                          value={option}
                          onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                          required
                        />
                      ))}
                      <Select
                        value={question.correct_answer}
                        onValueChange={(value) => updateQuestion(qIndex, "correct_answer", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select correct answer" />
                        </SelectTrigger>
                        <SelectContent>
                          {question.options
                            .filter((option) => option !== "")
                            .map((option, oIndex) => (
                              <SelectItem key={oIndex} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Points</Label>
                    <Input
                      type="number"
                      value={question.points}
                      onChange={(e) => updateQuestion(qIndex, "points", parseInt(e.target.value))}
                      required
                      min="1"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating Exam..." : "Create Exam"}
          </Button>
        </form>
      </CardContent>
      </Card>
    </div>
  );
};

export default CreateExamForm;
