import { describe, expect, it } from 'bun:test';
import { createLerno, createSession, defineDocument } from '@medu/lerno';
import { toXapiStatement, xapiExtension, type XapiStatement } from './index';

const actor = { account: { homePage: 'https://lerno.example', name: 'student-1' } };

describe('toXapiStatement', () => {
  it('turns an answered event into a scored statement', () => {
    const statement = toXapiStatement(
      { name: 'answered', at: 0, nodeId: 'q1', payload: { score: 1, maxScore: 2, correct: false } },
      { actor, activityId: 'https://x/lesson' },
    );
    expect(statement.verb.id).toBe('http://adlnet.gov/expapi/verbs/answered');
    expect(statement.result?.score).toEqual({ raw: 1, min: 0, max: 2, scaled: 0.5 });
    expect(statement.result?.success).toBe(false);
    expect(statement.object.id).toBe('https://x/lesson#q1');
  });

  it('marks a completed event as completion', () => {
    const statement = toXapiStatement({ name: 'session.completed', at: 1000 }, { actor, activityId: 'https://x/lesson' });
    expect(statement.verb.id).toBe('http://adlnet.gov/expapi/verbs/completed');
    expect(statement.result?.completion).toBe(true);
  });

  it('falls back to a safe default for an unknown event', () => {
    const statement = toXapiStatement({ name: 'unknown', at: 0 }, { actor, activityId: 'https://x/lesson' });
    expect(statement.verb.id).toBe('http://adlnet.gov/expapi/verbs/experienced');
    expect(statement.result).toBeUndefined();
  });
});

describe('xapiExtension', () => {
  it('sends session events as xAPI statements', () => {
    const statements: XapiStatement[] = [];
    const extension = xapiExtension({ actor, activityId: 'https://x/lesson', send: (statement) => statements.push(statement) });
    const { host, registry } = createLerno({ extensions: [extension] });

    const document = defineDocument({
      id: 'd1',
      type: 'lesson',
      metadata: { title: 't' },
      nodes: [
        {
          id: 'q1',
          type: 'question',
          item: { kind: 'multiple-choice', prompt: 'p', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correct: ['a'] },
        },
      ],
    });

    const session = createSession(document, { host, registry });
    session.answer('q1', { selected: ['a'] });
    session.next();

    expect(statements.some((statement) => statement.verb.id.includes('answered'))).toBe(true);
    expect(statements.some((statement) => statement.result?.completion === true)).toBe(true);
  });
});
