import { FileText, User, AlertCircle, CheckCircle } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface StudentSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function StudentSidebar({ activeTab, onTabChange }: StudentSidebarProps) {
  const items = [
    { title: "Available Exams", value: "exams", icon: FileText },
    { title: "Profile", value: "profile", icon: User },
    { title: "Flagged Incidents", value: "incidents", icon: AlertCircle },
    { title: "Completed Sessions", value: "sessions", icon: CheckCircle },
  ];

  return (
    <Sidebar className="border-r border-border">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Student Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    onClick={() => onTabChange(item.value)}
                    isActive={activeTab === item.value}
                    className="w-full justify-start"
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
