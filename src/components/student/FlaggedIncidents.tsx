import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

interface Incident {
  id: string;
  timestamp: string;
  incident_type: string;
  severity: string;
  description: string;
  session_id: string;
}

export const FlaggedIncidents = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIncidents = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get student's exam sessions
      const { data: sessions } = await supabase
        .from("exam_sessions")
        .select("id")
        .eq("student_id", session.user.id);

      if (!sessions) return;

      const sessionIds = sessions.map(s => s.id);

      // Get incidents for those sessions
      const { data: incidentsData } = await supabase
        .from("cheating_incidents")
        .select("*")
        .in("session_id", sessionIds)
        .order("timestamp", { ascending: false });

      if (incidentsData) {
        setIncidents(incidentsData);
      }
      setLoading(false);
    };

    fetchIncidents();
  }, []);

  if (loading) {
    return <div className="text-muted-foreground">Loading incidents...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Flagged Incidents
        </CardTitle>
      </CardHeader>
      <CardContent>
        {incidents.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No incidents recorded</p>
        ) : (
          <div className="space-y-3">
            {incidents.map((incident) => (
              <div key={incident.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium">{incident.incident_type}</span>
                  <Badge variant={incident.severity === "high" ? "destructive" : "secondary"}>
                    {incident.severity}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{incident.description}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(incident.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
