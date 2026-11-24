import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Layout from "@/components/common/layout";
import WorkspaceCrumbSelect from "@/components/common/header/workspace-crumb-select";
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useGetIntakeProjects from "@/hooks/queries/intake/use-get-intake-projects";

// Guests hold no project:read, so this header never mounts ProjectLayout or
// asks the project API: the name comes from the intake project picker.
export function GuestPortalLayout({
  workspaceId,
  projectId,
  children,
}: {
  workspaceId: string;
  projectId: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useGetIntakeProjects(workspaceId);
  const project = projects.data?.find((item) => item.id === projectId);

  useEffect(() => {
    if (projects.isSuccess && !project) {
      void navigate({
        to: "/dashboard/workspace/$workspaceId/my-requests",
        params: { workspaceId },
        replace: true,
      });
    }
  }, [navigate, project, projects.isSuccess, workspaceId]);

  return (
    <>
      <Layout.Header className="h-11 border-border/80 px-2">
        <div className="flex w-full min-w-0 items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="-ml-1 h-7 w-7 shrink-0 cursor-pointer text-foreground/85 hover:text-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="flex items-center gap-2 text-[10px]">
                  {t("navigation:settingsLayout.toggleSidebar")}
                  <ShortcutKeys id="toggleSidebar" />
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="h-4 w-px shrink-0 bg-border/80" />
          <div className="hidden min-w-0 items-center gap-1 md:flex">
            <WorkspaceCrumbSelect />
            <span className="text-foreground/30 text-xs">/</span>
            <span className="truncate text-xs">{project?.name ?? ""}</span>
          </div>
          <Link
            to="/dashboard/workspace/$workspaceId/my-requests"
            params={{ workspaceId }}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("intake:portal.nav")}
          </Link>
        </div>
      </Layout.Header>
      <Layout.Content>{children}</Layout.Content>
    </>
  );
}
