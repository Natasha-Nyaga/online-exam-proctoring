-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('student', 'admin');

-- Create profiles table for additional user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create students table for student-specific data
CREATE TABLE public.students (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id TEXT UNIQUE NOT NULL,
  course_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create admins table for admin-specific data
CREATE TABLE public.admins (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create exams table
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  created_by UUID REFERENCES public.profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'essay')),
  options JSONB, -- for MCQ options
  correct_answer TEXT, -- for MCQ
  points INTEGER DEFAULT 1,
  order_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create exam_sessions table
CREATE TABLE public.exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  total_score INTEGER
);

-- Create answers table
CREATE TABLE public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE NOT NULL,
  answer_text TEXT,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cheating_incidents table
CREATE TABLE public.cheating_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE NOT NULL,
  incident_type TEXT NOT NULL,
  description TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheating_incidents ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for students
CREATE POLICY "Students can view their own data"
  ON public.students FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all students"
  ON public.students FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for admins
CREATE POLICY "Admins can view their own data"
  ON public.admins FOR SELECT
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for exams
CREATE POLICY "Students can view all exams"
  ON public.exams FOR SELECT
  USING (public.has_role(auth.uid(), 'student'));

CREATE POLICY "Admins can view all exams"
  ON public.exams FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can create exams"
  ON public.exams FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update their exams"
  ON public.exams FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') AND auth.uid() = created_by);

-- RLS Policies for questions
CREATE POLICY "Students can view questions for their exams"
  ON public.questions FOR SELECT
  USING (public.has_role(auth.uid(), 'student'));

CREATE POLICY "Admins can manage questions"
  ON public.questions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for exam_sessions
CREATE POLICY "Students can view their own sessions"
  ON public.exam_sessions FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can create their own sessions"
  ON public.exam_sessions FOR INSERT
  WITH CHECK (auth.uid() = student_id AND public.has_role(auth.uid(), 'student'));

CREATE POLICY "Students can update their own sessions"
  ON public.exam_sessions FOR UPDATE
  USING (auth.uid() = student_id);

CREATE POLICY "Admins can view all sessions"
  ON public.exam_sessions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for answers
CREATE POLICY "Students can manage their own answers"
  ON public.answers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions
      WHERE exam_sessions.id = answers.session_id
      AND exam_sessions.student_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all answers"
  ON public.answers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for cheating_incidents
CREATE POLICY "Students can view their own incidents"
  ON public.cheating_incidents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions
      WHERE exam_sessions.id = cheating_incidents.session_id
      AND exam_sessions.student_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all incidents"
  ON public.cheating_incidents FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can create incidents"
  ON public.cheating_incidents FOR INSERT
  WITH CHECK (true);

-- Create trigger function for profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name, email)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'role')::app_role,
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::app_role);
  
  -- Create student or admin record based on role
  IF (NEW.raw_user_meta_data->>'role') = 'student' THEN
    INSERT INTO public.students (id, student_id, course_name)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'student_id',
      NEW.raw_user_meta_data->>'course_name'
    );
  ELSIF (NEW.raw_user_meta_data->>'role') = 'admin' THEN
    INSERT INTO public.admins (id, admin_id)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'admin_id'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create trigger for exams updated_at
CREATE TRIGGER update_exams_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();