import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Shield } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-0 md:p-8">
      <div className="text-center max-w-3xl w-full space-y-12">
        <div className="space-y-6">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-primary drop-shadow-lg mb-2">ProctorWatch</h1>
          <p className="text-2xl text-gray-700 font-medium mb-2">Secure Online Examination Platform</p>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">ML-powered proctoring system that ensures exam integrity while minimizing false positives</p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 mt-12">
          <Card className="border border-gray-200 rounded-xl shadow-xl bg-white">
            <CardHeader className="pb-0">
              <GraduationCap className="h-14 w-14 mx-auto mb-6 text-[hsl(32,94%,45%)] drop-shadow" />
              <CardTitle className="text-2xl font-bold tracking-wide mb-1">Student Portal</CardTitle>
              <CardDescription className="text-base text-gray-500">Take exams with confidence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-0">
              <Link to="/student-login">
                <Button className="w-full mb-4 rounded-xl py-3 text-lg font-semibold shadow-md bg-[hsl(32,94%,45%)] text-white hover:bg-primary/90 transition">Login</Button>
              </Link>
              <Link to="/student-signup">
                <Button variant="outline" className="w-full rounded-xl py-3 text-lg font-semibold border-gray-300 shadow-sm hover:bg-gray-50 transition">
                  Sign Up
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 rounded-xl shadow-xl bg-white">
            <CardHeader className="pb-0">
              <Shield className="h-14 w-14 mx-auto mb-6 text-[hsl(32,94%,45%)] drop-shadow" />
              <CardTitle className="text-2xl font-bold tracking-wide mb-1">Instructor Portal</CardTitle>
              <CardDescription className="text-base text-gray-500">Manage exams and monitor sessions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-0">
              <Link to="/admin-login">
                <Button className="w-full mb-4 rounded-xl py-3 text-lg font-semibold shadow-md bg-[hsl(32,94%,45%)] text-white hover:bg-primary/90 transition">Login</Button>
              </Link>
              <Link to="/admin-signup">
                <Button variant="outline" className="w-full rounded-xl py-3 text-lg font-semibold border-gray-300 shadow-sm hover:bg-gray-50 transition">
                  Sign Up
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
