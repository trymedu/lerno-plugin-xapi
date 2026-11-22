import {
  defineExtension,
  type LernoExtension,
  type TelemetryEvent,
  type TelemetrySink,
} from '@medu/lerno';

/**
 * xAPI (Experience API) extension for Lerno telemetry.
 *
 * The core knows nothing about xAPI. This package only implements the
 * `TelemetrySink` contract and an extension that attaches it to the host.
 */

/** Actor identifying the learner, as required by the xAPI statement shape. */
export interface XapiActor {
  /** URL of the home page that issues the account name. */
  account: { homePage: string; name: string };
}

/** A single xAPI statement, reduced to the fields this package emits. */
export interface XapiStatement {
  /** Learner the statement is about. */
  actor: XapiActor;
  /** Verb identifier (IRI) plus its localized display form. */
  verb: { id: string; display: Record<string, string> };
  /** Activity identifier; `#nodeId` is appended when the event carries one. */
  object: { id: string; definition?: { name?: Record<string, string> } };
  /** Score and outcome, present only when the event supplies them. */
  result?: {
    /** Whether the answer was correct. */
    success?: boolean;
    /** Whether the session reached its end. */
    completion?: boolean;
    /** Score with `scaled` normalized to the `0`–`1` range. */
    score?: { scaled: number; raw?: number; min?: number; max?: number };
  };
  /** ISO 8601 timestamp of the event. */
  timestamp: string;
  /** Extension bag reserved for additional context. */
  context?: { extensions?: Record<string, unknown> };
}

/**
 * Mapping from Lerno telemetry event names to xAPI verbs.
 *
 * Events without an entry fall back to `experienced`.
 */
export const XAPI_VERBS: Record<string, { id: string; display: Record<string, string> }> = {
  'session.started': { id: 'http://adlnet.gov/expapi/verbs/initialized', display: { en: 'initialized', tr: 'başlattı' } },
  'session.completed': { id: 'http://adlnet.gov/expapi/verbs/completed', display: { en: 'completed', tr: 'tamamladı' } },
  'node.visited': { id: 'http://adlnet.gov/expapi/verbs/experienced', display: { en: 'experienced', tr: 'deneyimledi' } },
  answered: { id: 'http://adlnet.gov/expapi/verbs/answered', display: { en: 'answered', tr: 'cevapladı' } },
  'branch.chosen': { id: 'http://adlnet.gov/expapi/verbs/interacted', display: { en: 'interacted', tr: 'etkileşti' } },
};

const FALLBACK_VERB = { id: 'http://adlnet.gov/expapi/verbs/experienced', display: { en: 'experienced' } };

/**
 * Reads a numeric field from a telemetry payload.
 *
 * @param payload - Event payload, possibly absent.
 * @param key - Field name to read.
 * @returns The value when it is a number, otherwise `undefined`.
 */
function numberField(payload: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = payload?.[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Reads a boolean field from a telemetry payload.
 *
 * @param payload - Event payload, possibly absent.
 * @param key - Field name to read.
 * @returns The value when it is a boolean, otherwise `undefined`.
 */
function booleanField(payload: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = payload?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

/** Options shared by the telemetry sink and the extension wrapper. */
export interface XapiOptions {
  /** Actor every statement is attributed to. */
  actor: XapiActor;
  /** Root activity address of the lesson or quiz being tracked. */
  activityId: string;
  /** Transport that delivers a statement to an LRS. */
  send: (statement: XapiStatement) => void;
}

/**
 * Converts one telemetry event into an xAPI statement.
 *
 * The verb is looked up by event name; `session.completed` sets
 * `completion`, a boolean payload sets `success`, and a numeric payload
 * produces a score with `scaled` normalized to `0`–`1`.
 *
 * @param event - Emitted telemetry event.
 * @param options - Actor and activity identity of the statement.
 * @returns The statement ready for transport.
 */
export function toXapiStatement(event: TelemetryEvent, options: Pick<XapiOptions, 'actor' | 'activityId'>): XapiStatement {
  const payload = event.payload;
  const statement: XapiStatement = {
    actor: options.actor,
    verb: XAPI_VERBS[event.name] ?? FALLBACK_VERB,
    object: {
      id: `${options.activityId}#${event.nodeId ?? 'session'}`,
      definition: { name: { en: event.name } },
    },
    timestamp: new Date(event.at).toISOString(),
  };

  const raw = numberField(payload, 'score');
  const max = numberField(payload, 'maxScore');
  const correct = booleanField(payload, 'correct');

  const result: NonNullable<XapiStatement['result']> = {};
  if (event.name === 'session.completed') result.completion = true;
  if (typeof correct === 'boolean') result.success = correct;
  if (raw !== undefined) {
    result.score = {
      raw,
      min: 0,
      max: max ?? raw,
      scaled: max && max > 0 ? raw / max : 0,
    };
  }
  if (Object.keys(result).length > 0) statement.result = result;

  return statement;
}

/**
 * Builds a telemetry sink that forwards every event as an xAPI statement.
 *
 * @param options - Actor, activity identity, and transport.
 * @returns A sink compatible with `host.telemetry`.
 */
export function createXapiTelemetry(options: XapiOptions): TelemetrySink {
  return {
    emit: (event) => {
      options.send(toXapiStatement(event, options));
    },
  };
}

/**
 * Extension that adds xAPI delivery without replacing existing telemetry.
 *
 * The previous sink is kept and called first, so installing this extension
 * only widens telemetry; it never drops it.
 *
 * @param options - Actor, activity identity, and transport.
 * @returns An extension to pass to the player.
 */
export function xapiExtension(options: XapiOptions): LernoExtension {
  return defineExtension({
    name: 'xapi',
    setup(_registry, host) {
      const previous = host.telemetry;
      const xapi = createXapiTelemetry(options);
      host.telemetry = {
        emit: (event) => {
          previous.emit(event);
          xapi.emit(event);
        },
      };
    },
  });
}
