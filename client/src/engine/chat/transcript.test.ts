import { beforeEach, describe, expect, it } from 'vitest';
import { ConversationTranscript, type TranscriptRagDeps } from './transcript';
import { TRANSCRIPT_SYSTEM, type Character } from '../types';

function char(id: string, firstName: string, lastName: string): Character {
  return { id, firstName, lastName, imagePath: '' } as unknown as Character;
}

const ALICE = char('a', 'Alice', 'Anderson');
const BOB = char('b', 'Bob', 'Baker');
const CAROL = char('c', 'Carol', 'Carter');
const DAVE = char('d', 'Dave', 'Dixon');
const EVE = char('e', 'Eve', 'Evans');

const ALL_CHARACTERS = [ALICE, BOB, CAROL, DAVE, EVE];

type LiveState = { participantIds: string[]; limit: number };

function makeDeps(live: LiveState): TranscriptRagDeps {
  return {
    getRagMessage: async (focusedId, mentionedId, senderId) => `RAG:${focusedId}<-${mentionedId}@${senderId}`,
    getAllScenarioCharacters: () => ALL_CHARACTERS,
    getOffscreenMentionLimit: () => live.limit,
    getCurrentParticipantIds: () => [...live.participantIds],
  };
}

function freshTranscript(participantIds: string[], limit = 2) {
  const live: LiveState = { participantIds: [...participantIds], limit };
  return { transcript: ConversationTranscript.new(makeDeps(live)), live };
}

async function say(transcript: ConversationTranscript, speaker: Character, text: string) {
  const { updatedTranscript } = await transcript.addCharacterChatMessage(text, speaker);
  return updatedTranscript;
}

async function systemContents(transcript: ConversationTranscript, perspectiveId: string): Promise<string[]> {
  return (await transcript.toAIPromptMessages(perspectiveId))
    .filter((message) => message.role === 'system')
    .map((message) => message.content);
}

describe('ConversationTranscript offscreen-mention RAG', () => {
  let transcript: ConversationTranscript;
  let live: LiveState;

  beforeEach(() => {
    ({ transcript, live } = freshTranscript([ALICE.id, BOB.id, CAROL.id]));
  });

  it('does not inject a reminder about a character who is still present', async () => {
    transcript = await say(transcript, CAROL, 'Hello everyone');
    transcript = await say(transcript, ALICE, 'I ran into Carol earlier');

    // Carol is still in the chat, so a reminder about her would be redundant with the system prompt.
    expect(await systemContents(transcript, BOB.id)).toEqual([]);
  });

  it('surfaces a reminder once the mentioned character leaves the chat', async () => {
    transcript = await say(transcript, CAROL, 'Hello everyone');
    transcript = await say(transcript, ALICE, 'I ran into Carol earlier');

    live.participantIds = [ALICE.id, BOB.id];
    transcript = transcript.removeParticipant(CAROL).updatedTranscript;

    expect(await systemContents(transcript, BOB.id)).toContain(`RAG:${BOB.id}<-${CAROL.id}@${ALICE.id}`);
  });

  it("scopes mentions to the focused character's presence window", async () => {
    // Alice mentions Dave (offscreen) before Carol joins.
    transcript = await say(transcript, ALICE, 'Remember Dave from school?');
    transcript = await say(transcript, BOB, 'Yes I do');

    transcript = transcript.addParticipant(CAROL).updatedTranscript;
    live.participantIds = [ALICE.id, BOB.id, CAROL.id];
    transcript = await say(transcript, ALICE, 'Welcome Carol');

    // Alice was present for the Dave mention; Carol was not.
    expect(transcript.getMentionedOffscreenCharacterIds(ALICE.id)).toContain(DAVE.id);
    expect(transcript.getMentionedOffscreenCharacterIds(CAROL.id)).not.toContain(DAVE.id);
  });

  it('caps offscreen mentions at the limit and keeps first-mention order', async () => {
    ({ transcript, live } = freshTranscript([ALICE.id, BOB.id], 1));

    transcript = await say(transcript, ALICE, 'Saw Dave and then Eve yesterday');

    expect(transcript.getMentionedOffscreenCharacterIds(BOB.id)).toEqual([DAVE.id]);

    live.limit = 2;
    expect(transcript.getMentionedOffscreenCharacterIds(BOB.id)).toEqual([DAVE.id, EVE.id]);
  });

  it('injects only one reminder per character even when mentioned repeatedly', async () => {
    ({ transcript, live } = freshTranscript([ALICE.id, BOB.id]));

    transcript = await say(transcript, ALICE, 'Dave said hi');
    transcript = await say(transcript, BOB, 'Dave again?');

    const daveReminders = (await systemContents(transcript, ALICE.id)).filter((content) =>
      content.includes(`<-${DAVE.id}@`)
    );
    expect(daveReminders).toHaveLength(1);
  });

  it('drops a reminder when an edit removes the mention and adds one when it introduces a mention', async () => {
    ({ transcript, live } = freshTranscript([ALICE.id, BOB.id]));

    const { updatedTranscript, newRawMessage } = await transcript.addCharacterChatMessage('Hi Dave', ALICE);
    transcript = updatedTranscript;
    expect(transcript.getMentionedOffscreenCharacterIds(BOB.id)).toEqual([DAVE.id]);

    const edited = await transcript.editMessageById(newRawMessage.id, 'Hi Eve');
    transcript = edited.updatedTranscript;

    expect(transcript.getMentionedOffscreenCharacterIds(BOB.id)).toEqual([EVE.id]);
  });

  it("forgets a deleted message's mentions", async () => {
    ({ transcript, live } = freshTranscript([ALICE.id, BOB.id]));

    const { updatedTranscript, newRawMessage } = await transcript.addCharacterChatMessage('Hi Dave', ALICE);
    transcript = updatedTranscript;

    transcript = transcript.deleteMessageById(newRawMessage.id).updatedTranscript;

    expect(transcript.getMentionedOffscreenCharacterIds(BOB.id)).toEqual([]);
  });

  it('round-trips through serialize/deserialize with no ragDeps and reproduces reminders', async () => {
    transcript = await say(transcript, CAROL, 'Hello everyone');
    transcript = await say(transcript, ALICE, 'I ran into Carol earlier');
    live.participantIds = [ALICE.id, BOB.id];
    transcript = transcript.removeParticipant(CAROL).updatedTranscript;

    // The reminder renders lazily the first time it is surfaced; serializing then captures it.
    expect(await systemContents(transcript, BOB.id)).toContain(`RAG:${BOB.id}<-${CAROL.id}@${ALICE.id}`);

    const serialized = transcript.serialize();

    expect(serialized.ragHelperState).toBeDefined();

    const readOnly = ConversationTranscript.deserialize(serialized);

    expect(await systemContents(readOnly, BOB.id)).toContain(`RAG:${BOB.id}<-${CAROL.id}@${ALICE.id}`);
    expect(readOnly.hasMemoryRaggedCharacter(CAROL.id)).toBe(true);
    expect(readOnly.hasMemoryRaggedCharacter(BOB.id)).toBe(false);
  });

  it('reports co-present speakers (who spoke while a character was present), excluding silent joiners', async () => {
    transcript = await say(transcript, ALICE, 'Opening line');
    transcript = await say(transcript, BOB, 'A reply');

    // Carol joins, then a never-speaking Eve joins.
    transcript = transcript.addParticipant(CAROL).updatedTranscript;
    live.participantIds = [ALICE.id, BOB.id, CAROL.id];
    transcript = await say(transcript, CAROL, 'Carol speaks');
    transcript = transcript.addParticipant(EVE).updatedTranscript;
    live.participantIds = [ALICE.id, BOB.id, CAROL.id, EVE.id];
    transcript = await say(transcript, ALICE, 'Final line');

    const alicesCoPresent = transcript.getCoPresentSpeakerIds(ALICE.id);
    expect(alicesCoPresent).toEqual(expect.arrayContaining([BOB.id, CAROL.id]));
    expect(alicesCoPresent).not.toContain(EVE.id); // joined but never spoke
    expect(alicesCoPresent).not.toContain(ALICE.id); // excludes self

    // Carol only co-existed with speakers after she joined.
    const carolsCoPresent = transcript.getCoPresentSpeakerIds(CAROL.id);
    expect(carolsCoPresent).toContain(ALICE.id);
    expect(carolsCoPresent).not.toContain(BOB.id); // Bob only spoke before Carol joined
  });

  it('does not purge a silent participant who leaves (keeps them in participants, excludes from co-present)', async () => {
    transcript = await say(transcript, ALICE, 'Hello');
    transcript = await say(transcript, BOB, 'Hi');

    // Carol never spoke; she leaves.
    live.participantIds = [ALICE.id, BOB.id];
    transcript = transcript.removeParticipant(CAROL).updatedTranscript;

    expect(transcript.participantInfo.some((p) => p.id === CAROL.id)).toBe(true);
    expect(transcript.getCoPresentSpeakerIds(ALICE.id)).not.toContain(CAROL.id);
  });

  it('does not do RAG processing if we are streaming', async () => {
    ({ transcript, live } = freshTranscript([ALICE.id, BOB.id]));

    const { updatedTranscript } = await transcript.addCharacterChatMessage('Hi Dave', ALICE, {
      isStreaming: true,
    });

    transcript = updatedTranscript;
    expect(transcript.getMentionedOffscreenCharacterIds(BOB.id)).toEqual([]);
  });

  it('keeps presence windows when the visible join/leave announcements are deleted, and forbids deleting a marker', async () => {
    ({ transcript, live } = freshTranscript([ALICE.id, BOB.id]));
    transcript = await say(transcript, ALICE, 'Hello');

    transcript = transcript.addParticipant(CAROL).updatedTranscript;
    live.participantIds = [ALICE.id, BOB.id, CAROL.id];
    transcript = await say(transcript, CAROL, 'Carol here');
    transcript = await say(transcript, BOB, 'Hi Carol');

    live.participantIds = [ALICE.id, BOB.id];
    transcript = transcript.removeParticipant(CAROL).updatedTranscript;

    const coPresentBefore = transcript.getCoPresentSpeakerIds(CAROL.id);
    expect(coPresentBefore).toContain(BOB.id);

    // The UI lets the user delete the visible "joined"/"left" announcements.
    const announcements = transcript.messages.filter(
      (m) => m.message.messageType === 'system_message' && m.message.isPrivateToCharacterId === undefined
    );
    expect(announcements).toHaveLength(2);
    for (const announcement of announcements) {
      transcript = transcript.deleteMessageById(announcement.message.id).updatedTranscript;
    }

    // Presence is unaffected: the hidden markers still bracket Carol's window.
    expect(transcript.getCoPresentSpeakerIds(CAROL.id)).toEqual(coPresentBefore);

    const marker = transcript.messages.find(
      (m) =>
        m.message.messageType === 'system_message' && m.message.isPrivateToCharacterId === TRANSCRIPT_SYSTEM
    );
    expect(marker).toBeDefined();
    expect(() => transcript.deleteMessageById(marker!.message.id)).toThrow();
  });

  it('never leaks presence markers into prompts, the UI list, or the text transcript', async () => {
    ({ transcript, live } = freshTranscript([ALICE.id, BOB.id]));
    transcript = await say(transcript, ALICE, 'Hello');

    transcript = transcript.addParticipant(CAROL).updatedTranscript;
    live.participantIds = [ALICE.id, BOB.id, CAROL.id];
    transcript = await say(transcript, CAROL, 'Carol here');

    live.participantIds = [ALICE.id, BOB.id];
    transcript = transcript.removeParticipant(CAROL).updatedTranscript;

    const prompt = await transcript.toAIPromptMessages(BOB.id);
    expect(prompt.filter((m) => m.content === 'Carol has joined the chat.')).toHaveLength(1);
    expect(prompt.filter((m) => m.content === 'Carol has left the chat.')).toHaveLength(1);

    expect(transcript.getVisibleMessages(BOB.id).some((m) => m.isPresenceMarker())).toBe(false);

    const text = transcript.toTextTranscript({ fromCharacterIdPerspective: BOB.id });
    expect(text.match(/Carol has joined the chat\./g) ?? []).toHaveLength(1);
    expect(text.match(/Carol has left the chat\./g) ?? []).toHaveLength(1);
  });

  it('does not render a reminder until it is actually injected', async () => {
    let renderCount = 0;
    const liveState: LiveState = { participantIds: [ALICE.id, BOB.id, CAROL.id], limit: 2 };
    const deps: TranscriptRagDeps = {
      ...makeDeps(liveState),
      getRagMessage: async (focusedId, mentionedId, senderId) => {
        renderCount += 1;
        return `RAG:${focusedId}<-${mentionedId}@${senderId}`;
      },
    };

    let t = ConversationTranscript.new(deps);
    t = (await t.addCharacterChatMessage('Hello everyone', CAROL)).updatedTranscript;
    t = (await t.addCharacterChatMessage('I ran into Carol earlier', ALICE)).updatedTranscript;

    // Carol is still present, so nothing about her is injected — and nothing is rendered.
    await t.toAIPromptMessages(BOB.id);
    expect(renderCount).toBe(0);

    // Once Carol leaves, her reminder is injected and rendered exactly once.
    liveState.participantIds = [ALICE.id, BOB.id];
    t = t.removeParticipant(CAROL).updatedTranscript;
    await t.toAIPromptMessages(BOB.id);
    expect(renderCount).toBe(1);

    // A second build reuses the cached render.
    await t.toAIPromptMessages(BOB.id);
    expect(renderCount).toBe(1);
  });
});

describe('ConversationTranscript image generation before the latest message', () => {
  it('appends a generated image at the end of the transcript by default', async () => {
    const { transcript } = freshTranscript([ALICE.id, BOB.id]);
    const first = await transcript.addCharacterChatMessage('first', ALICE);
    const second = await first.updatedTranscript.addCharacterChatMessage('second', BOB);

    const imageResult = second.updatedTranscript.addImageMessage('img.png');

    expect(imageResult.updatedTranscript.getRawMessages().map((m) => m.id)).toEqual([
      first.newRawMessage.id,
      second.newRawMessage.id,
      imageResult.newRawMessage.id,
    ]);
  });

  it('inserts a generated image immediately after the specified message', async () => {
    const { transcript } = freshTranscript([ALICE.id, BOB.id]);
    const first = await transcript.addCharacterChatMessage('first', ALICE);
    const second = await first.updatedTranscript.addCharacterChatMessage('second', BOB);

    const imageResult = second.updatedTranscript.addImageMessage('img.png', {
      afterMessageId: first.newRawMessage.id,
    });

    expect(imageResult.updatedTranscript.getRawMessages().map((m) => m.id)).toEqual([
      first.newRawMessage.id,
      imageResult.newRawMessage.id,
      second.newRawMessage.id,
    ]);
  });

  it('truncates getRawConversationMessages up to and including the cutoff message', async () => {
    const { transcript } = freshTranscript([ALICE.id, BOB.id]);
    const first = await transcript.addCharacterChatMessage('first', ALICE);
    const second = await first.updatedTranscript.addCharacterChatMessage('second', BOB);
    const third = await second.updatedTranscript.addCharacterChatMessage('third', ALICE);

    expect(
      third.updatedTranscript
        .getRawConversationMessages({ upToMessageId: second.newRawMessage.id })
        .map((m) => m.id)
    ).toEqual([first.newRawMessage.id, second.newRawMessage.id]);
  });

  it('filters toTextTranscript by perspective when called with the options object', async () => {
    const { transcript, live } = freshTranscript([ALICE.id, BOB.id]);
    let t = await say(transcript, ALICE, 'early one');
    t = await say(t, BOB, 'early two');

    t = t.addParticipant(CAROL).updatedTranscript;
    live.participantIds = [ALICE.id, BOB.id, CAROL.id];
    t = await say(t, CAROL, 'carol arrives');

    expect(t.toTextTranscript()).toContain('early one');

    const carolView = t.toTextTranscript({ fromCharacterIdPerspective: CAROL.id });
    expect(carolView).not.toContain('early one');
    expect(carolView).toContain('carol arrives');
  });

  it('excludes offscreen mentions that occur after the cutoff message', async () => {
    const { transcript } = freshTranscript([ALICE.id, BOB.id]);
    const first = await transcript.addCharacterChatMessage('Saw Dave today', ALICE);
    const t = (await first.updatedTranscript.addCharacterChatMessage('Eve was there too', BOB))
      .updatedTranscript;

    expect(t.getMentionedOffscreenCharacterIds(BOB.id)).toEqual(expect.arrayContaining([DAVE.id, EVE.id]));

    expect(t.getMentionedOffscreenCharacterIds(BOB.id, { upToMessageId: first.newRawMessage.id })).toEqual([
      DAVE.id,
    ]);
  });

  it('focusing an image on a character who joined after the cutoff yields an empty scene transcript', async () => {
    const { transcript, live } = freshTranscript([ALICE.id, BOB.id]);
    const first = await transcript.addCharacterChatMessage('Alice opening', ALICE);
    let t = await say(first.updatedTranscript, BOB, 'Bob reply');

    t = t.addParticipant(CAROL).updatedTranscript;
    live.participantIds = [ALICE.id, BOB.id, CAROL.id];
    t = await say(t, CAROL, 'Carol latest');

    expect(t.getMostRecentSpeakerId()).toBe(CAROL.id);

    const sceneTranscript = t.toTextTranscript({
      fromCharacterIdPerspective: CAROL.id,
      upToMessageId: first.newRawMessage.id,
    });

    expect(sceneTranscript).toBe('(no messages yet)');
  });
});
