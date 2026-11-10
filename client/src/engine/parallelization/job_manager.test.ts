import { describe, expect, it, vi } from 'vitest';
import { ParallelJobManager } from './job_manager.js';

describe('ParallelJobManager', () => {
  it('respects concurrency limit for a parallelism group', async () => {
    const manager = new ParallelJobManager();
    manager.setConcurrencyForGroup('test_group', 2);

    let activeCount = 0;
    let maxActive = 0;

    const createJob = (name: string) => {
      let resolveJob!: () => void;
      const promise = new Promise<void>((r) => {
        resolveJob = r;
      });

      const enqueuePromise = manager.enqueue({
        name,
        parallelismGroup: 'test_group',
        job: async () => {
          activeCount += 1;
          maxActive = Math.max(maxActive, activeCount);
          await promise;
          activeCount -= 1;
        },
      });

      return { resolveJob, enqueuePromise };
    };

    const j1 = createJob('j1');
    const j2 = createJob('j2');
    const j3 = createJob('j3');

    // j1 and j2 should be running, j3 queued
    expect(activeCount).toBe(2);
    expect(maxActive).toBe(2);

    j1.resolveJob();
    await j1.enqueuePromise;

    // After j1 completes, j3 should start
    expect(activeCount).toBe(2);

    j2.resolveJob();
    await j2.enqueuePromise;

    j3.resolveJob();
    await j3.enqueuePromise;

    expect(activeCount).toBe(0);
    expect(maxActive).toBe(2);
  });

  it('serializes jobs with matching self-exclusive tags even when concurrency allows more', async () => {
    const manager = new ParallelJobManager();
    manager.setConcurrencyForGroup('test_group', 5);

    const executionOrder: string[] = [];
    const createExclusiveJob = (name: string, tag: string) => {
      let resolveJob!: () => void;
      const promise = new Promise<void>((r) => {
        resolveJob = r;
      });

      const enqueuePromise = manager.enqueue({
        name,
        parallelismGroup: 'test_group',
        tags: [tag],
        exclusiveWithTags: [tag],
        job: async () => {
          executionOrder.push(`${name}_start`);
          await promise;
          executionOrder.push(`${name}_end`);
        },
      });

      return { resolveJob, enqueuePromise };
    };

    const a1 = createExclusiveJob('A1', 'char_A');
    const a2 = createExclusiveJob('A2', 'char_A');

    // Only A1 should have started, despite concurrency = 5
    expect(executionOrder).toEqual(['A1_start']);

    a1.resolveJob();
    await a1.enqueuePromise;

    // After A1 resolves, A2 starts
    expect(executionOrder).toEqual(['A1_start', 'A1_end', 'A2_start']);

    a2.resolveJob();
    await a2.enqueuePromise;

    expect(executionOrder).toEqual(['A1_start', 'A1_end', 'A2_start', 'A2_end']);
  });

  it('runs jobs with different tags concurrently when capacity allows', async () => {
    const manager = new ParallelJobManager();
    manager.setConcurrencyForGroup('test_group', 2);

    const started: string[] = [];
    const createExclusiveJob = (name: string, tag: string) => {
      let resolveJob!: () => void;
      const promise = new Promise<void>((r) => {
        resolveJob = r;
      });

      const enqueuePromise = manager.enqueue({
        name,
        parallelismGroup: 'test_group',
        tags: [tag],
        exclusiveWithTags: [tag],
        job: async () => {
          started.push(name);
          await promise;
        },
      });

      return { resolveJob, enqueuePromise };
    };

    const a1 = createExclusiveJob('A1', 'char_A');
    const b1 = createExclusiveJob('B1', 'char_B');
    const a2 = createExclusiveJob('A2', 'char_A');

    // Both A1 and B1 start concurrently because they have different tags
    expect(started).toEqual(['A1', 'B1']);

    a1.resolveJob();
    await a1.enqueuePromise;

    // Now A2 can start because A1 is done
    expect(started).toEqual(['A1', 'B1', 'A2']);

    b1.resolveJob();
    await b1.enqueuePromise;

    a2.resolveJob();
    await a2.enqueuePromise;
  });

  it('handles cross-tag mutual exclusion bidirectionally', async () => {
    const manager = new ParallelJobManager();
    manager.setConcurrencyForGroup('test_group', 5);

    const started: string[] = [];

    // Case 1: Job with exclusiveWithTags starts first; job with matching tag must wait
    let resolveText!: () => void;
    const textPromise = new Promise<void>((r) => {
      resolveText = r;
    });

    const textJob = manager.enqueue({
      name: 'TextJob',
      parallelismGroup: 'test_group',
      tags: ['text'],
      exclusiveWithTags: ['image'],
      job: async () => {
        started.push('Text');
        await textPromise;
      },
    });

    let resolveImage!: () => void;
    const imagePromise = new Promise<void>((r) => {
      resolveImage = r;
    });

    const imageJob = manager.enqueue({
      name: 'ImageJob',
      parallelismGroup: 'test_group',
      tags: ['image'],
      job: async () => {
        started.push('Image');
        await imagePromise;
      },
    });

    expect(started).toEqual(['Text']);

    resolveText();
    await textJob;

    // After Text finishes, Image can run
    expect(started).toEqual(['Text', 'Image']);

    resolveImage();
    await imageJob;
  });

  it('invokes onStart when job transitions from queued to running', async () => {
    const manager = new ParallelJobManager();
    manager.setConcurrencyForGroup('test_group', 1);

    const onStart1 = vi.fn();
    const onStart2 = vi.fn();

    let resolve1!: () => void;
    const p1 = new Promise<void>((r) => {
      resolve1 = r;
    });

    let resolve2!: () => void;
    const p2 = new Promise<void>((r) => {
      resolve2 = r;
    });

    const job1 = manager.enqueue({
      name: 'job1',
      parallelismGroup: 'test_group',
      onStart: onStart1,
      job: async () => {
        await p1;
      },
    });

    const job2 = manager.enqueue({
      name: 'job2',
      parallelismGroup: 'test_group',
      onStart: onStart2,
      job: async () => {
        await p2;
      },
    });

    // job1 started immediately, job2 is queued
    expect(onStart1).toHaveBeenCalledTimes(1);
    expect(onStart2).not.toHaveBeenCalled();

    resolve1();
    await job1;

    // After job1 completes, job2 starts and onStart2 is called
    expect(onStart2).toHaveBeenCalledTimes(1);

    resolve2();
    await job2;
  });
});
