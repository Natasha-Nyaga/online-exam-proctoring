import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Shield } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="text-center max-w-4xl space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold">ProctorWatch</h1>
          <p className="text-xl text-muted-foreground">
            Secure Online Examination Platform
          </p>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            AI-powered proctoring system that ensures exam integrity while minimizing false positives
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <GraduationCap className="h-12 w-12 mx-auto mb-4 text-primary" />
              <CardTitle>Student Portal</CardTitle>
              <CardDescription>Take exams with confidence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/student-login">
                <Button className="w-full">Login</Button>
              </Link>
              <Link to="/student-signup">
                <Button variant="outline" className="w-full">
                  Sign Up
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
              <CardTitle>Instructor Portal</CardTitle>
              <CardDescription>Manage exams and monitor sessions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/admin-login">
                <Button className="w-full">Login</Button>
              </Link>
              <Link to="/admin-signup">
                <Button variant="outline" className="w-full">
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
