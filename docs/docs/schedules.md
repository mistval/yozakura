---
title: Schedule System
sidebar_position: 6
description: How Yozakura's schedule system controls character movement.
keywords:
  - yozakura schedule
  - ai schedule
  - persistent npc memory
  - character relationships
  - generative agents
  - ai gossip
  - narrative momentum
---

The schedule system allows you to define groups of characters and schedule where they are supposed to be at any given time. This can help enable a variety of different concepts such as: characters with jobs they go to on weekdays, characters with parents whose homes they visit on Sunday, characters who live in different towns from each other.

## How it fits together

There are three pieces, and they build on each other:

- **Zones** are named sets of locations on the map, such as "The Cafe", "Downtown", or "Alice's House". A zone can be a single location or a whole cluster of them.
- **Groups** are named sets of characters, such as "Baristas" or "The Smith Family". A character can belong to more than one group.
- A **schedule** belongs to a group and says which zone its members should be in at any given time.

## Step 1: Create zones

Open the map and switch to the **Zones** tab. Add a zone with the **+ Add Zone** button, give it a name, and then click locations on the map graph to add them to the zone or remove them. Locations that belong to the selected zone are highlighted.

![Placeholder: the Zones tab, with a zone selected and several locations highlighted on the map graph](/img/schedule-zones.png)

## Step 2: Create a group and add members

Open the Character Overview and switch to the **Character Groups** tab. Use **+ Add Group** to create a group and give it a name. Then, on the **Group members** sub-tab, click the characters that should belong to the group. Click them again to remove.

![Placeholder: the Character Groups tab, with a group selected and a few members highlighted in the members grid](/img/schedule-groups.png)

## Step 3: Build the schedule

With a group selected, switch to its **Schedule** sub-tab.

Schedules run on turns, the same unit of time the rest of the scenario advances on. By default a day is eight turns, so set **Length in turns** to 8 for a single-day schedule that repeats every day, or 56 (8 x 7) for a week-long schedule. Once the scenario passes the last turn, the schedule loops back to the beginning. (The number of turns per day can differ if you have changed the Temporal Context in Scenario Settings.)

The schedule is a timeline made of **schedule segments**. Each segment covers a span of turns and names one zone the group's members should be in during that span, along with how they should get there. To add a segment, click **➕ Add Schedule Segment** or double-click an empty spot on the timeline. Drag a segment to move it, drag its edges to resize it, scroll to zoom in and out, and right-click a segment to remove it. A vertical **now** line marks where the current turn falls on the timeline.

Click a segment to edit its details:

- **Allowed zone**: the zone members should be in while this segment is active.
- **Movement policy**: how members travel to the zone (see below).
- **Start turn** and **End turn**: the span the segment covers (this is another way to control the segment size and location, in addition to clicking/dragging).
- **Reason** (optional): free text explaining why the character is there.

Segments are allowed to overlap. When more than one of a character's segments is active at the same time, they may be in any of those zones, and they will head toward the nearest one. During any stretch of turns with no active schedule segment, members move randomly.

![Placeholder: the schedule timeline with a few segments, the now marker, and a segment's detail panel open](/img/schedule-editor.png)

## Movement policies

Each schedule segment has a movement policy that controls how a member gets to the zone when the segment becomes active:

- **Teleport**: the character instantly warps to the zone, and still gets to act on the same turn.
- **Jump**: the character instantly warps to the zone, but warping uses up their turn.
- **Rush**: the character walks toward the zone one location at a time and never stops to start a conversation along the way. Other characters can still start conversations with them.
- **Casual**: the character walks toward the zone one location at a time, occasionally stopping to start conversations on the way, at the rate set in Behavior Settings.

## The reason field

The optional **Reason** on a schedule segment is a short note completing the thought "They are here because…", for example "they work the morning shift here". While the schedule is keeping a character in that zone (or traveling towards it), the reason is added to their system prompt so they can act in character. During play it reads as something like "Alice is currently here because **they work the morning shift**", or while she is still on her way, "Alice is currently moving towards the Cafe because **they work the morning shift**". Leave it blank and no reason is mentioned.

## Private zones

A zone can be marked **private to groups**. When editing a zone, select one or more groups under "Private to groups", and only members of those groups will be allowed to enter that zone. Private zones are marked with a 🔒 in the zone list.

This works alongside schedules. If a zone is private, it stays off-limits to everyone outside the listed groups, even if some other group's schedule would otherwise send them there. A character who belongs to any one of a private zone's groups is allowed in.

## Schedules for the user

For AI-controlled characters, schedules are followed automatically according to the movement policy.

The user character is also _supposed_ to follow their schedule, but isn't forced to. If your character belongs to a group with a schedule, the move buttons highlight where the schedule suggests you go, in the following conditions:

1. If you're scheduled to be somewhere else with `teleport`, `jump`, or `rush` policy, the suggested move button(s) are outlined in red (in the default UI theme). For teleport and jump policies, the final destination will appear as a button even if it's far away.
2. If you're scheduled to be somewhere else with `casual` policy, the suggested move button(s) are outlined in yellow.
3. If you're already in your schedule zone, the buttons that will keep you there (including the wait button) get a magenta outline.
4. Any private zones that you're not supposed to enter will have a lock icon.

You can ignore these suggestions if you wish to.

![Placeholder: the location panel during play, showing highlighted suggested moves and a locked location](/img/schedule-suggestions.png)

## Global versus scenario zones

Zones can be edited in two places. Inside a scenario, the **Zones** tab edits zones for that scenario. In the global Map Editor, you edit zones attached to the map itself, which are shared by every scenario that uses that map.

When you edit a global zone from inside a scenario, Yozakura makes a scenario-specific copy and edits that, leaving the original global zone untouched. If you later want to keep the change, the scenario zone editor offers **Apply to global map** to push your edits back onto the shared zone, or **Revert to global** to discard the scenario copy and go back to the shared version. Note that "private to groups" is a scenario-level setting and is dropped when you apply a zone to the global map.
