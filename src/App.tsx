
import { useState } from "react";
import { Sun } from "lucide-react";

const queryClient = new QueryClient();
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import StudentSignup from "./pages/StudentSignup";
import StudentLogin from "./pages/StudentLogin";
import StudentDashboard from "./pages/StudentDashboard";
import AdminSignup from "./pages/AdminSignup";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import ExamPage from "./pages/ExamPage";
import ExamComplete from "./pages/ExamComplete";
import CalibrationPage from "./pages/CalibrationPage";

function App() {
  const [darkMode, setDarkMode] = useState(false);

  // Toggle dark mode by adding/removing the 'dark' class on the html element
  const handleToggle = () => {
    setDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <div className="min-h-screen flex flex-col bg-background text-foreground font-sans relative">
          <main className="flex-1">
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/student-signup" element={<StudentSignup />} />
                <Route path="/student-login" element={<StudentLogin />} />
                <Route path="/student-dashboard" element={<StudentDashboard />} />
                <Route path="/admin-signup" element={<AdminSignup />} />
                <Route path="/admin-login" element={<AdminLogin />} />
                <Route path="/admin-dashboard" element={<AdminDashboard />} />
                <Route path="/exam/:examId" element={<ExamPage />} />
                <Route path="/exam-complete" element={<ExamComplete />} />
                <Route path="/calibration" element={<CalibrationPage />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </main>
          {/* Floating dark mode toggle button */}
          <button
            onClick={handleToggle}
            className="fixed bottom-6 right-6 z-50 bg-primary text-white rounded-full p-3 shadow-lg hover:bg-primary/90 transition"
            aria-label="Toggle dark mode"
          >
            <Sun className={darkMode ? "opacity-60" : "opacity-100"} />
          </button>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
