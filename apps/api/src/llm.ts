import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const digest = (value:string) => createHash('sha256').update(value).digest('hex');
const providerConfig = () => {
  const provider = process.env.AI_PROVIDER ?? (process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : process.env.LLM_LOCAL_URL ? 'local' : 'none');
  if (provider === 'openai' && process.env.OPENAI_API_KEY) return { provider, model:process.env.OPENAI_MODEL ?? 'gpt-4.1-mini' };
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) return { provider, model:process.env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest' };
  if (provider === 'local' && process.env.LLM_LOCAL_URL) return { provider, model:process.env.LLM_LOCAL_MODEL ?? 'local' };
  return null;
};

export async function runPrompt(prisma:PrismaClient, workspaceId:string, purpose:string, prompt:string) {
  const config = providerConfig();
  if (!config) return null;
  const promptHash = digest(`${config.provider}:${config.model}:${purpose}:${prompt}`);
  const cached = await prisma.promptLog.findFirst({ where:{workspaceId,promptHash},orderBy:{createdAt:'desc'} });
  if (cached) return { text:cached.response, provider:config.provider, model:config.model, cached:true };
  let responseText = '';
  if (config.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,temperature:.35,messages:[{role:'system',content:'You assist a business with concise, respectful customer follow-up. Never make threats, invent facts, or imply legal action. Return only the requested text.'},{role:'user',content:prompt}]})});
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const data = await response.json() as any; responseText = data.choices?.[0]?.message?.content ?? '';
  } else if (config.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':process.env.ANTHROPIC_API_KEY!,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model:config.model,max_tokens:500,temperature:.35,system:'You assist a business with concise, respectful customer follow-up. Never make threats, invent facts, or imply legal action. Return only the requested text.',messages:[{role:'user',content:prompt}]})});
    if (!response.ok) throw new Error(`Anthropic request failed (${response.status})`);
    const data = await response.json() as any; responseText = data.content?.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('') ?? '';
  } else {
    const response = await fetch(process.env.LLM_LOCAL_URL!,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:config.model,prompt,stream:false})});
    if (!response.ok) throw new Error(`Local LLM request failed (${response.status})`);
    const data = await response.json() as any; responseText = data.response ?? data.message?.content ?? data.text ?? '';
  }
  responseText = responseText.trim();
  if (!responseText) throw new Error('LLM returned an empty response');
  const responseHash = digest(responseText);
  await prisma.promptLog.create({data:{workspaceId,provider:config.provider,model:config.model,purpose,promptHash,responseHash,prompt,response:responseText,cached:false}});
  return { text:responseText, provider:config.provider, model:config.model, cached:false };
}

export const classifyIntentRuleBased = (text:string) => {
  const lower = text.toLowerCase();
  if (/\b(stop|unsubscribe|cancel|end|quit)\b/.test(lower)) return 'not_interested';
  if (/\b(paid|payment sent|settled)\b/.test(lower)) return 'paid';
  if (/\b(no thanks|not interested|remove me)\b/.test(lower)) return 'not_interested';
  if (/\b(yes|interested|sounds good|let's do it)\b/.test(lower)) return 'interested';
  if (lower.includes('?')) return 'question';
  return 'other';
};
