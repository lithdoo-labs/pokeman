import type { Frame, SubsystemScope } from "@loomrealm/subsystem";
import type { JsonObject } from "@loomrealm/wire";

export const DEFAULT_RPG_DIALOGUE_Z_INDEX = 2_147_483_646;

export interface RPGDialogueOptionsV0 {
  readonly cancelable?: boolean;
  readonly zIndex?: number;
}

export interface RPGDialogueControls {
  confirm(): void;
  previous(): void;
  next(): void;
  history(): void;
  cancel(): void;
}

export interface ConversationChoiceV0 {
  readonly choiceId: string;
  readonly text: string;
  readonly enabled?: boolean;
  readonly data: JsonObject;
}

export interface ConversationContentV0 {
  readonly speakerName?: string;
  readonly text: string;
  readonly choices: readonly ConversationChoiceV0[];
  readonly data: JsonObject;
}

export interface DialogueCharacterV0 {
  readonly characterId: string;
  readonly displayName?: string;
  readonly active: boolean;
  readonly data: JsonObject;
}

export interface DialogueHistoryEntryV0 {
  readonly entryId: string;
  readonly speakerName?: string;
  readonly text: string;
}

export interface ConversationRequestV0 {
  readonly conversation: ConversationContentV0;
  readonly characters: readonly DialogueCharacterV0[];
}

export type ConversationResultV0 =
  | { readonly type: "submitted"; readonly choiceId?: string }
  | { readonly type: "cancelled" };

export type RPGDialogueScope = SubsystemScope;
export type RPGDialogueFrame = Frame;
