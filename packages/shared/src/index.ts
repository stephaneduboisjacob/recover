import { z } from 'zod';

export const opportunityStatus = z.enum(['NEW', 'DRAFTED', 'AWAITING_APPROVAL', 'ACTIVE', 'RECOVERED', 'DISMISSED']);
export const sourceType = z.enum(['QUOTE', 'MISSED_CALL', 'INVOICE', 'SUBSCRIPTION', 'CART', 'LEAD']);
export const channelType = z.enum(['EMAIL', 'SMS', 'VOICE']);
export const roleType = z.enum(['OWNER', 'ADMIN', 'MEMBER']);

export type OpportunityStatus = z.infer<typeof opportunityStatus>;
export type SourceType = z.infer<typeof sourceType>;
export type ChannelType = z.infer<typeof channelType>;

export const signupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(200),
  password: z.string().min(12).max(128),
  workspaceName: z.string().min(2).max(100)
});

export const opportunityActionSchema = z.object({
  action: z.enum(['approve', 'dismiss', 'recover', 'draft', 'send']),
  note: z.string().max(1000).optional()
});

export const money = (value: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

export const publicHeadline = { found: 84219, recovered: 17430 } as const;

export type WorkflowStepDefinition = { channel:string; waitMinutes?:number; requireApproval?:boolean; template?:string };
export const renderWorkflowTemplate = (template:string, fields:Record<string,string>) => template.replace(/{{(\w+)}}/g,(_,key:string)=>fields[key] ?? '');
export const nextWorkflowStep = (steps:WorkflowStepDefinition[], currentIndex:number) => {
  const nextIndex=currentIndex+1;
  if(nextIndex>=steps.length)return {completed:true,nextIndex,waitMinutes:0};
  return {completed:false,nextIndex,waitMinutes:Math.max(0,Number(steps[nextIndex].waitMinutes??0))};
};
