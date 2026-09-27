import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarIcon, HomeIcon, InboxIcon, SettingsIcon } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from './sidebar';

const meta = {
  title: 'Shadcn/Sidebar'
} satisfies Meta;

export default meta;

const items = [
  { title: 'Home', icon: HomeIcon, active: true },
  { title: 'Inbox', icon: InboxIcon, active: false, badge: '12' },
  { title: 'Calendar', icon: CalendarIcon, active: false },
  { title: 'Settings', icon: SettingsIcon, active: false }
];

/**
 * `collapsible="none"` renders the sidebar statically so it fits inside
 * the story canvas (the default variant is position fixed).
 */
export const Demo: StoryObj = {
  render: () => (
    <SidebarProvider className="min-h-0">
      <div className="border-border h-96 overflow-hidden rounded-lg border">
        <Sidebar collapsible="none" className="h-full">
          <SidebarHeader className="px-4 text-sm font-semibold">
            Acme Inc
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Application</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton isActive={item.active}>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      {item.badge && (
                        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="text-muted-foreground px-4 text-xs">
            Footer
          </SidebarFooter>
        </Sidebar>
      </div>
    </SidebarProvider>
  )
};

export const FrostLight = a11yStory(Demo, 'frost', 'light');
export const FrostDark = a11yStory(Demo, 'frost', 'dark');
export const PayloadAdminLight = a11yStory(Demo, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Demo, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory(Demo, 'spotlight', 'light');
export const SpotlightDark = a11yStory(Demo, 'spotlight', 'dark');
export const CodewareLight = a11yStory(Demo, 'codeware', 'light');
export const CodewareDark = a11yStory(Demo, 'codeware', 'dark');
