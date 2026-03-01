import { GoogleGenerativeAI } from '@google/generative-ai';
import { CSV_TOOL_DECLARATIONS } from './csvTools';

const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || '');

const MODEL = 'gemini-2.0-flash';

const SEARCH_TOOL = { googleSearch: {} };
const CODE_EXEC_TOOL = { codeExecution: {} };

export const CODE_KEYWORDS = /\b(plot|chart|graph|analyz|statistic|regression|correlat|histogram|visualiz|calculat|compute|run code|write code|execute|pandas|numpy|matplotlib|csv|data)\b/i;

// ── YouTube tools (exact names for grading); executed on server via /api/tools/* ──
export const YOUTUBE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description: 'Generate an image from a text prompt. Optionally use an anchor image (passed as anchor_image_id) to guide style or content. Returns image_url (data URL or URL) and mime_type. Use when the user asks to create, draw, or generate an image.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: { type: 'STRING', description: 'Text description of the image to generate.' },
        anchor_image_id: { type: 'STRING', description: 'Optional. ID of an image the user attached (use when user dropped an image for style reference).' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description: 'Plot a numeric metric (e.g. view_count, like_count, comment_count, duration) vs release date for the loaded channel videos. Returns points array and labels for rendering a chart. Use when the user asks for a plot, chart, or trend over time.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric: { type: 'STRING', description: 'Numeric field name: view_count, like_count, comment_count, duration, etc.' },
      },
      required: ['metric'],
    },
  },
  {
    name: 'play_video',
    description: 'Resolve a video from the loaded channel data and return its title, thumbnail, and URL so the user can open it. Query can be "most viewed", "first", "2", or a title keyword. Use when the user asks to play, open, or watch a video.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'e.g. "most viewed", "first", "2", or a word from the video title.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'compute_stats_json',
    description: 'Compute mean, median, std, min, max, count, null_count for a numeric field in the channel JSON. Use when the user asks for stats, average, distribution, or summary of a numeric column.',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: { type: 'STRING', description: 'Numeric field name: view_count, like_count, comment_count, duration, etc.' },
      },
      required: ['field'],
    },
  },
];

let cachedPrompt = null;

async function loadSystemPrompt() {
  if (cachedPrompt) return cachedPrompt;
  try {
    const res = await fetch('/prompt_chat.txt');
    cachedPrompt = res.ok ? (await res.text()).trim() : '';
  } catch {
    cachedPrompt = '';
  }
  return cachedPrompt;
}

// Yields:
//   { type: 'text', text }           — streaming text chunks
//   { type: 'fullResponse', parts }  — when code was executed; replaces streamed text
//   { type: 'grounding', data }      — Google Search metadata
//
// fullResponse parts: { type: 'text'|'code'|'result'|'image', ... }
//
// useCodeExecution: pass true to use codeExecution tool (CSV/analysis),
//                   false (default) to use googleSearch tool.
// Note: Gemini does not support both tools simultaneously.
export const streamChat = async function* (history, newMessage, imageParts = [], useCodeExecution = false) {
  const systemInstruction = await loadSystemPrompt();
  const tools = useCodeExecution ? [CODE_EXEC_TOOL] : [SEARCH_TOOL];
  const model = genAI.getGenerativeModel({
    model: MODEL,
    tools,
  });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        {
          role: 'user',
          parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }],
        },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  const parts = [
    { text: newMessage },
    ...imageParts.map((img) => ({
      inlineData: { mimeType: img.mimeType || 'image/png', data: img.data },
    })),
  ].filter((p) => p.text !== undefined || p.inlineData !== undefined);

  const result = await chat.sendMessageStream(parts);

  // Stream text chunks for live display
  for await (const chunk of result.stream) {
    const chunkParts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of chunkParts) {
      if (part.text) yield { type: 'text', text: part.text };
    }
  }

  // After stream: inspect all response parts
  const response = await result.response;
  const allParts = response.candidates?.[0]?.content?.parts || [];

  const hasCodeExecution = allParts.some(
    (p) =>
      p.executableCode ||
      p.codeExecutionResult ||
      (p.inlineData && p.inlineData.mimeType?.startsWith('image/'))
  );

  if (hasCodeExecution) {
    // Build ordered structured parts to replace the streamed text
    const structuredParts = allParts
      .map((p) => {
        if (p.text) return { type: 'text', text: p.text };
        if (p.executableCode)
          return {
            type: 'code',
            language: p.executableCode.language || 'PYTHON',
            code: p.executableCode.code,
          };
        if (p.codeExecutionResult)
          return {
            type: 'result',
            outcome: p.codeExecutionResult.outcome,
            output: p.codeExecutionResult.output,
          };
        if (p.inlineData)
          return { type: 'image', mimeType: p.inlineData.mimeType, data: p.inlineData.data };
        return null;
      })
      .filter(Boolean);

    yield { type: 'fullResponse', parts: structuredParts };
  }

  // Grounding metadata (search sources)
  const grounding = response.candidates?.[0]?.groundingMetadata;
  if (grounding) {
    console.log('[Search grounding]', grounding);
    yield { type: 'grounding', data: grounding };
  }
};

// ── Function-calling chat for CSV tools ───────────────────────────────────────
// Gemini picks a tool + args → executeFn runs it client-side (free) → Gemini
// receives the result and returns a natural-language answer.
//
// executeFn(toolName, args) → plain JS object with the result
// Returns the final text response from the model.

export const chatWithCsvTools = async (history, newMessage, csvHeaders, executeFn) => {
  const systemInstruction = await loadSystemPrompt();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    tools: [{ functionDeclarations: CSV_TOOL_DECLARATIONS }],
  });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        {
          role: 'user',
          parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }],
        },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  // Include column names so the model can match user intent to exact column names
  const msgWithContext = csvHeaders?.length
    ? `[CSV columns: ${csvHeaders.join(', ')}]\n\n${newMessage}`
    : newMessage;

  let response = (await chat.sendMessage(msgWithContext)).response;

  // Accumulate chart payloads and a log of every tool call made
  const charts = [];
  const toolCalls = [];

  // Function-calling loop (Gemini may chain multiple tool calls)
  for (let round = 0; round < 5; round++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p) => p.functionCall);
    if (!funcCall) break;

    const { name, args } = funcCall.functionCall;
    console.log('[CSV Tool]', name, args);
    const toolResult = executeFn(name, args);
    console.log('[CSV Tool result]', toolResult);

    // Log the call for persistence
    toolCalls.push({ name, args, result: toolResult });

    // Capture chart payloads so the UI can render them
    if (toolResult?._chartType) {
      charts.push(toolResult);
    }

    response = (
      await chat.sendMessage([
        { functionResponse: { name, response: { result: toolResult } } },
      ])
    ).response;
  }

  return { text: response.text(), charts, toolCalls };
};

const API = process.env.REACT_APP_API_URL || '';

// ── YouTube tools: same loop but execute via server API ───────────────────────
export const chatWithYouTubeTools = async (history, newMessage, sessionId) => {
  const systemInstruction = await loadSystemPrompt();
  const model = genAI.getGenerativeModel({
    model: MODEL,
    tools: [{ functionDeclarations: YOUTUBE_TOOL_DECLARATIONS }],
  });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        {
          role: 'user',
          parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }],
        },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });

  let response = (await chat.sendMessage(newMessage)).response;
  const charts = [];
  const toolCalls = [];

  for (let round = 0; round < 5; round++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p) => p.functionCall);
    if (!funcCall) break;

    const { name, args } = funcCall.functionCall;
    let toolResult;
    try {
      const res = await fetch(`${API}/api/tools/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, ...args }),
      });
      toolResult = await res.json();
      if (!res.ok) toolResult = { error: toolResult.error || res.statusText };
    } catch (e) {
      toolResult = { error: e.message };
    }

    toolCalls.push({ name, args, result: toolResult });
    if (toolResult?.points && name === 'plot_metric_vs_time') {
      charts.push({ _chartType: 'metric_vs_time', ...toolResult });
    }

    response = (
      await chat.sendMessage([
        { functionResponse: { name, response: { result: toolResult } } },
      ])
    ).response;
  }

  return { text: response.text(), charts, toolCalls };
};
