import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { MailFailureRow } from './mail-failure-row';

const meta = {
  title: 'App CMS/Dashboard/MailFailureRow'
} satisfies Meta;

export default meta;

/** The sheet's list, at the width a `size="lg"` SheetContent gives it */
export const List: StoryObj = {
  render: () => (
    <div className="flex w-full max-w-2xl flex-col">
      <MailFailureRow
        formTitle="Contact"
        owner="Titan Tours"
        reason="failed"
        reasonLabel="Not delivered"
        receivedLabel="2 hours ago"
        receivedAt="2026-08-20T07:12:00.000Z"
        href="#"
      />
      <MailFailureRow
        formTitle="Booking request"
        owner="Codeware Demo"
        reason="no-recipient"
        reasonLabel="No recipient"
        receivedLabel="yesterday"
        receivedAt="2026-08-19T09:30:00.000Z"
        href="#"
      />
      <MailFailureRow
        formTitle="Newsletter signup"
        owner="Moon Retreats"
        reason="failed"
        reasonLabel="Not delivered"
        receivedLabel="3 days ago"
        receivedAt="2026-08-17T11:00:00.000Z"
        href="#"
      />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(List, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(List, 'payload-admin', 'dark');
export const FrostLight = a11yStory(List, 'frost', 'light');
export const FrostDark = a11yStory(List, 'frost', 'dark');
