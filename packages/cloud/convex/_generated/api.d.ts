/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agent_state from "../agent_state.js";
import type * as attachments from "../attachments.js";
import type * as codex_auth from "../codex_auth.js";
import type * as crons from "../crons.js";
import type * as feedback from "../feedback.js";
import type * as github_auth from "../github_auth.js";
import type * as lib_tools from "../lib/tools.js";
import type * as messages from "../messages.js";
import type * as session_actions from "../session_actions.js";
import type * as sessions from "../sessions.js";
import type * as streaming from "../streaming.js";
import type * as todos from "../todos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agent_state: typeof agent_state;
  attachments: typeof attachments;
  codex_auth: typeof codex_auth;
  crons: typeof crons;
  feedback: typeof feedback;
  github_auth: typeof github_auth;
  "lib/tools": typeof lib_tools;
  messages: typeof messages;
  session_actions: typeof session_actions;
  sessions: typeof sessions;
  streaming: typeof streaming;
  todos: typeof todos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
