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
      // For now, show a message that PDF parsing will be implemented
      toast({
        title: "PDF Upload",
        description: "PDF parsing feature coming soon. Please enter questions manually for now.",
        className: "bg-success text-success-foreground",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process PDF",
        className: "bg-error text-error-foreground",
      });
    }
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
              Upload a PDF with questions to auto-populate (Coming soon - manual entry required for now)
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
