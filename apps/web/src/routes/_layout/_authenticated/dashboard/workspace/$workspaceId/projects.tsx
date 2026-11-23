import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Import, LayoutGrid, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TrialExpiredCallout } from "@/components/billing/trial-expired-callout";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { SortableProjectRow } from "@/components/project-list/sortable-project-row";
import { ProjectFieldsTable } from "@/components/project-table/project-fields-table";
import { ProjectsViewSwitch } from "@/components/project-table/projects-view-switch";
import {
  encodeProjectTableSearch,
  type ProjectTableSearchState,
  type ProjectsSearch,
} from "@/components/project-table/project-table-search";
import PageTitle from "@/components/page-title";
import CreateProjectModal from "@/components/shared/modals/create-project-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import icons from "@/constants/project-icons";
import useReorderProjects from "@/hooks/mutations/project/use-reorder-projects";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useProjectFields from "@/hooks/queries/project-field/use-project-fields";
import { useCanImport } from "@/hooks/use-can-import";
import { useShortcut } from "@/lib/shortcuts/use-shortcut";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateMedium } from "@/lib/format";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/projects",
)({
  validateSearch: (search: Record<string, unknown>): ProjectsSearch => ({
    view: search.view === "fields" ? "fields" : undefined,
    filters: typeof search.filters === "string" ? search.filters : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
    page:
      typeof search.page === "number" &&
      Number.isInteger(search.page) &&
      search.page >= 0
        ? search.page
        : undefined,
    includeArchived:
      search.includeArchived === true || search.includeArchived === "true"
        ? true
        : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const view = search.view ?? "overview";
  const navigate = useNavigate();
  const { data: projects, isLoading } = useGetProjects({
    workspaceId,
    enabled: view === "overview",
  });
  const { data: projectFields } = useProjectFields(workspaceId);
  const reorderProjects = useReorderProjects();

  // React state, not the query cache: dnd-kit clears its transforms with a
  // setState in the same handler, while a cache write notifies a task later,
  // leaving a frame with the transforms gone and the rows not yet moved.
  const [droppedOrder, setDroppedOrder] = useState<string[] | null>(null);

  const orderedProjects = useMemo(() => {
    if (!projects || !droppedOrder) return projects;

    const rank = new Map(droppedOrder.map((id, index) => [id, index]));

    return [...projects].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [projects, droppedOrder]);

  // Released once the server agrees, or a reorder made elsewhere stays pinned.
  useEffect(() => {
    if (!droppedOrder || !projects) return;
    if (projects.map((project) => project.id).join() === droppedOrder.join()) {
      setDroppedOrder(null);
    }
  }, [projects, droppedOrder]);

  const { canCreateProjects, canUpdateProjects } = useWorkspacePermission();
  const canCreate = canCreateProjects();
  const { canImport } = useCanImport();

  const switchView = (next: "overview" | "fields") => {
    void navigate({
      to: ".",
      search: (previous: ProjectsSearch) => ({
        ...previous,
        view: next === "fields" ? "fields" : undefined,
      }),
      replace: true,
    });
  };

  const changeTableSearch = (next: ProjectTableSearchState) => {
    void navigate({
      to: ".",
      search: { ...encodeProjectTableSearch(next), view: "fields" },
      replace: true,
    });
  };

  // Matches the API, which gates /project/reorder on `project: ["update"]`
  // alone — not the create+update+delete bundle.
  const canReorder = canUpdateProjects();

  // Below these thresholds the row is still a link and the page still scrolls;
  // above them the gesture becomes a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const handleDragStart = () => {
    document.body.classList.add("kaneo-dragging");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    document.body.classList.remove("kaneo-dragging");

    if (!over || active.id === over.id || !orderedProjects) return;

    const oldIndex = orderedProjects.findIndex(
      (project) => project.id === active.id,
    );
    const newIndex = orderedProjects.findIndex(
      (project) => project.id === over.id,
    );

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orderedProjects, oldIndex, newIndex);

    setDroppedOrder(reordered.map((project) => project.id));

    reorderProjects(workspaceId, reordered, {
      onError: () => {
        setDroppedOrder(null);
        toast.error(t("workspace:projects.reorderError"));
      },
    });
  };

  const handleCreateProject = () => {
    if (!canCreate) return;
    setIsCreateProjectOpen(true);
  };

  useShortcut("createProject", handleCreateProject, { scope: "view" });

  const handleProjectClick = (projectId: string) => {
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
      params: { workspaceId, projectId },
    });
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <ProjectsViewSwitch
        view={view}
        fieldCount={projectFields?.length ?? 0}
        onChange={switchView}
      />
      {canCreate ? (
        <Button
          variant="outline"
          size="xs"
          onClick={handleCreateProject}
          className="gap-1"
        >
          <Plus className="w-3 h-3" />
          {t("workspace:projects.createProject")}
        </Button>
      ) : null}
    </div>
  );

  if (view === "overview" && isLoading) {
    return (
      <>
        <PageTitle title={t("workspace:projects.pageTitle")} />
        <WorkspaceLayout
          title={t("workspace:projects.pageTitle")}
          headerActions={headerActions}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-foreground font-medium">
                  {t("workspace:projects.title")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("workspace:projects.progress")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("workspace:projects.targetDate")}
                </TableHead>
                <TableHead className="text-foreground font-medium">
                  {t("workspace:projects.status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="delayed-reveal">
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-2 w-20" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="py-3">
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </WorkspaceLayout>
      </>
    );
  }

  if (view === "overview" && (!projects || projects.length === 0)) {
    return (
      <>
        <PageTitle title={t("workspace:projects.pageTitle")} />
        <WorkspaceLayout
          title={t("workspace:projects.pageTitle")}
          headerActions={headerActions}
        >
          <TrialExpiredCallout workspaceId={workspaceId} className="m-4" />
          <Empty className="min-h-[60vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGrid />
              </EmptyMedia>
              <EmptyTitle>{t("workspace:projects.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {canCreate
                  ? t("workspace:projects.emptyDescription")
                  : t("workspace:projects.emptyDescriptionReadOnly")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap justify-center">
              {canCreate && (
                <Button onClick={handleCreateProject}>
                  <Plus />
                  {t("workspace:projects.createProject")}
                </Button>
              )}
              {canImport && (
                <Button
                  variant="outline"
                  render={<Link to="/dashboard/settings/workspace/import" />}
                >
                  <Import />
                  {t("settings:workspaceImport.entry.projectsEmpty")}
                </Button>
              )}
            </EmptyContent>
          </Empty>
        </WorkspaceLayout>

        <CreateProjectModal
          open={isCreateProjectOpen}
          onClose={() => setIsCreateProjectOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <PageTitle title={t("workspace:projects.pageTitle")} />
      <WorkspaceLayout
        title={t("workspace:projects.pageTitle")}
        headerActions={headerActions}
      >
        <TrialExpiredCallout workspaceId={workspaceId} className="m-4" />
        {view === "fields" ? (
          <ProjectFieldsTable
            workspaceId={workspaceId}
            search={search}
            onSearchChange={changeTableSearch}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() =>
              document.body.classList.remove("kaneo-dragging")
            }
          >
            <Table>
              <TableHeader className="p-4">
                <TableRow>
                  <TableHead className="text-foreground font-medium">
                    {t("workspace:projects.title")}
                  </TableHead>
                  <TableHead className="text-foreground font-medium">
                    {t("workspace:projects.progress")}
                  </TableHead>
                  <TableHead className="text-foreground font-medium">
                    {t("workspace:projects.dueDate")}
                  </TableHead>
                  <TableHead className="text-foreground font-medium">
                    {t("workspace:projects.status")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={orderedProjects?.map((project) => project.id) ?? []}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedProjects?.map((project) => {
                    if (!project?.id || !project.statistics) return null;

                    const IconComponent =
                      icons[project.icon as keyof typeof icons] || icons.Layout;

                    const getStatusText = () => {
                      if (project.statistics.totalTasks === 0)
                        return t("workspace:projects.projectStatus.notStarted");
                      if (project.statistics.completionPercentage === 100)
                        return t("workspace:projects.projectStatus.complete");
                      return t("workspace:projects.projectStatus.inProgress");
                    };

                    const getStatusVariant = () => {
                      if (project.statistics.totalTasks === 0)
                        return "secondary";
                      if (project.statistics.completionPercentage === 100)
                        return "default";
                      return "outline";
                    };

                    return (
                      <SortableProjectRow
                        key={project.id}
                        id={project.id}
                        canReorder={canReorder}
                        onClick={() => handleProjectClick(project.id)}
                      >
                        <TableCell className="py-3">
                          <div className="flex items-center gap-3">
                            <IconComponent className="w-5 h-5 text-muted-foreground" />
                            <span className="font-medium">{project.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={project.statistics.completionPercentage}
                              className="w-16 h-2"
                            />
                            <span className="text-sm text-muted-foreground">
                              {project.statistics.completionPercentage}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="text-sm text-muted-foreground">
                            {project.statistics.dueDate
                              ? formatDateMedium(project.statistics.dueDate)
                              : t("workspace:projects.noDueDate")}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant={getStatusVariant()}>
                            {getStatusText()}
                          </Badge>
                        </TableCell>
                      </SortableProjectRow>
                    );
                  })}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        )}
      </WorkspaceLayout>

      <CreateProjectModal
        open={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
      />
    </>
  );
}
