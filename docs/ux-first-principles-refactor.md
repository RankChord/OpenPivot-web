# OpenPivot UX First Principles Refactor

## Current Audit

The current frontend keeps the visual tone that we want, but the UX model is still fragmented.

- `/messages?chat=...` treats the current conversation as query state instead of a domain route.
- `HomeCanvas` repeats the sidebar recent list, so the first screen is another directory rather than a task-oriented entry.
- Demo sidebar data is static inside `App.tsx`, so it can bleed into Connected Mode shell behavior.
- Demo sending clears the composer without adding the message to the timeline.
- Message presentation is controlled by sender kind (`human` / `agent`) instead of content blocks.
- Workflow nodes still encode identity categories (`human` / `agent`) and the workflow editor is global rather than space-bound.
- Participants are a static directory; search, relationship state, requests, and one-to-one space creation are not a complete journey.
- Contact requests are hidden behind a separate page, use "friend" language, and cannot be accepted or rejected from the main attention flow.
- Many controls are visible affordances without a real result: global search, notifications, attachments, mentions, code, flow actions, save, test node, and zoom.
- Connected Mode defaults to the first conversation in local React state instead of URL-addressable space selection.
- Refresh-token session bootstrap is missing, so a reload cannot naturally restore Connected Mode.

## Product Model To Enforce

OpenPivot should be organized around the user's attention and collaboration context:

```text
Participant joins Space
Flow belongs to Space
Flow requests Participant
Message/Event happens inside Space
Inbox points to the exact Space context
Connection belongs to Participant
```

The practical model:

- **Inbox** is the first daily entry. It shows what needs attention and links to exact context.
- **Collaboration Space** is the only place where conversations happen. One-to-one and multi-participant conversations are both spaces.
- **Participant** is an identity that can act, reply, approve, and be requested. `kind` is metadata only.
- **Collaboration Flow** belongs to a space. A global flow page is only an overview; editing happens under `/spaces/:spaceId/flows/:flowId`.
- **Connection** is not daily navigation. It appears in participant details or settings when supported.

## Target Information Architecture

Primary routes:

```text
/inbox
/spaces
/spaces/:spaceId
/spaces/:spaceId/participants
/spaces/:spaceId/flows
/spaces/:spaceId/flows/:flowId
/participants
/participants/:participantId
/settings
/login
/register
```

Compatibility redirects may exist, but `/messages?chat=...` must no longer be the primary model.

Desktop navigation:

```text
OpenPivot
Search / Command
New

Inbox
Collaboration Spaces

Pinned Spaces
Recent

Resources
Participants
Collaboration Flows

Account
```

Mobile navigation:

```text
Inbox
Spaces
Participants
Me
```

## Implementation Rules

- Rust API DTOs map into domain models before the UI sees them.
- Demo and Connected data are separate environments with separate query keys and no shared static sidebar list.
- URL is the source of truth for selected space, participant, flow, and inbox filter.
- All visible controls must either work, be disabled with a clear reason, or be removed.
- Composer behavior must match its hint: Enter sends, Shift+Enter inserts a newline, and IME composition must not send.
- Demo messages must appear immediately with delivery state; no input can disappear silently.
- Flow steps use action semantics such as `request_participant`, `approval`, and `post_to_space`; participant selection is via `participantId`.
- Existing quiet Marvis-like visual language is preserved. The refactor changes relationships and journeys first, not the look.
