"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export type WorkspaceSummary = { id: string; slug: string; name: string };

export function WorkspaceSwitcher({
  workspaces,
  current,
  role,
}: {
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary;
  role: string;
}) {
  const router = useRouter();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-popup-open:bg-sidebar-accent"
                aria-label="Switch workspace"
              />
            }
          >
            <div
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
            >
              {initial(current.name)}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{current.name}</span>
              <span className="truncate text-xs text-muted-foreground capitalize">{role}</span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" align="start" side="bottom" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Workspaces
              </DropdownMenuLabel>
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => router.push(`/w/${w.slug}`)}>
                  <div
                    aria-hidden="true"
                    className="flex size-6 items-center justify-center rounded-md border text-xs font-medium"
                  >
                    {initial(w.name)}
                  </div>
                  <span className="truncate">{w.name}</span>
                  {w.id === current.id && <Check className="ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/workspaces/new")}>
              <Plus />
              Create workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "W";
}
