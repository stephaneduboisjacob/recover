import { describe, expect, it } from 'vitest';
import { nextWorkflowStep, renderWorkflowTemplate } from './index.js';

describe('workflow engine helpers',()=>{
  it('renders only known merge fields and safely clears unknown fields',()=>{
    expect(renderWorkflowTemplate('Hi {{contactName}} · {{amount}} · {{missing}}',{contactName:'Casey',amount:'42'})).toBe('Hi Casey · 42 · ');
  });
  it('advances with the next step wait and marks the last step complete',()=>{
    const steps=[{channel:'EMAIL',waitMinutes:0},{channel:'SMS',waitMinutes:120}];
    expect(nextWorkflowStep(steps,0)).toEqual({completed:false,nextIndex:1,waitMinutes:120});
    expect(nextWorkflowStep(steps,1)).toEqual({completed:true,nextIndex:2,waitMinutes:0});
  });
});
