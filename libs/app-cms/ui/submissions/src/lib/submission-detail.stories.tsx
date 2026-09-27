import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { SubmissionDetail } from './submission-detail';

const meta = {
  title: 'App CMS/Submissions/SubmissionDetail'
} satisfies Meta;

export default meta;

const orphanedLabel = 'This field is no longer part of the form';

export const Values: StoryObj = {
  render: () => (
    <div className="bg-card border-border w-[34rem] rounded-xl border p-4">
      <SubmissionDetail
        emptyLabel="This message has no values."
        orphanedLabel={orphanedLabel}
        fields={[
          {
            name: 'name',
            label: 'Your name',
            value: 'Anna Berg',
            orphaned: false
          },
          {
            name: 'email',
            label: 'Email',
            value: 'anna@example.se',
            orphaned: false
          },
          {
            name: 'travellers',
            label: 'Number of travellers',
            value: '4',
            orphaned: false
          },
          {
            name: 'message',
            label: 'Message',
            value:
              'We would like to join the sunset tasting.\n\nIs there room for a group of four on the 14th?',
            orphaned: false
          },
          {
            name: 'newsletter',
            label: 'Newsletter',
            value: '',
            orphaned: false
          },
          {
            name: 'phone',
            label: 'phone',
            value: '070-123 45 67',
            orphaned: true
          }
        ]}
      />
    </div>
  )
};

export const Empty: StoryObj = {
  render: () => (
    <div className="bg-card border-border w-[34rem] rounded-xl border p-4">
      <SubmissionDetail
        fields={[]}
        emptyLabel="This message has no values."
        orphanedLabel={orphanedLabel}
      />
    </div>
  )
};

export const NotificationFailed: StoryObj = {
  render: () => (
    <div className="bg-card border-border w-[34rem] rounded-xl border p-4">
      <SubmissionDetail
        emptyLabel="This message has no values."
        orphanedLabel={orphanedLabel}
        notificationIssue="failed"
        notificationIssueMessage="The notification email for this message could not be delivered."
        fields={[
          {
            name: 'name',
            label: 'Your name',
            value: 'Erik Holm',
            orphaned: false
          },
          {
            name: 'email',
            label: 'Email',
            value: 'erik@example.se',
            orphaned: false
          }
        ]}
      />
    </div>
  )
};

export const NotificationNoRecipient: StoryObj = {
  render: () => (
    <div className="bg-card border-border w-[34rem] rounded-xl border p-4">
      <SubmissionDetail
        emptyLabel="This message has no values."
        orphanedLabel={orphanedLabel}
        notificationIssue="no-recipient"
        notificationIssueMessage="This message's notification email had no recipient to send to — check the form's or workspace's notification settings."
        fields={[
          {
            name: 'email',
            label: 'Email',
            value: 'lena@example.se',
            orphaned: false
          }
        ]}
      />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(Values, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Values, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Values, 'frost', 'light');
export const FrostDark = a11yStory(Values, 'frost', 'dark');
